# ThreadIQ — concepts and core logic explained

This document explains *why* the code is built the way it is and points to the exact files. Read it top to bottom before a viva.

## 1. Big picture
```
Browser (React SPA) ──REST──► Catalog Service  ──► MongoDB: threadiq_catalog
        │                         ▲
        └──REST──► Insights Service ┘ (HTTP calls)  ──► MongoDB: threadiq_sales
```
* **Catalog Service** = "what we have": products, variants, stock, stock movements.
* **Insights Service** = "what we sold and what it means": sales + analytics. When it needs product or stock data it **asks the Catalog Service over HTTP**; it never reads the catalog database.
* **Frontend** only talks to the two REST APIs.

### Why microservices here?
Each service has one responsibility, its own database and its own deploy unit. Benefits: clear ownership, independent scaling/failure. Costs: no single database transaction across services, so we need idempotency and compensation (§5). This trade-off is the core learning point of the project.

## 2. Core concepts
| Concept | Where / how it is used |
|---|---|
| **CRUD** | Products: create (`POST`), read (`GET`), update (`PATCH`), delete = **archive** (`DELETE` sets `status: archived`) so old sales stay valid. |
| **REST** | Nouns + verbs, status codes (201/400/404/409/503), JSON envelope `{data, meta}` / `{error}`, versioned `/api/v1`, pagination metadata. |
| **Validation (Zod)** | `validators/*.ts` in both services validate body, query and path params *before* any logic runs; the frontend uses the same idea in forms (React Hook Form + Zod). |
| **Layered architecture** | `routes → validators → controllers → services → repositories → models`. Controllers are thin; business rules live in services; DB queries live in repositories. |
| **Central error handling** | `middleware/error.ts` turns `AppError`, `ZodError`, Mongo duplicate-key (11000), bad JSON etc. into consistent JSON; unknown errors become a generic 500 (no stack trace leaks). |
| **MongoDB document model** | Variants are **embedded** in the product document → one atomic update changes a variant's stock. Sales **snapshot** product name/price so history never changes. |
| **Indexes** | Unique `sku`, unique `variants.sku` (partial), category/status, sale `saleNumber`/`idempotencyKey` unique, `createdAt` for date queries. |
| **Aggregation pipeline** | `analytics.repository.ts`: `$match → $unwind → $group → $sort` for totals, daily revenue, category and product performance. |
| **Docker** | Image = recipe/snapshot (multi-stage Dockerfile); container = running instance. Data lives in a **named volume**, so it survives container removal. |
| **Docker Compose** | One file defines services, network, volume, health checks and start order. Containers reach each other by **service name** (`mongo`, `catalog-service`), never `localhost`. |
| **npm workspaces** | One root `package.json` + lockfile, packages `@threadiq/*`; Docker builds use `npm ci -w <package>` so each image installs only what it needs. |
| **TanStack Query** | Frontend data fetching/caching; after a mutation we **invalidate** related queries so every screen refreshes. |

## 3. Stock integrity (most important logic)
File: `services/catalog-service/src/repositories/product.repository.ts` (`changeStock`) and `services/inventory.service.ts`.

**Problem:** two cashiers sell the last shirt at the same moment → naive "read stock, check, write stock" oversells.

**Solution:** do the check and the change in *one* atomic database operation:
```ts
Product.findOneAndUpdate(
  { _id, variants: { $elemMatch: { _id: variantId, stock: { $gte: needed } } } },   // condition
  { $inc: { 'variants.$.stock': delta } },                                           // change
  { new: true })
```
If the condition fails, nothing is modified and the result is `null` → we explain why (404 / archived / `INSUFFICIENT_STOCK`). Test: 10 parallel requests for 4 units → exactly 4 succeed.

**Audit trail:** every change also writes a `StockMovement` (type, signed quantity, `balanceAfter`, reason, reference). If the movement insert fails, the stock change is undone. Normal product updates cannot touch stock (`PATCH` rejects stock fields) — stock changes only through receipts, adjustments and sales.

