import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SaleModel } from '../src/models/sale.model';
import { saleRepository } from '../src/repositories/sale.repository';
import { apiWith, clearSales, FakeCatalog, newKey, startTestDb, stopTestDb } from './helpers';

let catalog: FakeCatalog;
let product: ReturnType<FakeCatalog['addProduct']>;
const api = () => apiWith({ catalog });

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(async () => {
  await clearSales();
  catalog = new FakeCatalog();
  product = catalog.addProduct({
    name: 'Linen Shirt',
    sellingPrice: 1999.5,
    variants: [{ stock: 10 }, { stock: 2, size: 'L' }],
  });
});
afterEach(() => vi.restoreAllMocks());

const line = (variantIndex: number, quantity: number) => ({
  productId: product.id,
  variantId: product.variants[variantIndex].id,
  quantity,
});

describe('POST /api/v1/sales', () => {
  it('creates a sale, snapshots names/prices, deducts stock and computes totals on the backend', async () => {
    const res = await api()
      .post('/api/v1/sales')
      .send({
        idempotencyKey: newKey(),
        items: [line(0, 2), line(1, 1)],
        discount: 100,
        // A malicious/buggy client tries to dictate prices and totals - these must be ignored.
        total: 1,
        subtotal: 1,
      });

    expect(res.status).toBe(201);
    const sale = res.body.data;
    expect(sale.saleNumber).toMatch(/^TIQ-\d{8}-[0-9A-F]{6}$/);
    expect(sale.items).toHaveLength(2);
    expect(sale.items[0]).toMatchObject({
      productName: 'Linen Shirt',
      sku: product.variants[0].sku,
      quantity: 2,
      unitPrice: 1999.5,
      lineTotal: 3999,
    });
    expect(sale.subtotal).toBe(5998.5); // 3999 + 1999.5
    expect(sale.discount).toBe(100);
    expect(sale.total).toBe(5898.5);
    expect(sale.unitsSold).toBe(3);

    expect(catalog.stockOf(product.id, product.variants[0].id)).toBe(8);
    expect(catalog.stockOf(product.id, product.variants[1].id)).toBe(1);

    const fetched = await api().get(`/api/v1/sales/${sale.id}`);
    expect(fetched.body.data.total).toBe(5898.5);
  });

  it('keeps historical prices and names after the product is repriced and renamed', async () => {
    const res = await api().post('/api/v1/sales').send({ idempotencyKey: newKey(), items: [line(0, 1)] });
    product.sellingPrice = 5000;
    product.name = 'Renamed Shirt';
    const fetched = await api().get(`/api/v1/sales/${res.body.data.id}`);
    expect(fetched.body.data.items[0]).toMatchObject({ productName: 'Linen Shirt', unitPrice: 1999.5 });
  });

  it('merges repeated lines for the same variant', async () => {
    const res = await api().post('/api/v1/sales').send({ idempotencyKey: newKey(), items: [line(0, 2), line(0, 3)] });
    expect(res.status).toBe(201);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].quantity).toBe(5);
  });

  it.each([
    ['zero quantity', [{ quantity: 0 }]],
    ['negative quantity', [{ quantity: -2 }]],
    ['fractional quantity', [{ quantity: 1.5 }]],
    ['string quantity', [{ quantity: '2' }]],
    ['no items', []],
  ])('rejects %s with 400', async (_label, items) => {
    const body = { idempotencyKey: newKey(), items: items.map((i) => ({ ...line(0, 1), ...i })) };
    const res = await api().post('/api/v1/sales').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await SaleModel.countDocuments()).toBe(0);
    expect(catalog.deductCalls).toBe(0);
  });

  it('rejects malformed ids, missing idempotency keys and negative discounts', async () => {
    const bad = await api().post('/api/v1/sales').send({ idempotencyKey: newKey(), items: [{ productId: 'x', variantId: 'y', quantity: 1 }] });
    expect(bad.status).toBe(400);
    const noKey = await api().post('/api/v1/sales').send({ items: [line(0, 1)] });
    expect(noKey.status).toBe(400);
    const negative = await api().post('/api/v1/sales').send({ idempotencyKey: newKey(), items: [line(0, 1)], discount: -5 });
    expect(negative.status).toBe(400);
  });

  it('accepts the key from the Idempotency-Key header', async () => {
    const res = await api().post('/api/v1/sales').set('Idempotency-Key', newKey()).send({ items: [line(0, 1)] });
    expect(res.status).toBe(201);
  });

  it('rejects a discount larger than the subtotal', async () => {
    const res = await api().post('/api/v1/sales').send({ idempotencyKey: newKey(), items: [line(0, 1)], discount: 999999 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_DISCOUNT');
    expect(catalog.deductCalls).toBe(0);
  });

  it('rejects a sale with insufficient inventory (409) and creates nothing', async () => {
    const res = await api().post('/api/v1/sales').send({ idempotencyKey: newKey(), items: [line(1, 3)] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.error.details).toMatchObject({ available: 2, requested: 3 });
    expect(await SaleModel.countDocuments()).toBe(0);
    expect(catalog.stockOf(product.id, product.variants[1].id)).toBe(2);
  });

  it('surfaces insufficient stock reported by the catalog at deduction time (race after validation)', async () => {
    const original = catalog.getProduct.bind(catalog);
    vi.spyOn(catalog, 'getProduct').mockImplementation(async (id) => {
      const p = await original(id);
      // The advisory check sees plenty of stock, but another sale takes it before the deduction.
      const snapshot = structuredClone(p!);
      p!.variants[0].stock = 0;
      return snapshot;
    });
    const res = await api().post('/api/v1/sales').send({ idempotencyKey: newKey(), items: [line(0, 4)] });
    expect(res.status).toBe(409);
    expect(await SaleModel.countDocuments()).toBe(0);
  });

  it('returns 404 for unknown products and variants, 409 for archived products', async () => {
    const unknownProduct = await api().post('/api/v1/sales').send({
      idempotencyKey: newKey(),
      items: [{ productId: 'aaaaaaaaaaaaaaaaaaaaaaaa', variantId: 'bbbbbbbbbbbbbbbbbbbbbbbb', quantity: 1 }],
    });
    expect(unknownProduct.status).toBe(404);
    expect(unknownProduct.body.error.code).toBe('PRODUCT_NOT_FOUND');

    const unknownVariant = await api().post('/api/v1/sales').send({
      idempotencyKey: newKey(),
      items: [{ productId: product.id, variantId: 'bbbbbbbbbbbbbbbbbbbbbbbb', quantity: 1 }],
    });
    expect(unknownVariant.body.error.code).toBe('VARIANT_NOT_FOUND');

    product.status = 'archived';
    const archived = await api().post('/api/v1/sales').send({ idempotencyKey: newKey(), items: [line(0, 1)] });
    expect(archived.status).toBe(409);
    expect(archived.body.error.code).toBe('PRODUCT_ARCHIVED');
  });
});

describe('idempotency', () => {
  it('does not create a duplicate sale or deduct stock twice for a repeated key', async () => {
    const body = { idempotencyKey: newKey(), items: [line(0, 3)] };
    const first = await api().post('/api/v1/sales').send(body);
    const second = await api().post('/api/v1/sales').send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.headers['idempotent-replay']).toBe('true');
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(second.body.meta.replayed).toBe(true);
    expect(await SaleModel.countDocuments()).toBe(1);
    expect(catalog.stockOf(product.id, product.variants[0].id)).toBe(7);
  });

  it('handles concurrent submissions with the same key as a single sale', async () => {
    const body = { idempotencyKey: newKey(), items: [line(0, 2)] };
    const results = await Promise.all(Array.from({ length: 5 }, () => api().post('/api/v1/sales').send(body)));
    expect(results.every((r) => r.status === 200 || r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.data.id)).size).toBe(1);
    expect(await SaleModel.countDocuments()).toBe(1);
    expect(catalog.stockOf(product.id, product.variants[0].id)).toBe(8);
  });
});

