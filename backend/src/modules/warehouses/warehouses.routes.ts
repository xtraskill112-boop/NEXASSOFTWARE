import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { auditContext } from '../../lib/audit';
import { param } from '../../lib/http';
import { uuidSchema } from '../../lib/validation';
import { createWarehouseSchema, listWarehousesQuery, updateWarehouseSchema, warehouseStatusSchema } from './warehouses.schemas';
import * as warehousesService from './warehouses.service';

export function warehousesRouter() {
  const router = Router();
  router.use(authenticate);

  router.get('/', requirePermission('warehouses:view'), async (req, res) => {
    const { includeInactive } = listWarehousesQuery.parse(req.query);
    res.json({ data: await warehousesService.listWarehouses(includeInactive ?? true) });
  });

  router.get('/:id', requirePermission('warehouses:view'), async (req, res) => {
    res.json({ data: await warehousesService.getWarehouse(uuidSchema.parse(param(req, 'id'))) });
  });

  router.post('/', requirePermission('warehouses:manage'), async (req, res) => {
    const warehouse = await warehousesService.createWarehouse(createWarehouseSchema.parse(req.body), auditContext(req));
    res.status(201).json({ data: warehouse });
  });

  router.put('/:id', requirePermission('warehouses:manage'), async (req, res) => {
    const id = uuidSchema.parse(param(req, 'id'));
    res.json({ data: await warehousesService.updateWarehouse(id, updateWarehouseSchema.parse(req.body), auditContext(req)) });
  });

  router.patch('/:id/status', requirePermission('warehouses:manage'), async (req, res) => {
    const id = uuidSchema.parse(param(req, 'id'));
    const { isActive } = warehouseStatusSchema.parse(req.body);
    res.json({ data: await warehousesService.setWarehouseStatus(id, isActive, auditContext(req)) });
  });

  return router;
}
