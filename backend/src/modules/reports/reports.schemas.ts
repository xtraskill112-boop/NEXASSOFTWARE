import { z } from 'zod';
import { uuidSchema } from '../../lib/validation';

export const lowStockQuery = z.object({
  warehouseId: uuidSchema.optional(),
  category: z.string().trim().max(80).optional(),
  search: z.string().trim().max(100).optional(),
  status: z.enum(['all', 'low', 'out']).default('all'),
  format: z.enum(['json', 'csv']).default('json'),
});

export type LowStockQuery = z.infer<typeof lowStockQuery>;
