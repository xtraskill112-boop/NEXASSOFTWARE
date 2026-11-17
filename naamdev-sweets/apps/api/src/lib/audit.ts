import type { Request } from "express";
import { prisma, type Tx } from "@naamdev/db";
import { clientIp } from "./http";
import { logger } from "./logger";

export async function audit(
  req: Request | null,
  action: string,
  entity: string,
  entityId?: string | null,
  metadata?: Record<string, unknown>,
  tx?: Tx,
) {
  try {
    await (tx ?? prisma).auditLog.create({
      data: {
        actorId: req?.auth?.user.id ?? null,
        action,
        entity,
        entityId: entityId ?? null,
        metadata: (metadata ?? undefined) as object | undefined,
        ip: req ? clientIp(req) : null,
        userAgent: req?.get("user-agent")?.slice(0, 250) ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, action, entity }, "audit log write failed");
  }
}
