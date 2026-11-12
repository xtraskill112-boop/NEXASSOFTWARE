import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { hashPassword } from '../../lib/password';
import { AuditAction, writeAudit, type AuditContext } from '../../lib/audit';
import { paginated, toSkipTake } from '../../lib/pagination';
import { publicUserSelect } from '../auth/auth.service';
import type { z } from 'zod';
import type { createUserSchema, listUsersQuery, updateUserSchema } from './users.schemas';

export async function listUsers(q: z.infer<typeof listUsersQuery>) {
  const where: Prisma.UserWhereInput = {
    ...(q.role ? { role: q.role } : {}),
    ...(q.status === 'active' ? { isActive: true } : q.status === 'inactive' ? { isActive: false } : {}),
    ...(q.search
      ? {
          OR: [
            { name: { contains: q.search, mode: 'insensitive' } },
            { email: { contains: q.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({ where, select: publicUserSelect, orderBy: [{ isActive: 'desc' }, { name: 'asc' }], ...toSkipTake(q) }),
    prisma.user.count({ where }),
  ]);
  return paginated(items, total, q);
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: publicUserSelect });
  if (!user) throw AppError.notFound('User');
  return user;
}

async function assertNotLastAdmin(tx: Prisma.TransactionClient, userId: string) {
  const remaining = await tx.user.count({ where: { role: 'ADMIN', isActive: true, id: { not: userId } } });
  if (remaining === 0) throw AppError.conflict('At least one active administrator must remain in the system');
}

export async function createUser(input: z.infer<typeof createUserSchema>, ctx: AuditContext) {
  const exists = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (exists) throw AppError.conflict('A user with this email already exists');

  const passwordHash = await hashPassword(input.password);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name: input.name, email: input.email, role: input.role, passwordHash },
      select: publicUserSelect,
    });
    await writeAudit(
      ctx,
      { action: AuditAction.USER_CREATED, entityType: 'User', entityId: user.id, details: { name: user.name, email: user.email, role: user.role } },
      tx,
    );
    return user;
  });
}

export async function updateUser(id: string, input: z.infer<typeof updateUserSchema>, ctx: AuditContext) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.user.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('User');

    if (input.role && input.role !== current.role) {
      if (id === ctx.userId) throw AppError.conflict('You cannot change your own role');
      if (current.role === 'ADMIN') await assertNotLastAdmin(tx, id);
    }
    if (input.email && input.email !== current.email) {
      const taken = await tx.user.findUnique({ where: { email: input.email }, select: { id: true } });
      if (taken) throw AppError.conflict('A user with this email already exists');
    }

    const roleChanged = input.role !== undefined && input.role !== current.role;
    const user = await tx.user.update({
      where: { id },
      data: { ...input, ...(roleChanged ? { tokenVersion: { increment: 1 } } : {}) },
      select: publicUserSelect,
    });

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of ['name', 'email', 'role'] as const) {
      if (input[key] !== undefined && input[key] !== current[key]) changes[key] = { from: current[key], to: input[key] };
    }
    await writeAudit(ctx, { action: AuditAction.USER_UPDATED, entityType: 'User', entityId: id, details: { changes } as Prisma.InputJsonValue }, tx);
    return user;
  });
}

export async function setUserStatus(id: string, isActive: boolean, ctx: AuditContext) {
  if (id === ctx.userId && !isActive) throw AppError.conflict('You cannot deactivate your own account');
  return prisma.$transaction(async (tx) => {
    const current = await tx.user.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('User');
    if (!isActive && current.role === 'ADMIN') await assertNotLastAdmin(tx, id);

    const user = await tx.user.update({
      where: { id },
      // Deactivation invalidates any issued tokens immediately.
      data: { isActive, ...(isActive ? {} : { tokenVersion: { increment: 1 } }) },
      select: publicUserSelect,
    });
    await writeAudit(
      ctx,
      {
        action: isActive ? AuditAction.USER_ACTIVATED : AuditAction.USER_DEACTIVATED,
        entityType: 'User',
        entityId: id,
        details: { email: user.email },
      },
      tx,
    );
    return user;
  });
}

export async function resetPassword(id: string, password: string, ctx: AuditContext) {
  const passwordHash = await hashPassword(password);
  return prisma.$transaction(async (tx) => {
    const exists = await tx.user.findUnique({ where: { id }, select: { id: true, email: true } });
    if (!exists) throw AppError.notFound('User');
    await tx.user.update({ where: { id }, data: { passwordHash, tokenVersion: { increment: 1 } } });
    await writeAudit(ctx, { action: AuditAction.USER_PASSWORD_RESET, entityType: 'User', entityId: id, details: { email: exists.email } }, tx);
  });
}

