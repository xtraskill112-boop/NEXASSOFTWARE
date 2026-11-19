import type { Transaction } from "firebase-admin/firestore";
import {
  C, db, FieldValue, getDoc, getDocs, runTx,
  type Inventory, type InventoryBatch, type Order, type OrderItem, type OrderItemAllocation, type StockTxnType, type WithId,
} from "@naamdev/db";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { getSetting } from "../../lib/settings";
import { bumpCatalog, catalog } from "../catalog/cache";
import { notifyStaff } from "../notifications/service";

/** Batches stop being sellable this many hours before their expiry time. */
export const SALE_CUTOFF_HOURS = 6;
const cutoff = () => new Date(Date.now() + SALE_CUTOFF_HOURS * 3600_000);

export class OutOfStockError extends Error {
  constructor(public variantId: string, public available: number) {
    super("OUT_OF_STOCK");
  }
}

const invRef = (variantId: string) => db.collection(C.inventory).doc(variantId);
const batchRef = (id: string) => db.collection(C.batches).doc(id);

/**
 * Stock changes inside one transaction. Inventory documents are read once (and locked), changed in
 * memory, and written once on `flush()` with a ledger entry per movement.
 */
export class StockSession {
  private inv = new Map<string, { data: Inventory; dirty: boolean }>();
  constructor(public tx: Transaction) {}

  async load(variantId: string): Promise<Inventory> {
    const hit = this.inv.get(variantId);
    if (hit) return hit.data;
    const snap = await getDoc<Inventory>(invRef(variantId), this.tx);
    let data: Inventory;
    if (snap) {
      const { id: _id, ...rest } = snap;
      data = rest;
    } else {
      const s = await catalog();
      const productId = s.variants.get(variantId)?.product.id;
      if (!productId) throw notFound("Variant");
      data = { variantId, productId, available: 0, reserved: 0, lowStockThreshold: 10, lastRestockedAt: null, lowStockAlertedAt: null, updatedAt: new Date() };
    }
    this.inv.set(variantId, { data, dirty: !snap });
    return data;
  }

  change(variantId: string, delta: { available?: number; reserved?: number }, extra: Partial<Inventory> = {}) {
    const hit = this.inv.get(variantId);
    if (!hit) throw new Error(`inventory ${variantId} not loaded`);
    hit.data.available += delta.available ?? 0;
    hit.data.reserved = Math.max(0, hit.data.reserved + (delta.reserved ?? 0));
    Object.assign(hit.data, extra);
    hit.dirty = true;
  }

  log(entry: { variantId: string; batchId?: string | null; type: StockTxnType; quantity: number; reason?: string; orderId?: string | null; createdById?: string | null }) {
    const inv = this.inv.get(entry.variantId)!.data;
    this.tx.set(db.collection(C.stockTransactions).doc(), {
      variantId: entry.variantId, productId: inv.productId, batchId: entry.batchId ?? null, type: entry.type, quantity: entry.quantity,
      balanceAfter: inv.available, reason: entry.reason ?? null, orderId: entry.orderId ?? null, createdById: entry.createdById ?? null, createdAt: new Date(),
    });
  }

  /** Writes changed inventory documents and tells every instance the catalogue stock changed. */
  flush() {
    let any = false;
    for (const [variantId, { data, dirty }] of this.inv) {
      if (!dirty) continue;
      this.tx.set(invRef(variantId), { ...data, updatedAt: new Date() });
      any = true;
    }
    if (any) bumpCatalog("stock", this.tx);
  }
}

async function activeBatches(tx: Transaction, variantId: string) {
  const rows = await getDocs<InventoryBatch>(db.collection(C.batches).where("variantId", "==", variantId).where("status", "==", "ACTIVE"), tx);
  return rows.sort((a, b) => +a.expiresAt - +b.expiresAt || +a.createdAt - +b.createdAt);
}

/**
 * Reserves stock for order lines: decrements `available` (fails if insufficient) and allocates batches
 * first-expiry-first-out so perishable stock is always sold oldest-first. Returns allocations per line.
 */
