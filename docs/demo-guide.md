# Demo guide (≈10 minutes)

**Prep:** `docker compose up --build -d` then `docker compose --profile tools run --rm seed`. Open http://localhost:5173.

1. **Dashboard** — point out the stated period, KPIs from real data, revenue chart (daily/weekly toggle), sales by category, best sellers, restock list. Switch 7/30/90 days.
2. **Products** — search "denim", filter category *Jeans*, sort by price, paginate. Open *Wide-Leg Denim*: variants, stock levels, inline reorder-level edit.
3. **Add product** — create "Demo Tee" (SKU `DEMO-01`) with two variants; try a negative price and a duplicate SKU to show validation messages. Archive it (confirmation dialog), then restore.
4. **Inventory** — *Low & out of stock* tab (e.g. Studio Graphic Tee, sold-out Quilted Bomber Jacket). Click **Restock**, receive 20 units → movement appears in *Movement history*. Try an adjustment of −999: rejected, stock never goes negative.
5. **Record sale** — add 2 variants, set a discount, record. Show the server-computed total, then **Inventory → Movement history** (a `sale` movement with the sale reference). Press back and resubmit is prevented by the idempotency key. Try quantity above stock → error.
6. **Sales history** — filter by date, open a sale: snapshots of name/price. Rename/reprice a product and re-open an old sale: unchanged.
7. **Analytics & Trends** — trend scores with component bars and “Why this score?”; new product shows *No sales yet*; slow-moving reasons (no sales history / no recent sales / low velocity; out-of-stock and too-new counted separately); restock suggestions with the calculation shown.
8. **Resilience** — `docker compose stop catalog-service`: dashboard still shows sales KPIs with a warning; recording a sale fails cleanly with 503 and records nothing. `docker compose start catalog-service` and retry.
9. **Persistence** — `docker compose down` then `up -d`: data is still there (named volume).
10. **API** — http://localhost:3001/api-docs and :3002/api-docs; `docker compose --profile tools run --rm smoke` runs an end-to-end check.

Handy `curl`:
```bash
curl "localhost:3002/api/v1/analytics/trend-scores?limit=3"
curl "localhost:3001/api/v1/inventory/low-stock?level=out"
```
