import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SaleModel, type SaleItem } from '../src/models/sale.model';
import { apiWith, clearSales, FakeCatalog, startTestDb, stopTestDb } from './helpers';

const NOW = new Date('2026-03-31T12:00:00Z');
let catalog: FakeCatalog;
let A: ReturnType<FakeCatalog['addProduct']>; // Shirts, sells steadily
let B: ReturnType<FakeCatalog['addProduct']>; // Jeans, one recent sale
let C: ReturnType<FakeCatalog['addProduct']>; // never sold
let D: ReturnType<FakeCatalog['addProduct']>; // brand new
let E: ReturnType<FakeCatalog['addProduct']>; // out of stock
let F: ReturnType<FakeCatalog['addProduct']>; // sold long ago only
const api = () => apiWith({ catalog, now: () => NOW });

beforeAll(startTestDb);
afterAll(stopTestDb);

let n = 0;
async function sale(date: string, lines: { p: typeof A; qty: number }[], discount = 0) {
  const items: SaleItem[] = lines.map(({ p, qty }) => ({
    productId: p.id as never,
    variantId: p.variants[0].id as never,
    sku: p.variants[0].sku,
    productSku: p.sku,
    productName: p.name,
    category: p.category,
    size: 'M',
    color: 'Blue',
    quantity: qty,
    unitPrice: p.sellingPrice,
    lineTotal: p.sellingPrice * qty,
  }));
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  n += 1;
  await SaleModel.create({
    saleNumber: `TIQ-AN-${n}`,
    idempotencyKey: `analytics-key-${n}-xxxx`,
    items,
    subtotal,
    discount,
    total: subtotal - discount,
    createdAt: new Date(date),
  });
}

beforeEach(async () => {
  await clearSales();
  catalog = new FakeCatalog(() => NOW);
  A = catalog.addProduct({ name: 'Product A', category: 'Shirts', sellingPrice: 1000, costPrice: 400, variants: [{ stock: 3, reorderThreshold: 5 }, { stock: 50 }] });
  B = catalog.addProduct({ name: 'Product B', category: 'Jeans', sellingPrice: 500, costPrice: 200, ageDays: 200, variants: [{ stock: 2, reorderThreshold: 3 }] });
  C = catalog.addProduct({ name: 'Product C', category: 'Shirts', sellingPrice: 800, costPrice: 300, variants: [{ stock: 10, reorderThreshold: 3 }] });
  D = catalog.addProduct({ name: 'Product D', category: 'Tops', sellingPrice: 700, costPrice: 300, ageDays: 3, variants: [{ stock: 10 }] });
  E = catalog.addProduct({ name: 'Product E', category: 'Tops', sellingPrice: 700, costPrice: 300, variants: [{ stock: 0, reorderThreshold: 5 }] });
  F = catalog.addProduct({ name: 'Product F', category: 'Jeans', sellingPrice: 900, costPrice: 300, variants: [{ stock: 5, reorderThreshold: 2 }] });

  await sale('2026-03-30T10:00:00Z', [{ p: A, qty: 2 }]); // 2000
  await sale('2026-03-30T15:00:00Z', [{ p: A, qty: 1 }, { p: B, qty: 1 }], 150); // 1500 - 150
  await sale('2026-03-10T10:00:00Z', [{ p: A, qty: 3 }]); // 3000
  await sale('2026-02-01T10:00:00Z', [{ p: B, qty: 4 }]); // 2000 (outside March)
  await sale('2026-01-20T10:00:00Z', [{ p: F, qty: 1 }]); // 900, long ago
});

describe('GET /analytics/overview', () => {
  it('computes revenue KPIs for known sales (gross, discount, net revenue, AOV)', async () => {
    const res = await api().get('/api/v1/analytics/overview').query({ from: '2026-03-01', to: '2026-03-31' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      grossSales: 6500,
      discounts: 150,
      revenue: 6350,
      salesCount: 3,
      unitsSold: 7,
      averageOrderValue: 2116.67,
      inventoryAvailable: true,
    });
    expect(res.body.data.inventory).toMatchObject({ activeProducts: 6, totalUnits: 80 });
  });

  it('returns zeros (not NaN) for a period with no sales', async () => {
    const res = await api().get('/api/v1/analytics/overview').query({ from: '2025-01-01', to: '2025-01-31' });
    expect(res.body.data).toMatchObject({ revenue: 0, grossSales: 0, discounts: 0, salesCount: 0, unitsSold: 0, averageOrderValue: 0 });
  });

  it('still serves sales KPIs when the Catalog Service is down', async () => {
    catalog.down = true;
    const res = await api().get('/api/v1/analytics/overview').query({ from: '2026-03-01', to: '2026-03-31' });
    expect(res.status).toBe(200);
    expect(res.body.data.revenue).toBe(6350);
    expect(res.body.data.inventoryAvailable).toBe(false);
    expect(res.body.data.inventory).toBeNull();
  });

  it('defaults to the last 30 days and validates the range', async () => {
    const res = await api().get('/api/v1/analytics/overview');
    expect(res.body.data.period.to).toBe(NOW.toISOString());
    expect(res.body.data.period.from).toBe('2026-03-02T00:00:00.000Z');
    expect((await api().get('/api/v1/analytics/overview').query({ from: '2026-03-31', to: '2026-03-01' })).status).toBe(400);
    expect((await api().get('/api/v1/analytics/overview').query({ from: 'nope' })).status).toBe(400);
    expect((await api().get('/api/v1/analytics/overview').query({ from: '2020-01-01', to: '2026-01-01' })).status).toBe(400);
  });
});

