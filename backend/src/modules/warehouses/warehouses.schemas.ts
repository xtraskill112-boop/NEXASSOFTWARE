import { z } from 'zod';
import { booleanQuery, optionalTrimmed } from '../../lib/validation';

const codeSchema = z
  .string({ error: 'Code is required' })
  .trim()
  .toUpperCase()
  .min(2, 'Code must be at least 2 characters')
  .max(20, 'Code must be at most 20 characters')
  .regex(/^[A-Z0-9][A-Z0-9\-_]*$/, 'Code may contain only letters, numbers, - and _');

const capacitySchema = z.coerce
  .number({ error: 'Capacity must be a number' })
  .int('Capacity must be a whole number')
  .min(1, 'Capacity must be at least 1')
  .max(1_000_000_000)
  .nullable()
  .optional();

export const createWarehouseSchema = z.object({
  code: codeSchema,
  name: z.string({ error: 'Name is required' }).trim().min(2, 'Name must be at least 2 characters').max(120),
  city: z.string({ error: 'City is required' }).trim().min(2, 'City is required').max(80),
  address: optionalTrimmed(255),
  capacity: capacitySchema,
});

export const updateWarehouseSchema = z
  .object({
    code: codeSchema.optional(),
    name: z.string().trim().min(2).max(120).optional(),
    city: z.string().trim().min(2).max(80).optional(),
    address: optionalTrimmed(255),
    capacity: capacitySchema,
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'Provide at least one field to update' });

export const warehouseStatusSchema = z.object({ isActive: z.boolean({ error: 'isActive must be a boolean' }) });

export const listWarehousesQuery = z.object({ includeInactive: booleanQuery });

export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
