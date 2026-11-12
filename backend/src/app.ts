import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { createApiRateLimiter } from './middleware/rateLimit';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { productsRouter } from './modules/products/products.routes';
import { warehousesRouter } from './modules/warehouses/warehouses.routes';
import { inventoryRouter } from './modules/inventory/inventory.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { auditRouter } from './modules/audit/audit.routes';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['Content-Disposition'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  if (env.LOG_REQUESTS && env.NODE_ENV !== 'test') app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  app.get('/api/health', async (_req, res) => {
    let database: 'up' | 'down' = 'up';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    res.status(database === 'up' ? 200 : 503).json({
      status: database === 'up' ? 'ok' : 'degraded',
      service: 'stocksense-api',
      database,
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api', createApiRateLimiter());
  app.use('/api/auth', authRouter());
  app.use('/api/users', usersRouter());
  app.use('/api/products', productsRouter());
  app.use('/api/warehouses', warehousesRouter());
  app.use('/api/inventory', inventoryRouter());
  app.use('/api/dashboard', dashboardRouter());
  app.use('/api/reports', reportsRouter());
  app.use('/api/audit-logs', auditRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
