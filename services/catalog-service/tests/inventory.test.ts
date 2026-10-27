import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, clearDb, createProduct, startTestDb, stopTestDb } from './helpers';

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(clearDb);

const stockOf = async (productId: string, variantId: string) => {
  const res = await api().get(`/api/v1/products/${productId}`);
  return res.body.data.variants.find((v: { id: string }) => v.id === variantId).stock as number;
};

describe('receipts and adjustments', () => {
  it('receives stock and records a movement with the resulting balance', async () => {
    const p = await createProduct();
    const res = await api()
      .post('/api/v1/inventory/receipts')
      .send({ productId: p.id, variantId: p.variants[0].id, quantity: 15, reason: 'Delivery #1' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ type: 'receipt', quantityChange: 15, balanceAfter: 25, reason: 'Delivery #1' });
    expect(await stockOf(p.id, p.variants[0].id)).toBe(25);
  });

  it('adjusts stock down with a reason and records the movement', async () => {
    const p = await createProduct();
    const res = await api()
      .post('/api/v1/inventory/adjustments')
      .send({ productId: p.id, variantId: p.variants[0].id, quantityChange: -3, reason: 'Damaged' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ type: 'adjustment', quantityChange: -3, balanceAfter: 7 });

    const history = await api().get('/api/v1/inventory/movements').query({ productId: p.id, type: 'adjustment' });
    expect(history.body.data).toHaveLength(1);
  });

  it('prevents an adjustment from making stock negative', async () => {
    const p = await createProduct();
    const res = await api()
      .post('/api/v1/inventory/adjustments')
      .send({ productId: p.id, variantId: p.variants[1].id, quantityChange: -5, reason: 'Oops' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.error.details).toMatchObject({ available: 4, requested: 5 });
    expect(await stockOf(p.id, p.variants[1].id)).toBe(4);
    const history = await api().get('/api/v1/inventory/movements').query({ productId: p.id, type: 'adjustment' });
    expect(history.body.data).toHaveLength(0);
  });

  it.each([
    ['zero quantity', { quantity: 0 }],
    ['negative quantity', { quantity: -4 }],
    ['fractional quantity', { quantity: 2.5 }],
    ['bad product id', { productId: 'abc' }],
  ])('rejects a receipt with %s', async (_l, override) => {
    const p = await createProduct();
    const res = await api()
      .post('/api/v1/inventory/receipts')
      .send({ productId: p.id, variantId: p.variants[0].id, quantity: 5, ...override });
    expect(res.status).toBe(400);
  });

  it('requires a reason and a non-zero change for adjustments', async () => {
    const p = await createProduct();
    const base = { productId: p.id, variantId: p.variants[0].id };
    expect((await api().post('/api/v1/inventory/adjustments').send({ ...base, quantityChange: 2 })).status).toBe(400);
    expect((await api().post('/api/v1/inventory/adjustments').send({ ...base, quantityChange: 0, reason: 'x' })).status).toBe(400);
  });

  it('returns 404 for unknown product or variant', async () => {
    const p = await createProduct();
    const unknown = '665f1c2e8f1b2a0012345678';
    expect((await api().post('/api/v1/inventory/receipts').send({ productId: unknown, variantId: unknown, quantity: 1 })).status).toBe(404);
    expect((await api().post('/api/v1/inventory/receipts').send({ productId: p.id, variantId: unknown, quantity: 1 })).status).toBe(404);
  });
});

describe('sale deductions', () => {
  const ref = 'sale-ref-0001';

  it('deducts stock, records sale movements, and is idempotent for the same reference', async () => {
    const p = await createProduct();
    const body = { reference: ref, items: [{ productId: p.id, variantId: p.variants[0].id, quantity: 3 }] };

    const first = await api().post('/api/v1/inventory/sale-deductions').send(body);
    expect(first.status).toBe(200);
    expect(first.body.data.items[0]).toMatchObject({ balanceAfter: 7, alreadyApplied: false });

    const replay = await api().post('/api/v1/inventory/sale-deductions').send(body);
    expect(replay.status).toBe(200);
    expect(replay.body.data.items[0]).toMatchObject({ balanceAfter: 7, alreadyApplied: true });

    expect(await stockOf(p.id, p.variants[0].id)).toBe(7);
    const movements = await api().get('/api/v1/inventory/movements').query({ productId: p.id, type: 'sale' });
    expect(movements.body.data).toHaveLength(1);
    expect(movements.body.data[0]).toMatchObject({ quantityChange: -3, reference: ref });
  });

  it('rejects insufficient stock with 409 and leaves stock untouched', async () => {
    const p = await createProduct();
    const res = await api()
      .post('/api/v1/inventory/sale-deductions')
      .send({ reference: ref, items: [{ productId: p.id, variantId: p.variants[1].id, quantity: 5 }] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await stockOf(p.id, p.variants[1].id)).toBe(4);
  });

  it('rolls back earlier lines when a later line fails', async () => {
    const p = await createProduct();
    const res = await api()
      .post('/api/v1/inventory/sale-deductions')
      .send({
        reference: ref,
        items: [
          { productId: p.id, variantId: p.variants[0].id, quantity: 2 },
          { productId: p.id, variantId: p.variants[1].id, quantity: 99 },
        ],
      });
    expect(res.status).toBe(409);
    expect(await stockOf(p.id, p.variants[0].id)).toBe(10);
    expect(await stockOf(p.id, p.variants[1].id)).toBe(4);
  });

  it('never oversells under concurrent deductions', async () => {
    const p = await createProduct(); // variant[1] has 4 units
    const attempts = Array.from({ length: 10 }, (_, i) =>
      api()
        .post('/api/v1/inventory/sale-deductions')
        .send({ reference: `concurrent-ref-${i}`, items: [{ productId: p.id, variantId: p.variants[1].id, quantity: 1 }] }),
    );
    const results = await Promise.all(attempts);
    const succeeded = results.filter((r) => r.status === 200).length;
    const rejected = results.filter((r) => r.status === 409).length;
    expect(succeeded).toBe(4);
    expect(rejected).toBe(6);
    expect(await stockOf(p.id, p.variants[1].id)).toBe(0);
  });

  it('refuses to sell archived products', async () => {
    const p = await createProduct();
    await api().delete(`/api/v1/products/${p.id}`);
    const res = await api()
      .post('/api/v1/inventory/sale-deductions')
      .send({ reference: ref, items: [{ productId: p.id, variantId: p.variants[0].id, quantity: 1 }] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRODUCT_ARCHIVED');
  });

  it('restores stock via compensation, idempotently, and allows the reference to be reused', async () => {
    const p = await createProduct();
    const items = [{ productId: p.id, variantId: p.variants[0].id, quantity: 4 }];
    await api().post('/api/v1/inventory/sale-deductions').send({ reference: ref, items });
    expect(await stockOf(p.id, p.variants[0].id)).toBe(6);

    const restore = await api().post('/api/v1/inventory/sale-restorations').send({ reference: ref });
    expect(restore.body.data.restoredLines).toBe(1);
    expect(await stockOf(p.id, p.variants[0].id)).toBe(10);

    const again = await api().post('/api/v1/inventory/sale-restorations').send({ reference: ref });
    expect(again.body.data.restoredLines).toBe(0);
    expect(await stockOf(p.id, p.variants[0].id)).toBe(10);

    const returns = await api().get('/api/v1/inventory/movements').query({ productId: p.id, type: 'return' });
    expect(returns.body.data).toHaveLength(1);

    const retry = await api().post('/api/v1/inventory/sale-deductions').send({ reference: ref, items });
    expect(retry.status).toBe(200);
    expect(await stockOf(p.id, p.variants[0].id)).toBe(6);
  });
});

describe('low-stock, summary and snapshot', () => {
  it('classifies low and out-of-stock variants against reorder thresholds', async () => {
    const p = await createProduct(); // M: 10/3, L: 4/3
    await api().post('/api/v1/inventory/adjustments').send({ productId: p.id, variantId: p.variants[1].id, quantityChange: -1, reason: 'Count' }); // 3 -> low
    await api().post('/api/v1/inventory/adjustments').send({ productId: p.id, variantId: p.variants[0].id, quantityChange: -10, reason: 'Count' }); // 0 -> out

    const all = await api().get('/api/v1/inventory/low-stock');
    expect(all.body.meta.total).toBe(2);
    expect(all.body.data.map((r: { level: string }) => r.level).sort()).toEqual(['low', 'out']);

    const out = await api().get('/api/v1/inventory/low-stock').query({ level: 'out' });
    expect(out.body.data).toHaveLength(1);
    const low = await api().get('/api/v1/inventory/low-stock').query({ level: 'low' });
    expect(low.body.data[0].stock).toBe(3);
  });

  it('summarises active inventory and excludes archived products', async () => {
    await createProduct({ costPrice: 100 }); // 14 units @ 100
    const archived = await createProduct({ costPrice: 100 });
    await api().delete(`/api/v1/products/${archived.id}`);

    const res = await api().get('/api/v1/inventory/summary');
    expect(res.body.data).toMatchObject({ activeProducts: 1, totalUnits: 14, inventoryValueAtCost: 1400 });
    expect(res.body.data.byCategory).toHaveLength(1);

    const snap = await api().get('/api/v1/inventory/snapshot');
    expect(snap.body.data).toHaveLength(2);
    const snapAll = await api().get('/api/v1/inventory/snapshot').query({ status: 'all' });
    expect(snapAll.body.data).toHaveLength(4);
  });
});