## 4. Idempotent stock deduction
A sale deducts stock with a `reference` (the sale's idempotency key). A **partial unique index** on movements `(reference, variantId)` for non-reversed `sale` movements guarantees a reference can deduct a variant only once. Replaying the same request returns "already applied" instead of deducting again. Multi-line deductions are all-or-nothing: if line 2 fails, line 1 is rolled back.

## 5. The sale workflow and why it is not a transaction
File: `services/insights-service/src/services/sale.service.ts`.
```
1 replay? (idempotency key already has a sale)  → return that sale (HTTP 200)
2 fetch each product from Catalog, check exists/active/variant/stock; take price from catalog
3 compute subtotal, discount check, total (server-side; client totals are ignored)
4 Catalog: deduct stock (atomic, idempotent)           ← can fail: 409 / 503, nothing saved
5 save the sale in the sales DB                        ← can fail
6 if 5 fails → Catalog: restore stock (compensation)   ← "undo" step
```
Two different databases (and services) cannot share one transaction, so this is a mini **saga**: do step A, then B, and if B fails run a compensating action for A. The **idempotency key** makes any retry safe: a retry with the same key never deducts twice and never creates a second sale. Honest limitation: if the service dies between steps 4 and 5, stock stays deducted until the request is retried (documented, no reconciler job).

The frontend generates one key per sale attempt (`lib/ids.ts`), sends it as `Idempotency-Key`, keeps it after network/5xx errors (safe retry), and makes a new one after a definitive 4xx rejection.

## 6. Talking to another service safely
`clients/catalog.client.ts`: a small HTTP client with a **timeout** (AbortController), error mapping (down/timeout/5xx → `503 CATALOG_UNAVAILABLE`, 404/409 pass through, garbage → `502`). It is behind an **interface**, so tests inject a fake instead of a real service. Dashboard analytics treat inventory as *best effort*: if Catalog is down, sales KPIs still render with a warning.

## 7. Analytics definitions
* **gross sales** = Σ line totals; **discounts** = Σ order discounts; **revenue** = gross − discounts; **AOV** = revenue ÷ orders (0 if no orders).
* **Category revenue** spreads an order's discount proportionally over its lines (`line × total/subtotal`) so categories add up to revenue.
* **Revenue trend** is aggregated by UTC day, then **zero-filled** in code so charts have no gaps; weekly buckets start on Monday.
* All date ranges are UTC; a date-only `to` means "end of that day".

### Trend score (`analytics/calculations.ts → computeTrendScore`)
```
velocity = clamp(unitsPerDay / baseline(2) × 100)                 weight 60%
growth   = clamp(50 + 50 × (recent − previous)/previous)           weight 25%   (new demand = 100, both empty = 0)
urgency  = clamp(100 × (1 − stockCoverDays/30))                    weight 15%   (no demand = 0)
score    = clamp(0.60·velocity + 0.25·growth + 0.15·urgency)
```
Windows: last 14 days vs the 14 before. Every result carries its components, a text explanation and a `dataStatus` (`no_sales`, `insufficient_history`, `ok`). **Limits:** hand-picked weights, tiny windows, no seasonality or statistics → a transparent heuristic, **not** machine learning.

### Slow-moving (`classifySlowMoving`)
Rules in order: no stock → *out of stock* (not slow) · younger than 30 days → *too new* (never flagged) · never sold → *no sales history* · none in period → *no recent sales* · ≤ 0.1 units/day → *low velocity*.

### Restock (`computeRestock`)
`avgDaily = units/30`, `cover = stock/avgDaily` (null when avgDaily = 0 — division by zero avoided), flagged if `stock ≤ reorderThreshold` or `cover < 14`; `target = ceil(30 days of demand) + reorderThreshold`; `suggested = max(0, target − stock)`; priority critical/high/medium. Labelled as an estimate.

These three are **pure functions** (no database), which is why they are easy to unit-test with exact numbers.

## 8. Security and robustness
Helmet (security headers) · CORS allow-list · rate limiting · strict validation (ObjectId regex, so `?q[$ne]=x` operator injection is rejected) · escaped regex for search · 100 KB body limit · structured logs (Pino) · graceful shutdown on SIGTERM (finish requests, close DB) · `init: true` + non-root containers · `/health` endpoints used by Docker health checks. **No authentication** in this MVP (documented).

## 9. Frontend structure
```
apps/web/src
  app/            NotFoundPage
  components/     ui kit (Button, Modal, Field, Badge, Toast, states…), layout/AppShell, VariantPicker
  features/       dashboard | products | inventory | sales | insights   (each: api.ts hooks + pages)
  lib/            http client (ApiError), format (₹, dates), dateRange, ids
  types/api.ts    types mirroring the REST contract
```
* `lib/http.ts` — one fetch wrapper per service; converts API errors to `ApiError` with readable messages (shown in toasts).
* `features/*/api.ts` — TanStack Query hooks; mutations call `invalidateCatalogData` so dashboard, product pages, alerts and analytics refresh.
* Forms: React Hook Form + Zod resolver; messages shown next to fields; `aria-*` wiring in `components/ui/Field.tsx`.
* Every list handles **loading (skeleton), empty, error (retry)** through `QueryBoundary`.
* `ConfirmDialog` guards destructive actions (archive). `Modal` handles Esc, focus trap, focus return.
* Responsive sidebar (collapsible on desktop, drawer on mobile).

## 10. Seed data (`scripts/seed.ts`)
A seeded pseudo-random generator (mulberry32) + per-product daily demand rates `[old, previous, recent]` produce ~90 days of sales with built-in stories (rising items, cooling items, a dead product, a brand-new one, a sold-out hot item). Stock movements are generated together with sales and the final stock is **verified equal to the replayed movements**, so the data is internally consistent. It wipes and re-inserts, so it is repeatable.

## 11. Testing strategy
* **Unit tests** — pure calculation functions (`calculations.test.ts`), including zero-history and zero-denominator cases.
* **Integration tests** — real Express app + real MongoDB (in-memory) via Supertest: validation, duplicates, concurrency, idempotency, compensation, analytics on known data.
* **Contract/failure tests** — `catalog-client.test.ts` runs the real HTTP client against a fake server (404, 409, 500, timeout, refused connection, non-JSON).
* **Smoke test** — `docker compose --profile tools run --rm smoke` drives the running stack across both services.

## 12. Likely viva questions
1. *How do you prevent negative stock?* — atomic conditional `$inc` (§3).
2. *What if the sale save fails after stock was deducted?* — compensation + idempotency (§5).
3. *Why embed variants?* — atomic single-document stock update; variants never exist without a product.
4. *Why is DELETE an archive?* — preserves history; sales snapshots remain meaningful.
5. *Why can't one Mongo transaction cover both services?* — separate services/databases; the local Mongo is also a standalone node (no replica set).
6. *Image vs container?* — template vs running instance; data in volumes.
7. *Why `localhost` doesn't work between containers?* — each container has its own localhost; use service DNS names.
8. *Limits of the trend score?* — heuristic, fixed weights, short windows, no seasonality/validation.
