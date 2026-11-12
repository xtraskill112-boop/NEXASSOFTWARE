import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { paginated, toSkipTake } from '../../lib/pagination';
import { AuditAction } from '../../lib/audit';
import { describeActivity } from './audit.describe';
import type { ListAuditLogsQuery } from './audit.schemas';

export async function listAuditLogs(q: ListAuditLogsQuery) {
  const where: Prisma.AuditLogWhereInput = {
    ...(q.action ? { action: q.action } : {}),
    ...(q.entityType ? { entityType: q.entityType } : {}),
    ...(q.entityId ? { entityId: q.entityId } : {}),
    ...(q.userId ? { userId: q.userId } : {}),
    ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
    ...(q.search
      ? {
          OR: [
            { action: { contains: q.search, mode: 'insensitive' } },
            { entityType: { contains: q.search, mode: 'insensitive' } },
            { entityId: { contains: q.search, mode: 'insensitive' } },
            { ipAddress: { contains: q.search, mode: 'insensitive' } },
            { user: { name: { contains: q.search, mode: 'insensitive' } } },
            { user: { email: { contains: q.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      ...toSkipTake(q),
    }),
    prisma.auditLog.count({ where }),
  ]);

  return paginated(
    items.map((log) => ({ ...log, description: describeActivity(log.action, log.details) })),
    total,
    q,
  );
}

export async function auditFilterOptions() {
  const entityTypes = await prisma.auditLog.findMany({ distinct: ['entityType'], select: { entityType: true }, orderBy: { entityType: 'asc' } });
  return {
    actions: Object.values(AuditAction).sort(),
    entityTypes: entityTypes.map((e) => e.entityType),
  };
}