describe('GET /analytics/revenue-trend', () => {
  it('zero-fills days and aggregates weekly buckets', async () => {
    const daily = await api().get('/api/v1/analytics/revenue-trend').query({ from: '2026-03-28', to: '2026-03-31' });
    expect(daily.body.data.points).toEqual([
      { date: '2026-03-28', revenue: 0, orders: 0, units: 0 },
      { date: '2026-03-29', revenue: 0, orders: 0, units: 0 },
      { date: '2026-03-30', revenue: 3350, orders: 2, units: 4 },
      { date: '2026-03-31', revenue: 0, orders: 0, units: 0 },
    ]);

    const weekly = await api().get('/api/v1/analytics/revenue-trend').query({ from: '2026-03-09', to: '2026-03-31', interval: 'week' });
    const byWeek = Object.fromEntries(weekly.body.data.points.map((p: { date: string; revenue: number }) => [p.date, p.revenue]));
    expect(byWeek['2026-03-09']).toBe(3000); // week of Mon 9 Mar contains the 10th
    expect(byWeek['2026-03-30']).toBe(3350); // week of Mon 30 Mar
    expect(byWeek['2026-03-16']).toBe(0);
  });
});

describe('GET /analytics/category-performance and top-products', () => {
  it('allocates discounts proportionally so category revenue sums to total revenue', async () => {
    const res = await api().get('/api/v1/analytics/category-performance').query({ from: '2026-03-01', to: '2026-03-31' });
    const items = res.body.data.items as { category: string; revenue: number; unitsSold: number; stockUnits: number | null }[];
    const shirts = items.find((i) => i.category === 'Shirts')!;
    const jeans = items.find((i) => i.category === 'Jeans')!;
    expect(shirts).toMatchObject({ revenue: 5900, unitsSold: 6, stockUnits: 63 }); // 2000 + 1000*0.9 + 3000
    expect(jeans).toMatchObject({ revenue: 450, unitsSold: 1, stockUnits: 7 });
    expect(shirts.revenue + jeans.revenue).toBe(6350);
    expect(items.find((i) => i.category === 'Tops')).toMatchObject({ revenue: 0, stockUnits: 10 });
  });

  it('ranks best sellers by units or revenue', async () => {
    const res = await api().get('/api/v1/analytics/top-products').query({ from: '2026-03-01', to: '2026-03-31', limit: 5 });
    expect(res.body.data.items.map((i: { productName: string; unitsSold: number }) => [i.productName, i.unitsSold])).toEqual([
      ['Product A', 6],
      ['Product B', 1],
    ]);
    const byRevenue = await api().get('/api/v1/analytics/top-products').query({ from: '2026-02-01', to: '2026-03-31', sortBy: 'revenue', limit: 1 });
    expect(byRevenue.body.data.items).toHaveLength(1);
    expect(byRevenue.body.data.items[0].productName).toBe('Product A');
  });
});

