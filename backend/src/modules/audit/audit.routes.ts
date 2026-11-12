import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { listAuditLogsQuery } from './audit.schemas';
import * as auditService from './audit.service';

export function auditRouter() {
  const router = Router();
  router.use(authenticate, requirePermission('audit:view'));

  router.get('/', async (req, res) => {
    res.json(await auditService.listAuditLogs(listAuditLogsQuery.parse(req.query)));
  });

  router.get('/filters', async (_req, res) => {
    res.json({ data: await auditService.auditFilterOptions() });
  });

  return router;
}
