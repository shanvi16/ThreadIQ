import { Router, type RequestHandler } from 'express';
import { createAnalyticsController, createSaleController } from '../controllers';
import { validate } from '../middleware/validate';
import type { AnalyticsService } from '../services/analytics.service';
import type { SaleService } from '../services/sale.service';
import {
  rangeQuery,
  restockQuery,
  revenueTrendQuery,
  slowMovingQuery,
  topProductsQuery,
  trendScoresQuery,
} from '../validators/analytics.validators';
import { createSaleBody, idParams, listSalesQuery } from '../validators/sale.validators';

/** Lets clients send the key as an `Idempotency-Key` header instead of a body field. */
const idempotencyHeader: RequestHandler = (req, _res, next) => {
  const header = req.get('idempotency-key');
  if (header && req.body && typeof req.body === 'object' && !('idempotencyKey' in req.body)) {
    req.body.idempotencyKey = header;
  }
  next();
};

export function createApiRouter(deps: { sales: SaleService; analytics: AnalyticsService }): Router {
  const router = Router();
  const sales = createSaleController(deps.sales);
  const analytics = createAnalyticsController(deps.analytics);

  router.get('/sales', validate({ query: listSalesQuery }), sales.list);
  router.post('/sales', idempotencyHeader, validate({ body: createSaleBody }), sales.create);
  router.get('/sales/:id', validate({ params: idParams }), sales.get);

  router.get('/analytics/overview', validate({ query: rangeQuery }), analytics.overview);
  router.get('/analytics/revenue-trend', validate({ query: revenueTrendQuery }), analytics.revenueTrend);
  router.get('/analytics/category-performance', validate({ query: rangeQuery }), analytics.categoryPerformance);
  router.get('/analytics/top-products', validate({ query: topProductsQuery }), analytics.topProducts);
  router.get('/analytics/slow-moving', validate({ query: slowMovingQuery }), analytics.slowMoving);
  router.get('/analytics/trend-scores', validate({ query: trendScoresQuery }), analytics.trendScores);
  router.get('/analytics/restock-recommendations', validate({ query: restockQuery }), analytics.restockRecommendations);
  return router;
}
