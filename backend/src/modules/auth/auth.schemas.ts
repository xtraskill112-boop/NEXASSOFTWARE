import { z } from 'zod';
import { emailSchema, passwordSchema } from '../../lib/validation';

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required').max(200),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: 'New password must be different from the current password',
    path: ['newPassword'],
  });
