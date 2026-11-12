import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { auditContext } from '../../lib/audit';
import { listMovementsQuery, stockLevelsQuery, stockMovementSchema, transferSchema } from './inventory.schemas';
import * as inventoryService from './inventory.service';

export function inventoryRouter() {
  const router = Router();
  router.use(authenticate);

  router.get('/movements', requirePermission('inventory:view'), async (req, res) => {
    res.json(await inventoryService.listMovements(listMovementsQuery.parse(req.query)));
  });

  router.get('/stock-levels', requirePermission('inventory:view'), async (req, res) => {
    res.json(await inventoryService.listStockLevels(stockLevelsQuery.parse(req.query)));
  });

  router.post('/stock-in', requirePermission('inventory:stock-in'), async (req, res) => {
    const result = await inventoryService.stockIn(stockMovementSchema.parse(req.body), auditContext(req));
    res.status(201).json({ data: result });
  });

  router.post('/stock-out', requirePermission('inventory:stock-out'), async (req, res) => {
    const result = await inventoryService.stockOut(stockMovementSchema.parse(req.body), auditContext(req));
    res.status(201).json({ data: result });
  });

  router.post('/transfer', requirePermission('inventory:transfer'), async (req, res) => {
    const result = await inventoryService.transfer(transferSchema.parse(req.body), auditContext(req));
    res.status(201).json({ data: result });
  });

  return router;
}
