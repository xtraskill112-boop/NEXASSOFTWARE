import type { Request } from 'express';
import { AppError } from './errors';

/** Express 5 route params are typed as string | string[]; normalise to a single string. */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || value.length === 0) throw AppError.badRequest(`Missing route parameter: ${name}`);
  return value;
}
