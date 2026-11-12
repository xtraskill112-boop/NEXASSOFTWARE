import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import { lowStockQuery } from './reports.schemas';
import { lowStockCsv, lowStockReport } from './reports.service';

export function reportsRouter() {
  const router = Router();
  router.use(authenticate, requirePermission('reports:view'));

  router.get('/low-stock', async (req, res) => {
    const query = lowStockQuery.parse(req.query);
    const report = await lowStockReport(query);

    if (query.format === 'csv') {
      const warehouses = await prisma.warehouse.findMany({ orderBy: { code: 'asc' }, select: { code: true } });
      const date = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="low-stock-report-${date}.csv"`);
      res.send('﻿' + lowStockCsv(report, warehouses.map((w) => w.code)));
      return;
    }
    res.json(report);
  });

  return router;
}