describe('failure handling', () => {
  it('returns 503 and records nothing when the Catalog Service is down', async () => {
    catalog.down = true;
    const res = await api().post('/api/v1/sales').send({ idempotencyKey: newKey(), items: [line(0, 1)] });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('CATALOG_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toContain('stack');
    expect(await SaleModel.countDocuments()).toBe(0);
  });

  it('restores stock (compensation) when saving the sale fails after the deduction', async () => {
    vi.spyOn(saleRepository, 'create').mockRejectedValueOnce(new Error('disk full'));
    const key = newKey();
    const res = await api().post('/api/v1/sales').send({ idempotencyKey: key, items: [line(0, 4)] });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('SALE_PERSISTENCE_FAILED');
    expect(res.body.error.details).toEqual({ compensated: true });
    expect(res.body.error.message).not.toContain('disk full');
    expect(catalog.restoreCalls).toEqual([key]);
    expect(catalog.stockOf(product.id, product.variants[0].id)).toBe(10);
    expect(await SaleModel.countDocuments()).toBe(0);

    // The same request can simply be retried.
    const retry = await api().post('/api/v1/sales').send({ idempotencyKey: key, items: [line(0, 4)] });
    expect(retry.status).toBe(201);
    expect(catalog.stockOf(product.id, product.variants[0].id)).toBe(6);
  });

  it('reports when compensation itself failed, and a retry with the same key stays safe', async () => {
    vi.spyOn(saleRepository, 'create').mockRejectedValueOnce(new Error('db down'));
    catalog.failRestore = true;
    const key = newKey();
    const res = await api().post('/api/v1/sales').send({ idempotencyKey: key, items: [line(0, 4)] });
    expect(res.status).toBe(500);
    expect(res.body.error.details).toEqual({ compensated: false });
    expect(catalog.stockOf(product.id, product.variants[0].id)).toBe(6); // still deducted: needs reconciliation

    const retry = await api().post('/api/v1/sales').send({ idempotencyKey: key, items: [line(0, 4)] });
    expect(retry.status).toBe(201);
    expect(catalog.stockOf(product.id, product.variants[0].id)).toBe(6); // not deducted a second time
  });
});

describe('GET /api/v1/sales', () => {
  it('lists newest first with pagination and filters by date range', async () => {
    for (const [i, day] of ['2026-01-10', '2026-02-10', '2026-03-10'].entries()) {
      await SaleModel.create({
        saleNumber: `TIQ-TEST-${i}`,
        idempotencyKey: `seed-key-${i}-xxxxxxxx`,
        items: [{ productId: product.id, variantId: product.variants[0].id, sku: 'S', productSku: 'P', productName: 'Linen Shirt', category: 'Shirts', size: 'M', color: 'Blue', quantity: 1, unitPrice: 100, lineTotal: 100 }],
        subtotal: 100,
        discount: 0,
        total: 100,
        createdAt: new Date(`${day}T12:00:00Z`),
      });
    }
    const all = await api().get('/api/v1/sales').query({ limit: 2 });
    expect(all.body.meta).toMatchObject({ total: 3, totalPages: 2, limit: 2 });
    expect(all.body.data[0].saleNumber).toBe('TIQ-TEST-2');

    const ranged = await api().get('/api/v1/sales').query({ from: '2026-02-01', to: '2026-02-28' });
    expect(ranged.body.data.map((s: { saleNumber: string }) => s.saleNumber)).toEqual(['TIQ-TEST-1']);

    const sameDay = await api().get('/api/v1/sales').query({ from: '2026-03-10', to: '2026-03-10' });
    expect(sameDay.body.data).toHaveLength(1);

    expect((await api().get('/api/v1/sales').query({ from: 'garbage' })).status).toBe(400);
    expect((await api().get('/api/v1/sales').query({ from: '2026-03-01', to: '2026-01-01' })).status).toBe(400);
    expect((await api().get('/api/v1/sales/not-an-id')).status).toBe(400);
    expect((await api().get('/api/v1/sales/aaaaaaaaaaaaaaaaaaaaaaaa')).status).toBe(404);
  });
});

it('exposes a health endpoint', async () => {
  const res = await api().get('/health');
  expect(res.body).toMatchObject({ status: 'ok', service: 'insights-service' });
});
