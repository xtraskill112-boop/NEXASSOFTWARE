import { env } from './config/env';
import { createApp } from './app';
import { prisma } from './lib/prisma';

async function main() {
  if (env.NODE_ENV === 'production' && /change|insecure|example|dev-only/i.test(env.JWT_SECRET)) {
    // eslint-disable-next-line no-console
    console.warn('[security] JWT_SECRET looks like a placeholder. Set a strong random secret before going live.');
  }
  await prisma.$connect();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`StockSense API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`${signal} received, shutting down gracefully...`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start StockSense API', err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
