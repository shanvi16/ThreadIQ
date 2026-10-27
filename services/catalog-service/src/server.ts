import { createApp } from './app';
import { connectDb, disconnectDb } from './config/db';
import { env } from './config/env';
import { logger } from './config/logger';
import { ProductModel } from './models/product.model';
import { StockMovementModel } from './models/stock-movement.model';

async function main() {
  await connectDb(env.MONGODB_URI);
  // Make sure unique indexes exist before accepting traffic.
  await Promise.all([ProductModel.init(), StockMovementModel.init()]);

  const server = createApp().listen(env.PORT, () => {
    logger.info(`Catalog Service listening on port ${env.PORT}`);
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
  logger.fatal({ err }, 'Failed to start Catalog Service');
  process.exit(1);
});
