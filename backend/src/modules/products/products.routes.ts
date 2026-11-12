import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { auditContext } from '../../lib/audit';
import { param } from '../../lib/http';
import { uuidSchema } from '../../lib/validation';
import { createProductSchema, listProductsQuery, productStatusSchema, updateProductSchema } from './products.schemas';
import * as productsService from './products.service';

export function productsRouter() {
  const router = Router();
  router.use(authenticate);

  router.get('/', requirePermission('products:view'), async (req, res) => {
    res.json(await productsService.listProducts(listProductsQuery.parse(req.query)));
  });

  router.get('/categories', requirePermission('products:view'), async (_req, res) => {
    res.json({ data: await productsService.listCategories() });
  });

  router.get('/:id', requirePermission('products:view'), async (req, res) => {
    res.json({ data: await productsService.getProduct(uuidSchema.parse(param(req, 'id'))) });
  });

  router.post('/', requirePermission('products:create'), async (req, res) => {
    const product = await productsService.createProduct(createProductSchema.parse(req.body), auditContext(req));
    res.status(201).json({ data: product });
  });

  router.put('/:id', requirePermission('products:update'), async (req, res) => {
    const id = uuidSchema.parse(param(req, 'id'));
    res.json({ data: await productsService.updateProduct(id, updateProductSchema.parse(req.body), auditContext(req)) });
  });

  router.patch('/:id/status', requirePermission('products:deactivate'), async (req, res) => {
    const id = uuidSchema.parse(param(req, 'id'));
    const { isActive } = productStatusSchema.parse(req.body);
    res.json({ data: await productsService.setProductStatus(id, isActive, auditContext(req)) });
  });

  router.delete('/:id', requirePermission('products:delete'), async (req, res) => {
    await productsService.deleteProduct(uuidSchema.parse(param(req, 'id')), auditContext(req));
    res.status(204).end();
  });

  return router;
}
