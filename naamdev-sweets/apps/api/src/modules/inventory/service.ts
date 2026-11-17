import { prisma, type StockTxnType, type Tx } from "@naamdev/db";
import { conflict, badRequest, notFound } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { getSetting } from "../../lib/settings";
import { notifyStaff } from "../notifications/service";

/** Batches stop being sellable this many hours before their expiry time. */
export const SALE_CUTOFF_HOURS = 6;
const cutoff = () => new Date(Date.now() + SALE_CUTOFF_HOURS * 3600_000);

export class OutOfStockError extends Error {
  constructor(public variantId: string, public available: number) {
    super("OUT_OF_STOCK");
  }
}

async function ensureInventory(tx: Tx, variantId: string) {
  return tx.inventory.upsert({ where: { variantId }, update: {}, create: { variantId } });
}

async function log(tx: Tx, data: { variantId: string; batchId?: string | null; type: StockTxnType; quantity: number; reason?: string; orderId?: string; createdById?: string | null }) {
  const inv = await tx.inventory.findUniqueOrThrow({ where: { variantId: data.variantId } });
  await tx.stockTransaction.create({ data: { ...data, balanceAfter: inv.available } });
}

/**
 * Reserves stock for order lines: atomically decrements `available` (fails if insufficient) and
 * allocates batches first-expiry-first-out so perishable stock is always sold oldest-first.
 */
export async function reserveStock(tx: Tx, orderId: string, lines: { orderItemId: string; variantId: string; quantity: number }[]) {
  const sorted = [...lines].sort((a, b) => a.variantId.localeCompare(b.variantId));
  for (const line of sorted) {
    await ensureInventory(tx, line.variantId);
    const updated = await tx.$executeRaw`
      UPDATE "Inventory" SET "available" = "available" - ${line.quantity}, "reserved" = "reserved" + ${line.quantity}, "updatedAt" = now()
      WHERE "variantId" = ${line.variantId} AND "available" >= ${line.quantity}`;
    if (updated !== 1) {
      const inv = await tx.inventory.findUnique({ where: { variantId: line.variantId } });
      throw new OutOfStockError(line.variantId, inv?.available ?? 0);
    }
    const batches = await tx.$queryRaw<{ id: string; remaining: number }[]>`
      SELECT "id", "remaining" FROM "InventoryBatch"
      WHERE "variantId" = ${line.variantId} AND "status" = 'ACTIVE' AND "remaining" > 0 AND "expiresAt" > ${cutoff()}
      ORDER BY "expiresAt" ASC, "createdAt" ASC
      FOR UPDATE`;
    let need = line.quantity;
    for (const b of batches) {
      if (need <= 0) break;
      const take = Math.min(need, b.remaining);
      await tx.inventoryBatch.update({
        where: { id: b.id },
        data: { remaining: { decrement: take }, ...(b.remaining - take === 0 ? { status: "DEPLETED" } : {}) },
      });
      await tx.orderItemAllocation.create({ data: { orderItemId: line.orderItemId, batchId: b.id, quantity: take } });
      await log(tx, { variantId: line.variantId, batchId: b.id, type: "RESERVED", quantity: -take, orderId, reason: "Reserved for order" });
      need -= take;
    }
    if (need > 0) {
      // Inventory counter and batches disagree (e.g. a batch hit its sale cutoff) — refuse the sale.
      logger.warn({ variantId: line.variantId, need }, "batch allocation shortfall");
      throw new OutOfStockError(line.variantId, line.quantity - need);
    }
  }
}

