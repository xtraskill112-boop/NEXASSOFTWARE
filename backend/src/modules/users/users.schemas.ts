import { z } from 'zod';
import { emailSchema, passwordSchema } from '../../lib/validation';
import { paginationSchema } from '../../lib/pagination';

export const roleSchema = z.enum(['ADMIN', 'MANAGER', 'STAFF'], { error: 'Role must be ADMIN, MANAGER or STAFF' });

const nameSchema = z.string({ error: 'Name is required' }).trim().min(2, 'Name must be at least 2 characters').max(120);

export const createUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  role: roleSchema,
  password: passwordSchema,
});

export const updateUserSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    role: roleSchema.optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Provide at least one field to update' });

export const userStatusSchema = z.object({ isActive: z.boolean({ error: 'isActive must be a boolean' }) });

export const resetPasswordSchema = z.object({ password: passwordSchema });

export const listUsersQuery = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  role: roleSchema.optional(),
  status: z.enum(['active', 'inactive', 'all']).default('all'),
});
