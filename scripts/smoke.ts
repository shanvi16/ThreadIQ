/**
 * End-to-end smoke test against a RUNNING stack (docker compose up, or the dev servers):
 *
 *   npm run smoke
 *
 * Creates a product through the Catalog Service, records a sale through the Insights Service
 * (which calls the Catalog Service over HTTP), and verifies stock, idempotency and error handling.
 * The test product is archived at the end.
 */
import { randomUUID } from 'node:crypto';

const CATALOG = process.env.CATALOG_URL ?? 'http://localhost:3001';
const INSIGHTS = process.env.INSIGHTS_URL ?? 'http://localhost:3002';

let failures = 0;
const check = (label: string, ok: boolean, extra?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) {
    failures += 1;
    if (extra !== undefined) console.log('      ', JSON.stringify(extra));
  }
};

async function call(base: string, path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const res = await fetch(`${base}${path}`, {
    method: init.method ?? 'GET',
    headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  return { status: res.status, headers: res.headers, json: (await res.json().catch(() => null)) as any };
}

async function main() {
  const health = await Promise.all([call(CATALOG, '/health'), call(INSIGHTS, '/health')]);
  check('catalog-service /health', health[0].status === 200, health[0].json);
  check('insights-service /health', health[1].status === 200, health[1].json);

  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const created = await call(CATALOG, '/api/v1/products', {
    method: 'POST',
    body: {
      name: `Smoke Test Tee ${suffix}`,
      sku: `SMOKE-${suffix}`,
      brand: 'Smoke',
      category: 'T-Shirts',
      sellingPrice: 500,
      costPrice: 200,
      variants: [{ sku: `SMOKE-${suffix}-M`, size: 'M', color: 'Grey', stock: 5, reorderThreshold: 2 }],
    },
  });
  check('create product (201)', created.status === 201, created.json);
  const product = created.json.data;
  const variant = product.variants[0];

  const key = randomUUID();
  const sale = await call(INSIGHTS, '/api/v1/sales', {
    method: 'POST',
    body: { idempotencyKey: key, items: [{ productId: product.id, variantId: variant.id, quantity: 2 }], discount: 100 },
  });
  check('record sale (201)', sale.status === 201, sale.json);
  check('backend computed total (2 x 500 - 100 = 900)', sale.json?.data?.total === 900, sale.json?.data);

  const replay = await call(INSIGHTS, '/api/v1/sales', {
    method: 'POST',
    body: { idempotencyKey: key, items: [{ productId: product.id, variantId: variant.id, quantity: 2 }], discount: 100 },
  });
  check('duplicate submission returns the same sale (200)', replay.status === 200 && replay.json.data.id === sale.json.data.id, replay.json);

  const after = await call(CATALOG, `/api/v1/products/${product.id}`);
  check('stock deducted exactly once (5 -> 3)', after.json.data.variants[0].stock === 3, after.json?.data?.variants);

  const tooMany = await call(INSIGHTS, '/api/v1/sales', {
    method: 'POST',
    body: { idempotencyKey: randomUUID(), items: [{ productId: product.id, variantId: variant.id, quantity: 99 }] },
  });
  check('insufficient stock rejected (409)', tooMany.status === 409 && tooMany.json.error.code === 'INSUFFICIENT_STOCK', tooMany.json);

  const movements = await call(CATALOG, `/api/v1/inventory/movements?productId=${product.id}`);
  const types = (movements.json.data as { type: string }[]).map((m) => m.type).sort();
  check('movement history has receipt + sale', types.join() === 'receipt,sale', types);

  const overview = await call(INSIGHTS, '/api/v1/analytics/overview');
  check('analytics overview responds with inventory data', overview.status === 200 && overview.json.data.inventoryAvailable === true, overview.json);

  await call(CATALOG, `/api/v1/products/${product.id}`, { method: 'DELETE' });
  console.log(failures === 0 ? '\nAll smoke checks passed.' : `\n${failures} smoke check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Smoke test could not run. Are both services up?', err.message);
  process.exit(1);
});