/** Returns reserved stock to its batches (used on cancellation / payment expiry). */
export async function releaseStock(tx: Tx, orderId: string, reason: string) {
  const allocations = await tx.orderItemAllocation.findMany({
    where: { releasedAt: null, orderItem: { orderId } },
    include: { batch: true, orderItem: { select: { variantId: true } } },
  });
  for (const a of allocations) {
    const variantId = a.orderItem.variantId;
    const sellable = a.batch.status !== "EXPIRED" && a.batch.status !== "DISCARDED" && a.batch.expiresAt > cutoff();
    await tx.orderItemAllocation.update({ where: { id: a.id }, data: { releasedAt: new Date() } });
    if (sellable) {
      await tx.inventoryBatch.update({ where: { id: a.batchId }, data: { remaining: { increment: a.quantity }, status: "ACTIVE" } });
      await tx.inventory.update({ where: { variantId }, data: { reserved: { decrement: a.quantity }, available: { increment: a.quantity } } });
      await log(tx, { variantId, batchId: a.batchId, type: "RELEASED", quantity: a.quantity, orderId, reason });
    } else {
      await tx.inventory.update({ where: { variantId }, data: { reserved: { decrement: a.quantity } } });
      await log(tx, { variantId, batchId: a.batchId, type: "EXPIRED", quantity: 0, orderId, reason: `${reason} — batch past sale cutoff, written off` });
    }
  }
}

/** Stock physically leaves the store when the partner picks up the order. */
export async function commitStock(tx: Tx, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId } });
  for (const it of items) {
    await tx.inventory.update({ where: { variantId: it.variantId }, data: { reserved: { decrement: it.quantity } } });
    await log(tx, { variantId: it.variantId, type: "SOLD", quantity: 0, orderId, reason: `Dispatched ${it.quantity} unit(s)` });
    await tx.product.update({ where: { id: it.productId }, data: { soldCount: { increment: it.quantity } } });
  }
}

export async function createBatch(
  tx: Tx,
  input: { variantId: string; batchNumber: string; quantity: number; manufacturedAt: Date; expiresAt: Date; costPricePaise: number; supplierId?: string | null },
  userId?: string | null,
  reason = "Stock in",
) {
  const variant = await tx.productVariant.findUnique({ where: { id: input.variantId } });
  if (!variant) throw notFound("Variant");
  if (input.expiresAt <= cutoff()) throw badRequest("This batch is already past its sale cutoff and cannot be stocked.");
  await ensureInventory(tx, input.variantId);
  const batch = await tx.inventoryBatch.create({ data: { ...input, remaining: input.quantity } });
  await tx.inventory.update({ where: { variantId: input.variantId }, data: { available: { increment: input.quantity }, lastRestockedAt: new Date(), lowStockAlertedAt: null } });
  await log(tx, { variantId: input.variantId, batchId: batch.id, type: "STOCK_IN", quantity: input.quantity, reason, createdById: userId });
  return batch;
}

/**
 * Manual adjustments. Positive quantities add to a batch (ADJUSTMENT/RETURNED); negative remove
 * (ADJUSTMENT/DAMAGED/EXPIRED). When no batch is given, removals consume FEFO.
 */
export async function adjustStock(tx: Tx, input: { variantId: string; type: StockTxnType; quantity: number; batchId?: string | null; reason: string }, userId?: string | null) {
  await ensureInventory(tx, input.variantId);
  const removing = input.type === "DAMAGED" || input.type === "EXPIRED" || (input.type === "ADJUSTMENT" && input.quantity < 0);
  const qty = Math.abs(input.quantity);
  if (input.type === "STOCK_IN") throw badRequest("Use 'Add batch' or a purchase to stock in new inventory.");

  if (!removing) {
    if (!input.batchId) throw badRequest("Select the batch to add stock to.");
    const batch = await tx.inventoryBatch.findFirst({ where: { id: input.batchId, variantId: input.variantId } });
    if (!batch) throw notFound("Batch");
    if (batch.expiresAt <= cutoff()) throw badRequest("Cannot add stock to an expired batch.");
    await tx.inventoryBatch.update({ where: { id: batch.id }, data: { remaining: { increment: qty }, status: "ACTIVE" } });
    await tx.inventory.update({ where: { variantId: input.variantId }, data: { available: { increment: qty } } });
    await log(tx, { variantId: input.variantId, batchId: batch.id, type: input.type, quantity: qty, reason: input.reason, createdById: userId });
    return;
  }

  const batches = input.batchId
    ? await tx.inventoryBatch.findMany({ where: { id: input.batchId, variantId: input.variantId, status: "ACTIVE" } })
    : await tx.inventoryBatch.findMany({ where: { variantId: input.variantId, status: "ACTIVE", remaining: { gt: 0 } }, orderBy: { expiresAt: "asc" } });
  const total = batches.reduce((s, b) => s + b.remaining, 0);
  if (total < qty) throw conflict(`Only ${total} unit(s) available to remove from ${input.batchId ? "this batch" : "active batches"}.`);
  let need = qty;
  for (const b of batches) {
    if (need <= 0) break;
    const take = Math.min(need, b.remaining);
    await tx.inventoryBatch.update({
      where: { id: b.id },
      data: { remaining: { decrement: take }, ...(b.remaining - take === 0 ? { status: input.type === "EXPIRED" ? "EXPIRED" : "DEPLETED" } : {}) },
    });
    await tx.inventory.update({ where: { variantId: input.variantId }, data: { available: { decrement: take } } });
    await log(tx, { variantId: input.variantId, batchId: b.id, type: input.type, quantity: -take, reason: input.reason, createdById: userId });
    need -= take;
  }
}

