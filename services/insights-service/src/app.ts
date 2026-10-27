import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { HttpCatalogClient, type CatalogClient } from './clients/catalog.client';
import { defaultAnalyticsConfig, type AnalyticsConfig } from './config/analytics';
import { isDbUp } from './config/db';
import { env } from './config/env';
import { logger } from './config/logger';
import { openApiSpec } from './docs/openapi';
import { errorHandler, notFoundHandler } from './middleware/error';
import { createApiRouter } from './routes';
import { createAnalyticsService } from './services/analytics.service';
import { createSaleService } from './services/sale.service';

export interface AppDeps {
  catalog?: CatalogClient;
  analyticsConfig?: AnalyticsConfig;
  now?: () => Date;
}

export function createApp(deps: AppDeps = {}): Express {
  const catalog = deps.catalog ?? new HttpCatalogClient(env.CATALOG_SERVICE_URL, env.CATALOG_TIMEOUT_MS);
  const sales = createSaleService({ catalog, now: deps.now });
  const analytics = createAnalyticsService({
    catalog,
    config: deps.analyticsConfig ?? defaultAnalyticsConfig,
    now: deps.now,
  });

  const app = express();
  app.disable('x-powered-by');

  // Swagger UI needs inline scripts/styles, so the CSP is relaxed for /api-docs only.
  app.use('/api-docs', helmet({ contentSecurityPolicy: false }), swaggerUi.serve, swaggerUi.setup(openApiSpec));
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin)),
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Idempotency-Key'],
      exposedHeaders: ['Idempotent-Replay'],
    }),
  );
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.RATE_LIMIT_MAX,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } },
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    const db = isDbUp();
    res.status(db ? 200 : 503).json({
      status: db ? 'ok' : 'degraded',
      service: 'insights-service',
      database: db ? 'up' : 'down',
      uptimeSeconds: Math.round(process.uptime()),
    });
  });
  app.get('/api-docs.json', (_req, res) => res.json(openApiSpec));

  app.use('/api/v1', createApiRouter({ sales, analytics }));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
