import type { Request } from "express";
import type { Transaction } from "firebase-admin/firestore";
import { C, db } from "@naamdev/db";
import { clientIp } from "./http";
import { logger } from "./logger";

/** Records a staff/system action. Inside a transaction the entry is written atomically with the change. */
export async function audit(
  req: Request | null,
  action: string,
  entity: string,
  entityId?: string | null,
  metadata?: Record<string, unknown>,
  tx?: Transaction,
) {
  const entry = {
    actorId: req?.auth?.user.id ?? null,
    actorName: req?.auth?.user.name ?? null,
    action,
    entity,
    entityId: entityId ?? null,
    metadata: metadata ?? null,
    ip: req ? clientIp(req) : null,
    userAgent: req?.get("user-agent")?.slice(0, 250) ?? null,
    createdAt: new Date(),
  };
  try {
    const ref = db.collection(C.auditLogs).doc();
    if (tx) tx.set(ref, entry);
    else await ref.set(entry);
  } catch (err) {
    logger.error({ err, action, entity }, "audit log write failed");
  }
}
