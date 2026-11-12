import type { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { getDummyHash, hashPassword, verifyPassword } from '../../lib/password';
import { decodeExpiry, signAccessToken } from '../../lib/jwt';
import { permissionsForRole } from '../../lib/permissions';
import { AuditAction, writeAudit, type AuditContext } from '../../lib/audit';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function session(user: { id: string; role: Role; tokenVersion: number }) {
  const token = signAccessToken({ sub: user.id, role: user.role, ver: user.tokenVersion });
  return { token, expiresAt: decodeExpiry(token) };
}

export async function login(email: string, password: string, ctx: AuditContext) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    await verifyPassword(password, await getDummyHash()); // constant-time-ish response
    await writeAudit(ctx, {
      action: AuditAction.AUTH_LOGIN_FAILED,
      entityType: 'User',
      details: { email, reason: 'UNKNOWN_EMAIL' },
    });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await writeAudit(
      { ...ctx, userId: user.id },
      { action: AuditAction.AUTH_LOGIN_FAILED, entityType: 'User', entityId: user.id, details: { email, reason: 'BAD_PASSWORD' } },
    );
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  if (!user.isActive) {
    await writeAudit(
      { ...ctx, userId: user.id },
      { action: AuditAction.AUTH_LOGIN_FAILED, entityType: 'User', entityId: user.id, details: { email, reason: 'ACCOUNT_DEACTIVATED' } },
    );
    throw new AppError(401, 'UNAUTHORIZED', 'Your account has been deactivated. Contact an administrator.');
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
    select: { ...publicUserSelect, tokenVersion: true },
  });

  await writeAudit(
    { ...ctx, userId: user.id },
    { action: AuditAction.AUTH_LOGIN, entityType: 'User', entityId: user.id, details: { email } },
  );

  const { tokenVersion, ...publicUser } = updated;
  return {
    ...session({ id: user.id, role: user.role, tokenVersion }),
    user: { ...publicUser, permissions: permissionsForRole(user.role) },
  };
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUserSelect });
  if (!user) throw AppError.notFound('User');
  return { ...user, permissions: permissionsForRole(user.role) };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string, ctx: AuditContext) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.notFound('User');

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw AppError.badRequest('Current password is incorrect', [{ path: 'currentPassword', message: 'Current password is incorrect' }]);

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword), tokenVersion: { increment: 1 } },
      select: { id: true, role: true, tokenVersion: true },
    });
    await writeAudit(ctx, { action: AuditAction.AUTH_PASSWORD_CHANGED, entityType: 'User', entityId: userId }, tx);
    return u;
  });

  // Other sessions are invalidated (token version bumped); issue a fresh token for this one.
  return session(updated);
}