describe('GET /analytics/trend-scores', () => {
  it('scores products with the documented formula and handles zero-history products', async () => {
    const res = await api().get('/api/v1/analytics/trend-scores');
    expect(res.status).toBe(200);
    const items = res.body.data.items as { productName: string; score: number; label: string; dataStatus: string; components: Record<string, number> }[];
    const byName = Object.fromEntries(items.map((i) => [i.productName, i]));

    // A: recent 3 units (0.214/day -> velocity 10.7), previous 3 -> growth 50, stock 53 -> cover 247d -> urgency 0
    expect(byName['Product A'].components).toEqual({ velocity: 10.7, growth: 50, urgency: 0 });
    expect(byName['Product A'].score).toBe(18.9);
    // B: recent 1, previous 0 -> new demand growth 100; stock 2 -> cover 28d -> urgency 6.7
    expect(byName['Product B'].components).toEqual({ velocity: 3.6, growth: 100, urgency: 6.7 });
    expect(byName['Product B'].score).toBe(28.1);
    // Never sold / brand new: score 0 and clearly marked
    expect(byName['Product C']).toMatchObject({ score: 0, label: 'inactive', dataStatus: 'no_sales' });
    expect(byName['Product D']).toMatchObject({ score: 0, dataStatus: 'no_sales' });

    expect(items.every((i) => i.score >= 0 && i.score <= 100)).toBe(true);
    expect(items[0].productName).toBe('Product B'); // sorted by score desc
    expect(res.body.data.weights).toEqual({ velocity: 0.6, growth: 0.25, urgency: 0.15 });
  });

  it('filters by category and honours a custom window', async () => {
    const res = await api().get('/api/v1/analytics/trend-scores').query({ category: 'Jeans', windowDays: 7 });
    expect(res.body.data.items.every((i: { category: string }) => i.category === 'Jeans')).toBe(true);
    expect(res.body.data.windowDays).toBe(7);
  });

  it('returns 503 when stock data is required but the catalog is down', async () => {
    catalog.down = true;
    expect((await api().get('/api/v1/analytics/trend-scores')).status).toBe(503);
  });
});

describe('GET /analytics/slow-moving', () => {
  it('distinguishes no history, no recent sales, low velocity, out-of-stock and too-new products', async () => {
    const res = await api().get('/api/v1/analytics/slow-moving');
    const { items, summary } = res.body.data;
    const statusOf = Object.fromEntries(items.map((i: { productName: string; status: string }) => [i.productName, i.status]));

    expect(statusOf['Product B']).toBe('low_velocity'); // 1 unit in 30 days
    expect(statusOf['Product C']).toBe('no_sales_history');
    expect(statusOf['Product F']).toBe('no_recent_sales');
    expect(statusOf['Product A']).toBeUndefined(); // selling fine
    expect(statusOf['Product D']).toBeUndefined(); // too new to judge
    expect(statusOf['Product E']).toBeUndefined(); // out of stock is not "slow"
    expect(summary).toEqual({ noSalesHistory: 1, noRecentSales: 1, lowVelocity: 1, outOfStock: 1, tooNewToJudge: 1 });

    const f = items.find((i: { productName: string }) => i.productName === 'Product F');
    expect(f.daysSinceLastSale).toBe(70);
    expect(f.stockValueAtCost).toBe(1500);

    const filtered = await api().get('/api/v1/analytics/slow-moving').query({ status: 'no_sales_history' });
    expect(filtered.body.data.items).toHaveLength(1);
  });
});

describe('GET /analytics/restock-recommendations', () => {
  it('flags low-stock variants and suggests quantities from recent sales', async () => {
    const res = await api().get('/api/v1/analytics/restock-recommendations');
    const items = res.body.data.items as {
      productName: string;
      variantSku: string;
      priority: string;
      suggestedQuantity: number;
      targetStock: number;
      reasons: string[];
      coverDays: number | null;
      dataStatus: string;
    }[];
    const byName = Object.fromEntries(items.map((i) => [i.productName, i]));

    // A variant 1: 6 units in the last 30 days (0.2/day), stock 3, threshold 5 -> target ceil(6)+5 = 11 -> order 8
    expect(byName['Product A']).toMatchObject({ suggestedQuantity: 8, targetStock: 11, coverDays: 15, priority: 'medium', dataStatus: 'ok' });
    expect(byName['Product A'].reasons).toEqual(['below_reorder_level']);
    // B: 1 unit/30d, stock 2 <= 3 -> target 1 + 3 = 4 -> order 2
    expect(byName['Product B']).toMatchObject({ suggestedQuantity: 2, targetStock: 4 });
    // E: out of stock, no sales -> heuristic 2 x threshold, critical, no division by zero
    expect(byName['Product E']).toMatchObject({ priority: 'critical', suggestedQuantity: 10, coverDays: null, dataStatus: 'no_recent_sales' });

    expect(items[0].priority).toBe('critical'); // critical sorted first
    expect(items.find((i) => i.productName === 'Product C')).toBeUndefined(); // healthy
    expect(res.body.data.note).toContain('estimates');
  });

  it('supports priority filtering and custom thresholds', async () => {
    const critical = await api().get('/api/v1/analytics/restock-recommendations').query({ priority: 'critical' });
    expect(critical.body.data.items.every((i: { priority: string }) => i.priority === 'critical')).toBe(true);
    expect((await api().get('/api/v1/analytics/restock-recommendations').query({ windowDays: 1 })).status).toBe(400);
  });
});