export async function reserveStock(s: StockSession, orderId: string, lines: { orderItemId: string; variantId: string; quantity: number }[]) {
  const sorted = [...lines].sort((a, b) => a.variantId.localeCompare(b.variantId));
  // Read phase: inventory + batches for every line.
  const loaded = await Promise.all(sorted.map(async (l) => ({ line: l, inv: await s.load(l.variantId), batches: await activeBatches(s.tx, l.variantId) })));
  const result = new Map<string, OrderItemAllocation[]>();
  const now = cutoff();
  for (const { line, inv, batches } of loaded) {
    if (inv.available < line.quantity) throw new OutOfStockError(line.variantId, inv.available);
    s.change(line.variantId, { available: -line.quantity, reserved: line.quantity });
    let need = line.quantity;
    const allocations: OrderItemAllocation[] = [];
    for (const b of batches) {
      if (need <= 0) break;
      if (b.remaining <= 0 || b.expiresAt <= now) continue;
      const take = Math.min(need, b.remaining);
      b.remaining -= take;
      s.tx.update(batchRef(b.id), { remaining: b.remaining, ...(b.remaining === 0 ? { status: "DEPLETED" } : {}), updatedAt: new Date() });
      allocations.push({ batchId: b.id, quantity: take, releasedAt: null });
      s.log({ variantId: line.variantId, batchId: b.id, type: "RESERVED", quantity: -take, orderId, reason: "Reserved for order" });
      need -= take;
    }
    if (need > 0) {
      // Inventory counter and batches disagree (e.g. a batch hit its sale cutoff) — refuse the sale.
      logger.warn({ variantId: line.variantId, need }, "batch allocation shortfall");
      throw new OutOfStockError(line.variantId, line.quantity - need);
    }
    result.set(line.orderItemId, allocations);
  }
  return result;
}

/** Returns reserved stock to its batches (cancellation / payment expiry). Returns the order's updated items. */
export async function releaseStock(s: StockSession, order: Pick<Order, "items"> & { id: string }, reason: string): Promise<OrderItem[]> {
  const open = order.items.flatMap((it) => it.allocations.filter((a) => !a.releasedAt).map((a) => ({ it, a })));
  const batchSnaps = await Promise.all([...new Set(open.map((x) => x.a.batchId))].map((id) => getDoc<InventoryBatch>(batchRef(id), s.tx)));
  const batches = new Map(batchSnaps.filter(Boolean).map((b) => [b!.id, b!]));
  await Promise.all(open.map((x) => s.load(x.it.variantId)));
  const limit = cutoff();
  const releasedAt = new Date();
  for (const { it, a } of open) {
    const batch = batches.get(a.batchId);
    const sellable = !!batch && batch.status !== "EXPIRED" && batch.status !== "DISCARDED" && batch.expiresAt > limit;
    a.releasedAt = releasedAt;
    if (sellable) {
      batch!.remaining += a.quantity;
      s.tx.update(batchRef(batch!.id), { remaining: batch!.remaining, status: "ACTIVE", updatedAt: releasedAt });
      s.change(it.variantId, { reserved: -a.quantity, available: a.quantity });
      s.log({ variantId: it.variantId, batchId: a.batchId, type: "RELEASED", quantity: a.quantity, orderId: order.id, reason });
    } else {
      s.change(it.variantId, { reserved: -a.quantity });
      s.log({ variantId: it.variantId, batchId: a.batchId, type: "EXPIRED", quantity: 0, orderId: order.id, reason: `${reason} — batch past sale cutoff, written off` });
    }
  }
  return order.items;
}

/** Stock physically leaves the store when the partner picks up the order. */
export async function commitStock(s: StockSession, order: Pick<Order, "items"> & { id: string }) {
  await Promise.all(order.items.map((it) => s.load(it.variantId)));
  for (const it of order.items) {
    s.change(it.variantId, { reserved: -it.quantity });
    s.log({ variantId: it.variantId, type: "SOLD", quantity: 0, orderId: order.id, reason: `Dispatched ${it.quantity} unit(s)` });
    s.tx.update(db.collection(C.products).doc(it.productId), { soldCount: FieldValue.increment(it.quantity) });
  }
}

