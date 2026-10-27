# Architecture

## Services and ownership
| Component | Port | Owns | Talks to |
|---|---|---|---|
| web (React SPA, nginx in Docker) | 5173 | — | both services (browser → REST, CORS allow-list) |
| catalog-service | 3001 | `threadiq_catalog`: products(+variants), stockmovements | MongoDB |
| insights-service | 3002 | `threadiq_sales`: sales | MongoDB, catalog-service (HTTP) |
| mongo | 27017 (internal) | both databases | — |

Neither service reads the other's collections. The Insights Service uses `CatalogClient` (`src/clients/catalog.client.ts`): `getProduct`, `deductStock`, `restoreStock`, `getSnapshot`, `getSummary`. It is an interface so tests inject a fake; the HTTP implementation has a timeout (`CATALOG_TIMEOUT_MS`), maps 5xx/timeouts/refused connections to `503 CATALOG_UNAVAILABLE`, 404/409 pass through, anything else to `502 CATALOG_BAD_RESPONSE`.

## Layering (each service)
`routes → validators (zod) → controllers → services (business rules) → repositories → Mongoose models`. Errors are thrown as `AppError` or ZodError and converted once by `middleware/error.ts` (no stack traces; unknown errors become a generic 500 and are logged).

## Stock integrity
* Variant stock lives inside the product document. A change is **one** `findOneAndUpdate` with filter `variants: {$elemMatch: {_id, stock: {$gte: needed}}}` and `$inc` on the positional variant → atomic, so concurrent deductions cannot go negative (tested with 10 parallel requests).
* Every change writes a `StockMovement` (receipt/adjustment/sale/return, signed quantity, balanceAfter, reason). If the movement insert fails the stock change is undone. `PATCH /products` rejects stock fields.
* Sale deductions carry a `reference` (the sale idempotency key). A partial unique index `(reference, variantId)` for non-reversed `sale` movements makes the deduction idempotent. A multi-line deduction that fails halfway rolls back the lines it applied.

## Sale workflow and failure handling
1. `Idempotency-Key` (header or body) required; if a sale with the key exists → return it (200, `Idempotent-Replay: true`).
2. Fetch each product from the catalog; verify product/variant exist, product active, stock sufficient (advisory check). Unit price = catalog `sellingPrice`; client-sent prices/totals are ignored.
3. Compute `subtotal`, validate `discount ≤ subtotal`, `total = subtotal − discount` (rounded to 2 dp).
4. `POST /inventory/sale-deductions` (authoritative, atomic per variant). 409 → `INSUFFICIENT_STOCK`; catalog down → 503, nothing stored.
5. Insert the sale (unique `saleNumber`, `idempotencyKey`). A concurrent twin with the same key returns the winner's sale.
6. If the insert fails: `POST /inventory/sale-restorations` marks the deduction movements `reversed`, writes `return` movements and puts the stock back; the client gets `500 SALE_PERSISTENCE_FAILED` with `details.compensated`.

**Limitations:** not a distributed transaction. A crash after step 4 and before step 5/6 leaves stock deducted without a sale until the same request is retried (idempotent, so safe) or an operator restores it manually; there is no reconciler job. A failed compensation is logged loudly and reported as `compensated:false`.

## Analytics definitions (all in `src/analytics/calculations.ts`, defaults in `config/analytics.ts`)
* **gross sales** = Σ line totals; **discounts** = Σ order discounts; **revenue** = gross − discounts (= Σ sale totals); **AOV** = revenue / orders (0 if none).
* Category/product revenue = line total × (order total / order subtotal), so discounts are spread proportionally and categories add up to revenue.
* Ranges are UTC; a date-only `to` includes the whole day; default = last 30 days.
* Archived products are excluded from active catalogue counts and from trend/slow/restock, but their sales remain in revenue figures.

### Trend score (0–100)
Windows: **recent** = last N days, **previous** = the N days before (N = 14).
```
unitsPerDay = recentUnits / N
velocity = clamp(unitsPerDay / baseline * 100)               baseline = 2 units/day
growth   = clamp(50 + 50*(recent-previous)/previous)         previous > 0   (−100% → 0, flat → 50, +100% → 100)
         = 100  if previous = 0 and recent > 0 ("new demand");  0 if both are 0
cover    = totalStock / unitsPerDay                           (none when unitsPerDay = 0)
urgency  = clamp(100 * (1 − cover / 30))                      0 when there is no demand
score    = clamp(0.60*velocity + 0.25*growth + 0.15*urgency)
```
`dataStatus`: `no_sales` (both windows empty), `insufficient_history` (product younger than 2N days), else `ok`. Labels: ≥70 hot, ≥50 rising, ≥25 steady, else cooling; `inactive` if no sales. This is an explainable heuristic — **not** machine learning or a validated forecast. Every row returns its components and a text explanation.

### Slow-moving (look-back 30 days)
Order of rules: stock 0 → `out_of_stock` (counted, not "slow"); product age < 30 d → `too_new` (never flagged); never sold → `no_sales_history`; sold before but none in the period → `no_recent_sales`; ≤ 0.1 units/day (≤ 3 per 30 d) → `low_velocity`; otherwise fine.

### Restock recommendations (per variant, window 30 d)
```
avgDaily  = unitsInWindow / 30         cover = stock / avgDaily (null if avgDaily = 0)
flag when stock ≤ reorderThreshold OR cover < 14 days
target    = ceil(unitsInWindow*30/30) + reorderThreshold   (30 days of demand + safety stock)
            or 2 × reorderThreshold when there were no recent sales (labelled heuristic)
suggested = max(0, target − stock)
priority  = critical (stock 0) | high (cover < 7 d) | medium
```
All thresholds can be overridden by query parameters or `.env`. Output is labelled as an estimate.

## Security & operations
Helmet, explicit CORS allow-list, rate limiting, strict zod validation of body/query/params (including ObjectIds, so `?q[$ne]=x` is rejected), regex-escaped search, 100 KB body limit, structured Pino logs, graceful shutdown on SIGTERM/SIGINT, `/health` endpoints, non-root containers, `init: true`. **No authentication** in this MVP.
