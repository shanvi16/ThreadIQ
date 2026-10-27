import 'dotenv/config';
import { z } from 'zod';

const positive = (def: number) => z.coerce.number().positive().default(def);
const positiveInt = (def: number) => z.coerce.number().int().min(1).default(def);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/threadiq_sales'),
  CATALOG_SERVICE_URL: z.string().url().default('http://localhost:3001'),
  CATALOG_TIMEOUT_MS: positiveInt(5000),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  RATE_LIMIT_MAX: positiveInt(600),
  RATE_LIMIT_WINDOW_MS: positiveInt(60_000),

  // Analytics rules (documented in docs/architecture.md)
  TREND_WINDOW_DAYS: positiveInt(14),
  TREND_BASELINE_UNITS_PER_DAY: positive(2),
  TREND_TARGET_COVER_DAYS: positive(30),
  SLOW_LOOKBACK_DAYS: positiveInt(30),
  SLOW_MAX_UNITS_PER_DAY: positive(0.1),
  RESTOCK_WINDOW_DAYS: positiveInt(30),
  RESTOCK_COVER_THRESHOLD_DAYS: positive(14),
  RESTOCK_TARGET_COVER_DAYS: positive(30),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
};
