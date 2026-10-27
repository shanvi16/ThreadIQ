import type { CatalogClient, CatalogSummary, CatalogVariantRow } from '../clients/catalog.client';
import { logger } from '../config/logger';
import type { AnalyticsConfig } from '../config/analytics';
import { analyticsRepository } from '../repositories/analytics.repository';
import {
  classifySlowMoving,
  computeRestock,
  computeTrendScore,
  daysBetween,
  MS_PER_DAY,
  round2,
  type SlowMovingStatus,
} from '../analytics/calculations';
import { isoDay, resolveRange, startOfUtcDay, startOfUtcWeek, type DateRange } from '../utils/dates';

interface CatalogProductGroup {
  productId: string;
  name: string;
  sku: string;
  category: string;
  createdAt: Date;
  totalStock: number;
  variants: CatalogVariantRow[];
}

/** Groups the flat per-variant snapshot into active products. Archived products are excluded. */
function groupActiveProducts(rows: CatalogVariantRow[]): CatalogProductGroup[] {
  const groups = new Map<string, CatalogProductGroup>();
  for (const row of rows) {
    if (row.status !== 'active') continue;
    let group = groups.get(row.productId);
    if (!group) {
      group = {
        productId: row.productId,
        name: row.productName,
        sku: row.productSku,
        category: row.category,
        createdAt: new Date(row.productCreatedAt),
        totalStock: 0,
        variants: [],
      };
      groups.set(row.productId, group);
    }
    group.totalStock += row.stock;
    group.variants.push(row);
  }
  return [...groups.values()];
}

export interface AnalyticsServiceDeps {
  catalog: CatalogClient;
  config: AnalyticsConfig;
  now?: () => Date;
}

