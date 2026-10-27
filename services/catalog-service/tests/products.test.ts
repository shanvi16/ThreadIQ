import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, clearDb, createProduct, productPayload, startTestDb, stopTestDb } from './helpers';

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(clearDb);

describe('POST /api/v1/products', () => {
  it('creates a product with normalized variants and records initial stock movements', async () => {
    const res = await api().post('/api/v1/products').send(productPayload({ sku: 'abc-1' }));
    expect(res.status).toBe(201);
    expect(res.body.data.sku).toBe('ABC-1');
    expect(res.body.data.status).toBe('active');
    expect(res.body.data.totalStock).toBe(14);
    expect(res.body.data.variants[0].color).toBe('Blue');
    expect(res.body.data.variants[1].stockLevel).toBe('in_stock');

    const movements = await api().get('/api/v1/inventory/movements').query({ productId: res.body.data.id });
    expect(movements.body.data).toHaveLength(2);
    expect(movements.body.data.every((m: { type: string; reason: string }) => m.type === 'receipt' && m.reason === 'Initial stock')).toBe(true);
  });

  it('rejects a duplicate product SKU with 409', async () => {
    await createProduct({ sku: 'DUP-1' });
    const res = await api().post('/api/v1/products').send(productPayload({ sku: 'dup-1' }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_KEY');
  });

  it('rejects a duplicate variant SKU used by another product', async () => {
    const first = await createProduct();
    const res = await api()
      .post('/api/v1/products')
      .send(productPayload({ variants: [{ sku: first.variants[0].sku, size: 'S', color: 'Red', stock: 1 }] }));
    expect(res.status).toBe(409);
  });

  it('rejects duplicate variant combinations within one product', async () => {
    const res = await api()
      .post('/api/v1/products')
      .send(
        productPayload({
          variants: [
            { sku: 'V-1', size: 'M', color: 'Red', stock: 1 },
            { sku: 'V-2', size: 'M', color: 'red', stock: 1 },
          ],
        }),
      );
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.error.details)).toContain('Duplicate variant combination');
  });

  it.each([
    ['negative selling price', { sellingPrice: -5 }],
    ['negative cost price', { costPrice: -1 }],
    ['non-numeric price', { sellingPrice: 'free' }],
    ['unknown category', { category: 'Hats' }],
    ['no variants', { variants: [] }],
    ['unknown field', { hacked: true }],
    ['negative stock', { variants: [{ sku: 'N-1', size: 'M', color: 'Red', stock: -3 }] }],
    ['fractional stock', { variants: [{ sku: 'N-2', size: 'M', color: 'Red', stock: 1.5 }] }],
    ['invalid size', { variants: [{ sku: 'N-3', size: 'HUGE', color: 'Red', stock: 1 }] }],
  ])('rejects %s with 400', async (_label, override) => {
    const res = await api().post('/api/v1/products').send(productPayload(override));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/v1/products', () => {
  it('lists, searches, filters, sorts and paginates', async () => {
    await createProduct({ name: 'Alpha Dress', category: 'Dresses', sellingPrice: 3000 });
    await createProduct({ name: 'Beta Jeans', category: 'Jeans', sellingPrice: 2000 });
    await createProduct({ name: 'Gamma Jeans', category: 'Jeans', sellingPrice: 1000 });

    const all = await api().get('/api/v1/products');
    expect(all.body.meta).toMatchObject({ page: 1, total: 3, totalPages: 1 });

    const search = await api().get('/api/v1/products').query({ q: 'jeans' });
    expect(search.body.data).toHaveLength(2);

    const category = await api().get('/api/v1/products').query({ category: 'Dresses' });
    expect(category.body.data.map((p: { name: string }) => p.name)).toEqual(['Alpha Dress']);

    const sorted = await api().get('/api/v1/products').query({ sortBy: 'sellingPrice', order: 'asc', limit: 2 });
    expect(sorted.body.data.map((p: { sellingPrice: number }) => p.sellingPrice)).toEqual([1000, 2000]);
    expect(sorted.body.meta).toMatchObject({ total: 3, totalPages: 2, limit: 2 });

    const size = await api().get('/api/v1/products').query({ size: 'XL' });
    expect(size.body.data).toHaveLength(0);
  });

  it('ignores operator-injection attempts in query strings', async () => {
    await createProduct();
    const res = await api().get('/api/v1/products?q[$ne]=x');
    expect(res.status).toBe(400);
  });
});

describe('GET/PATCH/DELETE /api/v1/products/:id', () => {
  it('returns a product, updates metadata, and archives instead of deleting', async () => {
    const product = await createProduct();

    const got = await api().get(`/api/v1/products/${product.id}`);
    expect(got.status).toBe(200);

    const patched = await api().patch(`/api/v1/products/${product.id}`).send({ name: 'Renamed', sellingPrice: 1799.999 });
    expect(patched.status).toBe(200);
    expect(patched.body.data.name).toBe('Renamed');
    expect(patched.body.data.sellingPrice).toBe(1800);

    const archived = await api().delete(`/api/v1/products/${product.id}`);
    expect(archived.body.data.status).toBe('archived');

    expect((await api().get('/api/v1/products')).body.data).toHaveLength(0);
    expect((await api().get('/api/v1/products').query({ status: 'archived' })).body.data).toHaveLength(1);
  });

  it('does not allow stock to be changed through PATCH', async () => {
    const product = await createProduct();
    const res = await api().patch(`/api/v1/products/${product.id}`).send({ variants: [] });
    expect(res.status).toBe(400);
    const res2 = await api().patch(`/api/v1/products/${product.id}`).send({});
    expect(res2.status).toBe(400);
  });

  it('rejects malformed ids with 400 and unknown ids with 404', async () => {
    expect((await api().get('/api/v1/products/not-an-id')).status).toBe(400);
    expect((await api().patch('/api/v1/products/123').send({ name: 'x' })).status).toBe(400);
    expect((await api().get('/api/v1/products/665f1c2e8f1b2a0012345678')).status).toBe(404);
  });

  it('sets a reorder threshold and adds a variant with its own receipt movement', async () => {
    const product = await createProduct();
    const thr = await api()
      .patch(`/api/v1/products/${product.id}/variants/${product.variants[0].id}`)
      .send({ reorderThreshold: 9 });
    expect(thr.body.data.variants[0].reorderThreshold).toBe(9);

    const added = await api()
      .post(`/api/v1/products/${product.id}/variants`)
      .send({ sku: 'NEW-VAR-1', size: 'XL', color: 'Black', stock: 6 });
    expect(added.status).toBe(201);
    expect(added.body.data.variants).toHaveLength(3);

    const dup = await api()
      .post(`/api/v1/products/${product.id}/variants`)
      .send({ sku: 'NEW-VAR-2', size: 'XL', color: 'black', stock: 1 });
    expect(dup.status).toBe(409);
  });
});

describe('GET /health', () => {
  it('reports the service and database state', async () => {
    const res = await api().get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'catalog-service', database: 'up' });
  });
});

it('returns a JSON 404 for unknown routes and 400 for invalid JSON', async () => {
  expect((await api().get('/api/v1/nope')).status).toBe(404);
  const bad = await api().post('/api/v1/products').set('Content-Type', 'application/json').send('{oops');
  expect(bad.status).toBe(400);
  expect(bad.body.error.code).toBe('INVALID_JSON');
});