/** Job: retire batches that crossed their sale cutoff, so expired stock can never be ordered. */
export async function expireBatches() {
  const due = await prisma.inventoryBatch.findMany({ where: { status: "ACTIVE", expiresAt: { lte: cutoff() } } });
  for (const b of due) {
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.inventoryBatch.findUnique({ where: { id: b.id } });
      if (!fresh || fresh.status !== "ACTIVE") return;
      await tx.inventoryBatch.update({ where: { id: b.id }, data: { status: "EXPIRED", remaining: 0 } });
      if (fresh.remaining > 0) {
        await tx.inventory.update({ where: { variantId: b.variantId }, data: { available: { decrement: fresh.remaining } } });
        await log(tx, { variantId: b.variantId, batchId: b.id, type: "EXPIRED", quantity: -fresh.remaining, reason: "Auto-expired at sale cutoff" });
      }
    });
  }
  return due.length;
}

/** Job: alert staff about low stock and batches nearing expiry. */
export async function inventoryAlerts() {
  const settings = await getSetting("notifications");
  let low = 0;
  if (settings.lowStockAlerts) {
    const rows = await prisma.$queryRaw<{ variantId: string }[]>`
      SELECT i."variantId" FROM "Inventory" i JOIN "ProductVariant" v ON v."id" = i."variantId" JOIN "Product" p ON p."id" = v."productId"
      WHERE v."isActive" AND p."isActive" AND p."deletedAt" IS NULL AND i."available" <= i."lowStockThreshold"
        AND (i."lowStockAlertedAt" IS NULL OR i."lowStockAlertedAt" < now() - interval '24 hours')`;
    if (rows.length) {
      const variants = await prisma.productVariant.findMany({ where: { id: { in: rows.map((r) => r.variantId) } }, include: { product: true, inventory: true } });
      const lines = variants.map((v) => `${v.product.name} (${v.label}): ${v.inventory?.available ?? 0} left`);
      await notifyStaff("inventory.view", { type: "INVENTORY", title: `Low stock: ${variants.length} item(s)`, body: lines.slice(0, 6).join(" · "), link: "/inventory?filter=low", template: "admin.low_stock" }, settings.adminAlertEmails);
      await prisma.inventory.updateMany({ where: { variantId: { in: rows.map((r) => r.variantId) } }, data: { lowStockAlertedAt: new Date() } });
      low = variants.length;
    }
  }
  const soon = new Date(Date.now() + settings.expiryAlertDays * 86_400_000);
  const expiring = await prisma.inventoryBatch.findMany({
    where: { status: "ACTIVE", remaining: { gt: 0 }, expiresAt: { lte: soon }, expiryAlertedAt: null },
    include: { variant: { include: { product: true } } },
  });
  if (expiring.length) {
    const lines = expiring.map((b) => `${b.variant.product.name} ${b.variant.label} · batch ${b.batchNumber} · ${b.remaining} units`);
    await notifyStaff("inventory.view", { type: "INVENTORY", title: `${expiring.length} batch(es) expiring soon`, body: lines.slice(0, 6).join(" · "), link: "/inventory/expiry", template: "admin.expiry" }, settings.adminAlertEmails);
    await prisma.inventoryBatch.updateMany({ where: { id: { in: expiring.map((b) => b.id) } }, data: { expiryAlertedAt: new Date() } });
  }
  return { low, expiring: expiring.length };
}
