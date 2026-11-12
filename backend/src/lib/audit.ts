import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma, type TxClient } from './prisma';

export const AuditAction = {
  AUTH_LOGIN: 'AUTH_LOGIN',
  AUTH_LOGIN_FAILED: 'AUTH_LOGIN_FAILED',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  AUTH_PASSWORD_CHANGED: 'AUTH_PASSWORD_CHANGED',
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_ACTIVATED: 'USER_ACTIVATED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  USER_PASSWORD_RESET: 'USER_PASSWORD_RESET',
  PRODUCT_CREATED: 'PRODUCT_CREATED',
  PRODUCT_UPDATED: 'PRODUCT_UPDATED',
  PRODUCT_ACTIVATED: 'PRODUCT_ACTIVATED',
  PRODUCT_DEACTIVATED: 'PRODUCT_DEACTIVATED',
  PRODUCT_DELETED: 'PRODUCT_DELETED',
  WAREHOUSE_CREATED: 'WAREHOUSE_CREATED',
  WAREHOUSE_UPDATED: 'WAREHOUSE_UPDATED',
  WAREHOUSE_ACTIVATED: 'WAREHOUSE_ACTIVATED',
  WAREHOUSE_DEACTIVATED: 'WAREHOUSE_DEACTIVATED',
  STOCK_IN: 'STOCK_IN',
  STOCK_OUT: 'STOCK_OUT',
  STOCK_TRANSFER: 'STOCK_TRANSFER',
  STOCK_OPERATION_REJECTED: 'STOCK_OPERATION_REJECTED',
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditContext {
  userId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export function auditContext(req: Request): AuditContext {
  return {
    userId: req.user?.id ?? null,
    ipAddress: (req.ip ?? req.socket.remoteAddress ?? null)?.slice(0, 64) ?? null,
    userAgent: req.get('user-agent')?.slice(0, 255) ?? null,
  };
}

export interface AuditEntry {
  action: AuditActionType;
  entityType: string;
  entityId?: string | null;
  details?: Prisma.InputJsonValue;
}

/** Writes an audit log row. Pass a transaction client to make it atomic with the business change. */
export async function writeAudit(ctx: AuditContext, entry: AuditEntry, client: TxClient | typeof prisma = prisma) {
  await client.auditLog.create({
    data: {
      userId: ctx.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      details: entry.details,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    },
  });
}