export async function createBatch(
  s: StockSession,
  input: { variantId: string; batchNumber: string; quantity: number; manufacturedAt: Date; expiresAt: Date; costPricePaise: number; supplierId?: string | null },
  userId?: string | null,
  reason = "Stock in",
): Promise<WithId<InventoryBatch>> {
  const snap = await catalog();
  const hit = snap.variants.get(input.variantId);
  if (!hit) throw notFound("Variant");
  if (input.expiresAt <= cutoff()) throw badRequest("This batch is already past its sale cutoff and cannot be stocked.");
  const dup = await getDocs<InventoryBatch>(db.collection(C.batches).where("variantId", "==", input.variantId).where("batchNumber", "==", input.batchNumber).limit(1), s.tx);
  if (dup.length) throw conflict(`Batch ${input.batchNumber} already exists for this variant.`, undefined, "DUPLICATE");
  await s.load(input.variantId);
  const ref = db.collection(C.batches).doc();
  const now = new Date();
  const batch: InventoryBatch = {
    variantId: input.variantId, productId: hit.product.id, batchNumber: input.batchNumber, supplierId: input.supplierId ?? null,
    manufacturedAt: input.manufacturedAt, expiresAt: input.expiresAt, quantity: input.quantity, remaining: input.quantity,
    costPricePaise: input.costPricePaise, status: "ACTIVE", expiryAlertedAt: null, createdAt: now, updatedAt: now,
  };
  s.tx.set(ref, batch);
  s.change(input.variantId, { available: input.quantity }, { lastRestockedAt: now, lowStockAlertedAt: null });
  s.log({ variantId: input.variantId, batchId: ref.id, type: "STOCK_IN", quantity: input.quantity, reason, createdById: userId });
  return { ...batch, id: ref.id };
}

/**
 * Manual adjustments. Positive quantities add to a batch (ADJUSTMENT/RETURNED); negative remove
 * (ADJUSTMENT/DAMAGED/EXPIRED). When no batch is given, removals consume FEFO.
 */
export async function adjustStock(s: StockSession, input: { variantId: string; type: StockTxnType; quantity: number; batchId?: string | null; reason: string }, userId?: string | null) {
  await s.load(input.variantId);
  const removing = input.type === "DAMAGED" || input.type === "EXPIRED" || (input.type === "ADJUSTMENT" && input.quantity < 0);
  const qty = Math.abs(input.quantity);
  if (input.type === "STOCK_IN") throw badRequest("Use 'Add batch' or a purchase to stock in new inventory.");

  if (!removing) {
    if (!input.batchId) throw badRequest("Select the batch to add stock to.");
    const batch = await getDoc<InventoryBatch>(batchRef(input.batchId), s.tx);
    if (!batch || batch.variantId !== input.variantId) throw notFound("Batch");
    if (batch.expiresAt <= cutoff()) throw badRequest("Cannot add stock to an expired batch.");
    s.tx.update(batchRef(batch.id), { remaining: batch.remaining + qty, status: "ACTIVE", updatedAt: new Date() });
    s.change(input.variantId, { available: qty });
    s.log({ variantId: input.variantId, batchId: batch.id, type: input.type, quantity: qty, reason: input.reason, createdById: userId });
    return;
  }

  let batches: WithId<InventoryBatch>[];
  if (input.batchId) {
    const b = await getDoc<InventoryBatch>(batchRef(input.batchId), s.tx);
    batches = b && b.variantId === input.variantId && b.status === "ACTIVE" ? [b] : [];
  } else {
    batches = (await activeBatches(s.tx, input.variantId)).filter((b) => b.remaining > 0);
  }
  const total = batches.reduce((sum, b) => sum + b.remaining, 0);
  if (total < qty) throw conflict(`Only ${total} unit(s) available to remove from ${input.batchId ? "this batch" : "active batches"}.`);
  let need = qty;
  for (const b of batches) {
    if (need <= 0) break;
    const take = Math.min(need, b.remaining);
    const remaining = b.remaining - take;
    s.tx.update(batchRef(b.id), { remaining, ...(remaining === 0 ? { status: input.type === "EXPIRED" ? "EXPIRED" : "DEPLETED" } : {}), updatedAt: new Date() });
    s.change(input.variantId, { available: -take });
    s.log({ variantId: input.variantId, batchId: b.id, type: input.type, quantity: -take, reason: input.reason, createdById: userId });
    need -= take;
  }
}