export function createAnalyticsService({ catalog, config, now = () => new Date() }: AnalyticsServiceDeps) {
  const period = (range: DateRange) => ({ from: range.from.toISOString(), to: range.to.toISOString() });

  /** Inventory data is best-effort for the dashboard: sales KPIs still work when the catalog is down. */
  async function tryCatalog<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'Catalog Service unavailable; returning analytics without inventory data');
      return null;
    }
  }

  return {
    async overview(q: { from?: string; to?: string }) {
      const range = resolveRange(q, now());
      const [totals, inventory] = await Promise.all([
        analyticsRepository.totals(range),
        tryCatalog(() => catalog.getSummary()),
      ]);
      return {
        period: period(range),
        revenue: round2(totals.revenue),
        grossSales: round2(totals.grossSales),
        discounts: round2(totals.discounts),
        salesCount: totals.salesCount,
        unitsSold: totals.unitsSold,
        averageOrderValue: totals.salesCount > 0 ? round2(totals.revenue / totals.salesCount) : 0,
        inventoryAvailable: inventory !== null,
        inventory: inventory as CatalogSummary | null,
      };
    },

    async revenueTrend(q: { from?: string; to?: string; interval: 'day' | 'week' }) {
      const range = resolveRange(q, now());
      const rows = await analyticsRepository.dailyRevenue(range);
      const byDay = new Map(rows.map((r) => [r._id, r]));

      const buckets = new Map<string, { revenue: number; orders: number; units: number }>();
      const bucketOf = (d: Date) => isoDay(q.interval === 'week' ? startOfUtcWeek(d) : d);
      for (let t = startOfUtcDay(range.from).getTime(); t <= range.to.getTime(); t += MS_PER_DAY) {
        const day = new Date(t);
        const key = bucketOf(day);
        const bucket = buckets.get(key) ?? { revenue: 0, orders: 0, units: 0 };
        const row = byDay.get(isoDay(day));
        if (row) {
          bucket.revenue += row.revenue;
          bucket.orders += row.orders;
          bucket.units += row.units;
        }
        buckets.set(key, bucket);
      }
      return {
        period: period(range),
        interval: q.interval,
        points: [...buckets.entries()].map(([date, v]) => ({
          date,
          revenue: round2(v.revenue),
          orders: v.orders,
          units: v.units,
        })),
      };
    },

    async categoryPerformance(q: { from?: string; to?: string }) {
      const range = resolveRange(q, now());
      const [sales, inventory] = await Promise.all([
        analyticsRepository.byCategory(range),
        tryCatalog(() => catalog.getSummary()),
      ]);
      const stock = new Map((inventory?.byCategory ?? []).map((c) => [c.category, c]));
      const categories = new Set([...sales.map((s) => s._id), ...stock.keys()]);
      const salesBy = new Map(sales.map((s) => [s._id, s]));

      const items = [...categories]
        .map((category) => ({
          category,
          revenue: round2(salesBy.get(category)?.revenue ?? 0),
          unitsSold: salesBy.get(category)?.units ?? 0,
          stockUnits: stock.get(category)?.units ?? null,
          stockValueAtCost: stock.get(category)?.valueAtCost ?? null,
        }))
        .sort((a, b) => b.revenue - a.revenue || a.category.localeCompare(b.category));
      return { period: period(range), inventoryAvailable: inventory !== null, items };
    },

    async topProducts(q: { from?: string; to?: string; limit: number; sortBy: 'units' | 'revenue' }) {
      const range = resolveRange(q, now());
      const rows = await analyticsRepository.byProduct(range, q.sortBy, q.limit);
      return {
        period: period(range),
        sortBy: q.sortBy,
        items: rows.map((r) => ({
          productId: String(r._id),
          productName: r.productName,
          productSku: r.productSku,
          category: r.category,
          unitsSold: r.units,
          revenue: round2(r.revenue),
        })),
      };
    },

    async slowMoving(q: { days?: number; limit: number; status?: Exclude<SlowMovingStatus, 'ok' | 'too_new' | 'out_of_stock'> }) {
      const cfg = { ...config.slowMoving, lookbackDays: q.days ?? config.slowMoving.lookbackDays };
      const current = now();
      const since = new Date(current.getTime() - cfg.lookbackDays * MS_PER_DAY);

      const [stats, rows] = await Promise.all([
        analyticsRepository.productStats([{ name: 'period', from: since, to: new Date(current.getTime() + 1) }]),
        catalog.getSnapshot(),
      ]);

      const summary: Record<string, number> = {
        no_sales_history: 0,
        no_recent_sales: 0,
        low_velocity: 0,
        out_of_stock: 0,
        too_new: 0,
        ok: 0,
      };
      const items = [];
      for (const p of groupActiveProducts(rows)) {
        const stat = stats.get(p.productId);
        const unitsInPeriod = stat?.period ?? 0;
        const unitsAllTime = stat?.total ?? 0;
        const ageDays = daysBetween(p.createdAt, current);
        const status = classifySlowMoving({ totalStock: p.totalStock, unitsInPeriod, unitsAllTime, productAgeDays: ageDays }, cfg);
        summary[status] += 1;
        if (status === 'ok' || status === 'too_new' || status === 'out_of_stock') continue;
        if (q.status && q.status !== status) continue;

        const lastSoldAt = stat?.lastSoldAt ?? null;
        items.push({
          productId: p.productId,
          productName: p.name,
          productSku: p.sku,
          category: p.category,
          status,
          totalStock: p.totalStock,
          stockValueAtCost: round2(p.variants.reduce((s, v) => s + v.stock * v.costPrice, 0)),
          unitsInPeriod,
          unitsPerDay: round2(unitsInPeriod / cfg.lookbackDays),
          lastSoldAt,
          daysSinceLastSale: lastSoldAt ? Math.floor(daysBetween(lastSoldAt, current)) : null,
          productAgeDays: Math.floor(ageDays),
        });
      }
      // Most capital tied up first.
      items.sort((a, b) => b.stockValueAtCost - a.stockValueAtCost);
      return {
        lookbackDays: cfg.lookbackDays,
        maxUnitsPerDay: cfg.maxUnitsPerDay,
        summary: {
          noSalesHistory: summary.no_sales_history,
          noRecentSales: summary.no_recent_sales,
          lowVelocity: summary.low_velocity,
          outOfStock: summary.out_of_stock,
          tooNewToJudge: summary.too_new,
        },
        items: items.slice(0, q.limit),
      };
    },

    async trendScores(q: { windowDays?: number; limit: number; category?: string }) {
      const cfg = { ...config.trend, windowDays: q.windowDays ?? config.trend.windowDays };
      const current = now();
      const recentFrom = new Date(current.getTime() - cfg.windowDays * MS_PER_DAY);
      const previousFrom = new Date(recentFrom.getTime() - cfg.windowDays * MS_PER_DAY);

      const [stats, rows] = await Promise.all([
        analyticsRepository.productStats([
          { name: 'recent', from: recentFrom, to: new Date(current.getTime() + 1) },
          { name: 'previous', from: previousFrom, to: recentFrom },
        ]),
        catalog.getSnapshot(),
      ]);

      const items = groupActiveProducts(rows)
        .filter((p) => !q.category || p.category === q.category)
        .map((p) => {
          const stat = stats.get(p.productId);
          const result = computeTrendScore(
            {
              recentUnits: stat?.recent ?? 0,
              previousUnits: stat?.previous ?? 0,
              totalStock: p.totalStock,
              productAgeDays: daysBetween(p.createdAt, current),
            },
            cfg,
          );
          return {
            productId: p.productId,
            productName: p.name,
            productSku: p.sku,
            category: p.category,
            totalStock: p.totalStock,
            ...result,
          };
        })
        .sort((a, b) => b.score - a.score || a.productName.localeCompare(b.productName));

      return {
        method: 'rule-based heuristic (not machine learning, not a statistical forecast)',
        windowDays: cfg.windowDays,
        recentWindow: { from: recentFrom.toISOString(), to: current.toISOString() },
        previousWindow: { from: previousFrom.toISOString(), to: recentFrom.toISOString() },
        weights: cfg.weights,
        baselineUnitsPerDay: cfg.baselineUnitsPerDay,
        targetCoverDays: cfg.targetCoverDays,
        items: items.slice(0, q.limit),
      };
    },

    async restockRecommendations(q: {
      windowDays?: number;
      coverDays?: number;
      targetDays?: number;
      limit: number;
      priority?: 'critical' | 'high' | 'medium';
    }) {
      const cfg = {
        windowDays: q.windowDays ?? config.restock.windowDays,
        coverThresholdDays: q.coverDays ?? config.restock.coverThresholdDays,
        targetCoverDays: q.targetDays ?? config.restock.targetCoverDays,
      };
      const current = now();
      const since = new Date(current.getTime() - cfg.windowDays * MS_PER_DAY);

      const [units, rows] = await Promise.all([
        analyticsRepository.variantUnits(since, new Date(current.getTime() + 1)),
        catalog.getSnapshot(),
      ]);

      const order = { critical: 0, high: 1, medium: 2 } as const;
      const items = rows
        .filter((r) => r.status === 'active')
        .flatMap((r) => {
          const result = computeRestock(
            {
              stock: r.stock,
              reorderThreshold: r.reorderThreshold,
              unitsInWindow: units.get(r.variantId) ?? 0,
              variantAgeDays: daysBetween(new Date(r.productCreatedAt), current),
            },
            cfg,
          );
          if (!result || (q.priority && result.priority !== q.priority)) return [];
          return [
            {
              productId: r.productId,
              productName: r.productName,
              variantId: r.variantId,
              variantSku: r.variantSku,
              category: r.category,
              size: r.size,
              color: r.color,
              currentStock: r.stock,
              reorderThreshold: r.reorderThreshold,
              estimatedCostToReorder: round2(result.suggestedQuantity * r.costPrice),
              ...result,
            },
          ];
        })
        .sort((a, b) => order[a.priority] - order[b.priority] || (a.coverDays ?? Infinity) - (b.coverDays ?? Infinity));

      return {
        note: 'Suggestions are estimates based on recent average sales, not a demand forecast.',
        windowDays: cfg.windowDays,
        coverThresholdDays: cfg.coverThresholdDays,
        targetCoverDays: cfg.targetCoverDays,
        total: items.length,
        items: items.slice(0, q.limit),
      };
    },
  };
}

export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
