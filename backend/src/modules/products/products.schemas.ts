import { z } from 'zod';
import { paginationSchema } from '../../lib/pagination';
import { optionalTrimmed, uuidSchema } from '../../lib/validation';

const skuSchema = z
  .string({ error: 'SKU is required' })
  .trim()
  .toUpperCase()
  .min(2, 'SKU must be at least 2 characters')
  .max(40, 'SKU must be at most 40 characters')
  .regex(/^[A-Z0-9][A-Z0-9\-_.\/]*$/, 'SKU may contain only letters, numbers, - _ . /');

const priceSchema = z.coerce
  .number({ error: 'Unit price must be a number' })
  .min(0, 'Unit price cannot be negative')
  .max(9_999_999_999.99, 'Unit price is too large')
  .refine((v) => Math.round(v * 100) / 100 === v, 'Unit price can have at most 2 decimal places');

const reorderSchema = z.coerce
  .number({ error: 'Reorder level must be a number' })
  .int('Reorder level must be a whole number')
  .min(0, 'Reorder level cannot be negative')
  .max(10_000_000);

const productBase = {
  sku: skuSchema,
  name: z.string({ error: 'Name is required' }).trim().min(2, 'Name must be at least 2 characters').max(160),
  description: optionalTrimmed(1000),
  category: z.string({ error: 'Category is required' }).trim().min(2, 'Category is required').max(80),
  unit: z.string().trim().min(1).max(20).default('pcs'),
  unitPrice: priceSchema,
  reorderLevel: reorderSchema.default(10),
};

export const openingStockSchema = z
  .array(
    z.object({
      warehouseId: uuidSchema,
      quantity: z.coerce.number().int().min(1, 'Opening quantity must be at least 1').max(1_000_000),
    }),
  )
  .max(20)
  .refine((rows) => new Set(rows.map((r) => r.warehouseId)).size === rows.length, 'Each warehouse may appear only once')
  .optional();

export const createProductSchema = z.object({
  ...productBase,
  isActive: z.boolean().default(true),
  openingStock: openingStockSchema,
});

export const updateProductSchema = z
  .object({
    sku: productBase.sku.optional(),
    name: productBase.name.optional(),
    description: productBase.description,
    category: productBase.category.optional(),
    unit: z.string().trim().min(1).max(20).optional(),
    unitPrice: priceSchema.optional(),
    reorderLevel: reorderSchema.optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'Provide at least one field to update' });

export const productStatusSchema = z.object({ isActive: z.boolean({ error: 'isActive must be a boolean' }) });

export const listProductsQuery = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(80).optional(),
  status: z.enum(['active', 'inactive', 'all']).default('all'),
  stockStatus: z.enum(['in_stock', 'low_stock', 'out_of_stock', 'all']).default('all'),
  warehouseId: uuidSchema.optional(),
  sortBy: z.enum(['name', 'sku', 'category', 'unitPrice', 'totalStock', 'stockValue', 'createdAt', 'updatedAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuery>;
