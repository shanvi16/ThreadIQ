import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { isDbUp } from './config/db';
import { env } from './config/env';
import { logger } from './config/logger';
import { openApiSpec } from './docs/openapi';
import { errorHandler, notFoundHandler } from './middleware/error';
import { apiRouter } from './routes';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');

  // Swagger UI needs inline scripts/styles, so the CSP is relaxed for /api-docs only.
  app.use('/api-docs', helmet({ contentSecurityPolicy: false }), swaggerUi.serve, swaggerUi.setup(openApiSpec));
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => {
        // Non-browser clients (curl, other services) send no Origin header.
        if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );
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
      service: 'catalog-service',
      database: db ? 'up' : 'down',
      uptimeSeconds: Math.round(process.uptime()),
    });
  });
  app.get('/api-docs.json', (_req, res) => res.json(openApiSpec));

  app.use('/api/v1', apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
