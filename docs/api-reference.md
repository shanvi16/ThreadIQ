# API reference

Interactive docs (OpenAPI/Swagger UI): `http://localhost:3001/api-docs`, `http://localhost:3002/api-docs` (raw JSON at `/api-docs.json`).

**Conventions** — base path `/api/v1`. Success: `{ "data": … }`, lists add `"meta": {page, limit, total, totalPages}`. Errors: `{ "error": { "code", "message", "details?" } }`. Codes: `VALIDATION_ERROR`/`INVALID_JSON` (400), `NOT_FOUND`/`PRODUCT_NOT_FOUND`/`VARIANT_NOT_FOUND` (404), `DUPLICATE_KEY`/`DUPLICATE_VARIANT`/`INSUFFICIENT_STOCK`/`PRODUCT_ARCHIVED` (409), `RATE_LIMITED` (429), `SALE_PERSISTENCE_FAILED` (500), `CATALOG_UNAVAILABLE` (503), `CATALOG_BAD_RESPONSE` (502). Ids are 24-hex ObjectIds.

## Catalog Service — :3001
| Method & path | Purpose |
|---|---|
| `GET /health` | status + database state |
| `GET /products?page&limit&q&category&size&color&status=active\|archived\|all&sortBy=name\|createdAt\|updatedAt\|sellingPrice&order` | list/search/filter/sort/paginate |
| `POST /products` | create with `variants[]` (initial stock → `receipt` movements) → 201 |
| `GET /products/:id` | details |
| `PATCH /products/:id` | metadata only (`name, brand, category, description, sellingPrice, costPrice, status`); stock fields rejected |
| `DELETE /products/:id` | **archive** (soft delete); restore with `PATCH {status:"active"}` |
| `POST /products/:id/variants` | add variant |
| `PATCH /products/:id/variants/:variantId` | `{reorderThreshold}` |
| `GET /inventory/low-stock?level=all\|low\|out&page&limit` | variants at/below threshold (`low`) or 0 (`out`) |
| `GET /inventory/movements?productId&variantId&type&from&to&page&limit` | movement history |
| `GET /inventory/summary` | active products, units, value at cost, low/out counts, per-category |
| `GET /inventory/snapshot?status=active\|all` | flat per-variant rows (used by Insights) |
| `POST /inventory/receipts` | `{productId, variantId, quantity ≥1, reason?}` |
| `POST /inventory/adjustments` | `{productId, variantId, quantityChange ≠0, reason}`; 409 if it would go below 0 |
| `POST /inventory/sale-deductions` | internal: `{reference, items[{productId, variantId, quantity}]}`; idempotent per reference, all-or-nothing |
| `POST /inventory/sale-restorations` | internal compensation: `{reference, reason?}`; idempotent |

Product example response (abridged):
```json
{"data":{"id":"…","name":"Linen Camp Shirt","sku":"SH-LINEN-01","category":"Shirts","sellingPrice":1899,"costPrice":700,"status":"active",
 "variants":[{"id":"…","sku":"SH-LINEN-01-M-SAG","size":"M","color":"Sage","stock":24,"reorderThreshold":6,"stockLevel":"in_stock"}],
 "totalStock":24,"lowStockVariants":0,"outOfStockVariants":0}}
```
Insufficient stock: `409 {"error":{"code":"INSUFFICIENT_STOCK","message":"Insufficient stock for … 4 available, 5 requested","details":{"available":4,"requested":5,…}}}`

## Sales & Insights Service — :3002
| Method & path | Purpose |
|---|---|
| `GET /health` | status |
| `GET /sales?page&limit&from&to&q` | sales, newest first (`from`/`to`: `YYYY-MM-DD` or ISO) |
| `POST /sales` | record a sale (below) |
| `GET /sales/:id` | sale details |
| `GET /analytics/overview?from&to` | revenue, grossSales, discounts, salesCount, unitsSold, averageOrderValue + inventory KPIs (`inventoryAvailable:false` if catalog is down) |
| `GET /analytics/revenue-trend?from&to&interval=day\|week` | zero-filled points `{date, revenue, orders, units}` |
| `GET /analytics/category-performance?from&to` | revenue/units per category + current stock |
| `GET /analytics/top-products?from&to&limit&sortBy=units\|revenue` | best sellers |
| `GET /analytics/slow-moving?days&limit&status` | slow products + summary counts |
| `GET /analytics/trend-scores?windowDays&limit&category` | 0–100 score with components & explanation |
| `GET /analytics/restock-recommendations?windowDays&coverDays&targetDays&priority&limit` | per-variant suggestions (estimates) |

### `POST /sales`
```http
POST /api/v1/sales
Idempotency-Key: 0b5c3c1e-6f8f-4a74-a1d0-5ac3e9a1e001      (or "idempotencyKey" in the body)
{"items":[{"productId":"…","variantId":"…","quantity":2}],"discount":100}
```
`201` `{data: Sale, meta:{replayed:false}}`; replay of the same key → `200` with `Idempotent-Replay: true`. Prices/totals in the body are ignored; the server computes `unitPrice`, `lineTotal`, `subtotal`, `total = subtotal − discount`. Errors: 400 (validation, `INVALID_DISCOUNT`), 404 (unknown product/variant), 409 (`INSUFFICIENT_STOCK`, `PRODUCT_ARCHIVED`), 500 `SALE_PERSISTENCE_FAILED` (`details.compensated`), 503 `CATALOG_UNAVAILABLE` (nothing recorded).

Sale: `{id, saleNumber:"TIQ-YYYYMMDD-XXXXXX", items[{productId, variantId, sku, productSku, productName, category, size, color, quantity, unitPrice, lineTotal}], unitsSold, subtotal, discount, total, createdAt}`.
