import { z } from 'zod';
import { paginationSchema } from '../../lib/pagination';
import { booleanQuery, optionalTrimmed, uuidSchema } from '../../lib/validation';

const quantitySchema = z.coerce
  .number({ error: 'Quantity must be a number' })
  .int('Quantity must be a whole number')
  .min(1, 'Quantity must be at least 1')
  .max(1_000_000, 'Quantity cannot exceed 1,000,000 per operation');

const common = {
  productId: uuidSchema,
  quantity: quantitySchema,
  reference: optionalTrimmed(80),
  notes: optionalTrimmed(500),
};

export const stockMovementSchema = z.object({ ...common, warehouseId: uuidSchema });

export const transferSchema = z
  .object({ ...common, fromWarehouseId: uuidSchema, toWarehouseId: uuidSchema })
  .refine((d) => d.fromWarehouseId !== d.toWarehouseId, {
    message: 'Destination warehouse must differ from the source warehouse',
    path: ['toWarehouseId'],
  });

const dateQuery = z.coerce.date({ error: 'Invalid date' }).optional();

export const listMovementsQuery = paginationSchema.extend({
  type: z.enum(['STOCK_IN', 'STOCK_OUT', 'TRANSFER']).optional(),
  productId: uuidSchema.optional(),
  warehouseId: uuidSchema.optional(),
  userId: uuidSchema.optional(),
  search: z.string().trim().max(100).optional(),
  from: dateQuery,
  to: dateQuery,
});

export const stockLevelsQuery = paginationSchema.extend({
  warehouseId: uuidSchema.optional(),
  productId: uuidSchema.optional(),
  search: z.string().trim().max(100).optional(),
  onlyInStock: booleanQuery,
  includeInactive: booleanQuery,
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

export type StockMovementInput = z.infer<typeof stockMovementSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
export type ListMovementsQuery = z.infer<typeof listMovementsQuery>;
export type StockLevelsQuery = z.infer<typeof stockLevelsQuery>;