/** Runs a stock operation in its own transaction. */
export function withStock<T>(fn: (s: StockSession) => Promise<T>): Promise<T> {
  return runTx(async (tx) => {
    const s = new StockSession(tx);
    const r = await fn(s);
    s.flush();
    return r;
  });
}

/** Job: retire batches that crossed their sale cutoff, so expired stock can never be ordered. */
export async function expireBatches() {
  const due = await getDocs<InventoryBatch>(db.collection(C.batches).where("status", "==", "ACTIVE").where("expiresAt", "<=", cutoff()));
  for (const b of due) {
    await withStock(async (s) => {
      const fresh = await getDoc<InventoryBatch>(batchRef(b.id), s.tx);
      if (!fresh || fresh.status !== "ACTIVE") return;
      await s.load(b.variantId);
      s.tx.update(batchRef(b.id), { status: "EXPIRED", remaining: 0, updatedAt: new Date() });
      if (fresh.remaining > 0) {
        s.change(b.variantId, { available: -fresh.remaining });
        s.log({ variantId: b.variantId, batchId: b.id, type: "EXPIRED", quantity: -fresh.remaining, reason: "Auto-expired at sale cutoff" });
      }
    });
  }
  return due.length;
}

/** Job: alert staff about low stock and batches nearing expiry. */
export async function inventoryAlerts() {
  const settings = await getSetting("notifications");
  const snap = await catalog();
  let low = 0;
  if (settings.lowStockAlerts) {
    const dayAgo = Date.now() - 86_400_000;
    const rows = (await getDocs<Inventory>(db.collection(C.inventory))).filter((i) => {
      const hit = snap.variants.get(i.id);
      return (
        !!hit && hit.variant.isActive && hit.product.isActive && !hit.product.deletedAt &&
        i.available <= i.lowStockThreshold && (!i.lowStockAlertedAt || +i.lowStockAlertedAt < dayAgo)
      );
    });
    if (rows.length) {
      const lines = rows.map((i) => {
        const hit = snap.variants.get(i.id)!;
        return `${hit.product.name} (${hit.variant.label}): ${i.available} left`;
      });
      await notifyStaff("inventory.view", { type: "INVENTORY", title: `Low stock: ${rows.length} item(s)`, body: lines.slice(0, 6).join(" · "), link: "/inventory?filter=low", template: "admin.low_stock" }, settings.adminAlertEmails);
      const batch = db.batch();
      for (const r of rows) batch.update(invRef(r.id), { lowStockAlertedAt: new Date() });
      await batch.commit();
      low = rows.length;
    }
  }
  const soon = new Date(Date.now() + settings.expiryAlertDays * 86_400_000);
  const expiring = (await getDocs<InventoryBatch>(db.collection(C.batches).where("status", "==", "ACTIVE").where("expiresAt", "<=", soon))).filter(
    (b) => b.remaining > 0 && !b.expiryAlertedAt,
  );
  if (expiring.length) {
    const lines = expiring.map((b) => {
      const hit = snap.variants.get(b.variantId);
      return `${hit?.product.name ?? "Item"} ${hit?.variant.label ?? ""} · batch ${b.batchNumber} · ${b.remaining} units`;
    });
    await notifyStaff("inventory.view", { type: "INVENTORY", title: `${expiring.length} batch(es) expiring soon`, body: lines.slice(0, 6).join(" · "), link: "/inventory/expiry", template: "admin.expiry" }, settings.adminAlertEmails);
    const batch = db.batch();
    for (const b of expiring) batch.update(batchRef(b.id), { expiryAlertedAt: new Date() });
    await batch.commit();
  }
  return { low, expiring: expiring.length };
}
