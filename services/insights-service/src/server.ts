import { createApp } from './app';
import { connectDb, disconnectDb } from './config/db';
import { env } from './config/env';
import { logger } from './config/logger';
import { SaleModel } from './models/sale.model';

async function main() {
  await connectDb(env.MONGODB_URI);
  await SaleModel.init();

  const server = createApp().listen(env.PORT, () => {
    logger.info(`Sales & Insights Service listening on port ${env.PORT} (catalog: ${env.CATALOG_SERVICE_URL})`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    server.close(async () => {
      await disconnectDb().catch(() => undefined);
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start Sales & Insights Service');
  process.exit(1);
});
