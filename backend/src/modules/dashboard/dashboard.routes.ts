import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { getDashboardSummary } from './dashboard.service';

export function dashboardRouter() {
  const router = Router();
  router.get('/summary', authenticate, requirePermission('dashboard:view'), async (_req, res) => {
    res.json({ data: await getDashboardSummary() });
  });
  return router;
}
