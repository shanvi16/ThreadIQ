import type { AnalyticsService } from '../services/analytics.service';
import type { SaleService } from '../services/sale.service';
import { asyncHandler } from '../utils/http';

export function createSaleController(sales: SaleService) {
  return {
    create: asyncHandler(async (req, res) => {
      const { sale, replayed } = await sales.create(req.body);
      if (replayed) res.set('Idempotent-Replay', 'true');
      res.status(replayed ? 200 : 201).location(`/api/v1/sales/${sale.id}`).json({ data: sale, meta: { replayed } });
    }),
    list: asyncHandler(async (req, res) => {
      res.json(await sales.list(req.query as never));
    }),
    get: asyncHandler(async (req, res) => {
      res.json({ data: await sales.getById(req.params.id) });
    }),
  };
}

export function createAnalyticsController(analytics: AnalyticsService) {
  const handler = <K extends keyof AnalyticsService>(method: K) =>
    asyncHandler(async (req, res) => {
      const result = await (analytics[method] as (q: unknown) => Promise<unknown>)(req.query);
      res.json({ data: result });
    });

  return {
    overview: handler('overview'),
    revenueTrend: handler('revenueTrend'),
    categoryPerformance: handler('categoryPerformance'),
    topProducts: handler('topProducts'),
    slowMoving: handler('slowMoving'),
    trendScores: handler('trendScores'),
    restockRecommendations: handler('restockRecommendations'),
  };
}
