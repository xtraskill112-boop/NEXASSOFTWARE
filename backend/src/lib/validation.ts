import { z } from 'zod';

export const emailSchema = z
  .string({ error: 'Email is required' })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Enter a valid email address' }).max(254));

/** Password policy: 8-72 chars (bcrypt limit), at least one letter and one digit. */
export const passwordSchema = z
  .string({ error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const uuidSchema = z.uuid({ error: 'Must be a valid UUID' });

export const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v === undefined ? undefined : v === null || v === '' ? null : v));

export const booleanQuery = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();
