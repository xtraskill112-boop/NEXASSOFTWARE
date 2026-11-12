import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors';
import { verifyAccessToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { hasPermission, type Permission } from '../lib/permissions';

/**
 * Verifies the Bearer JWT and loads the current user from the database on every request,
 * so deactivations, role changes and password changes take effect immediately.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.get('authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    return next(AppError.unauthorized('Missing or malformed Authorization header'));
  }
  const token = header.slice(7).trim();

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return next(AppError.unauthorized('Invalid or expired token'));
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, name: true, role: true, isActive: true, tokenVersion: true },
  });

  if (!user || !user.isActive || user.tokenVersion !== payload.ver) {
    return next(AppError.unauthorized('Session is no longer valid. Please sign in again.'));
  }

  req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
  return next();
}

export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!hasPermission(req.user.role, permission)) {
      return next(AppError.forbidden(`Your role (${req.user.role}) is not allowed to perform this action`));
    }
    return next();
  };
}
