import type { Transaction } from "firebase-admin/firestore";
import {
  C, db, FieldValue, getDoc, getDocs, newId, runTx,
  type ActorType, type CouponUsage, type DeliveryAssignment, type Order, type OrderStatus, type Payment, type Refund, type User, type WithId,
} from "@naamdev/db";
import { canTransition } from "@naamdev/shared";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { live } from "../../lib/live";
import { logger } from "../../lib/logger";
import { nextInvoiceNumber } from "../../lib/counters";
import { awardPoints, onOrderDelivered, readDeliveryRewards } from "../loyalty/service";
import { commitStock, releaseStock, StockSession } from "../inventory/service";
import { notify, notifyOrderStatus, notifyPayment, notifyStaff } from "../notifications/service";
import { razorpay } from "../payments/razorpay";
import { autoOfferDelivery } from "../delivery/service";

export interface Actor {
  type: ActorType;
  userId?: string | null;
  name?: string | null;
}

export type Effect =
  | { kind: "status"; order: WithId<Order>; status: OrderStatus }
  | { kind: "autoRefund"; orderId: string; reason: string }
  | { kind: "autoAssign"; orderId: string }
  | { kind: "partnerCancelled"; partnerId: string; assignmentId: string; orderNumber: string }
  | { kind: "paid"; order: WithId<Order> }
  | { kind: "newOrder"; order: WithId<Order> }
  | { kind: "run"; fn: () => void };

export const orderRef = (id: string) => db.collection(C.orders).doc(id);
const ACTIVE_ASSIGNMENT_STATUSES = ["OFFERED", "ACCEPTED", "AT_STORE", "PICKED_UP", "OUT_FOR_DELIVERY"];

/**
 * One order transaction: shared stock session, the latest state of each touched order (written once),
 * and side effects to run after commit.
 */
export class OrderTx {
  stock: StockSession;
  private orders = new Map<string, WithId<Order>>();
  private dirty = new Set<string>();
  effects: Effect[] = [];
  constructor(public tx: Transaction) {
    this.stock = new StockSession(tx);
  }
  /** Reads and locks an order for the rest of the transaction. */
  async lock(orderId: string): Promise<WithId<Order>> {
    const cached = this.orders.get(orderId);
    if (cached) return cached;
    const order = await getDoc<Order>(orderRef(orderId), this.tx);
    if (!order) throw notFound("Order");
    this.orders.set(orderId, order);
    return order;
  }
  save(order: WithId<Order>) {
    order.updatedAt = new Date();
    this.orders.set(order.id, order);
    this.dirty.add(order.id);
  }
  flush() {
    for (const id of this.dirty) {
      const { id: _id, ...data } = this.orders.get(id)!;
      this.tx.set(orderRef(id), data);
    }
    this.stock.flush();
  }
}

export async function withOrderTx<T>(fn: (ctx: OrderTx) => Promise<T>): Promise<{ result: T; effects: Effect[] }> {
  const out = await runTx(async (tx) => {
    const ctx = new OrderTx(tx);
    const result = await fn(ctx);
    ctx.flush();
    return { result, effects: ctx.effects };
  });
  return out;
}

/**
 * Applies a lifecycle transition with all of its side effects (stock, coupons, points, invoices,
 * assignments). Mutates the locked order in memory; the transaction writes it once on commit.
 */
export async function applyTransition(ctx: OrderTx, order: WithId<Order>, to: OrderStatus, actor: Actor, note?: string): Promise<WithId<Order>> {
  if (order.status === to) return order;
  if (!canTransition(order.status, to)) throw conflict(`Cannot move an order from ${order.status} to ${to}.`, { from: order.status, to }, "INVALID_TRANSITION");
  const { tx } = ctx;
  const now = new Date();
  const from = order.status;

  switch (to) {
    case "CONFIRMED":
      order.confirmedAt = now;
      order.reservationExpiresAt = null;
      order.invoiceNumber = order.invoiceNumber ?? (await nextInvoiceNumber(tx));
      ctx.effects.push({ kind: "newOrder", order });
      break;
    case "PACKED":
    case "READY_FOR_PICKUP": {
      const active = await getDocs<DeliveryAssignment>(db.collection(C.assignments).where("orderId", "==", order.id), tx);
      if (!active.some((a) => ACTIVE_ASSIGNMENT_STATUSES.includes(a.status))) ctx.effects.push({ kind: "autoAssign", orderId: order.id });
      break;
    }
    case "DISPATCHED":
      order.dispatchedAt = now;
      await commitStock(ctx.stock, order);
      break;
    case "DELIVERED": {
      order.deliveredAt = now;
      if (from !== "DISPATCHED" && from !== "OUT_FOR_DELIVERY") break;
      if (order.paymentMethod === "COD") {
        order.paymentStatus = "COD_COLLECTED";
        const cod = await getDocs<Payment>(db.collection(C.payments).where("orderId", "==", order.id), tx);
        for (const p of cod.filter((x) => x.method === "COD")) tx.update(db.collection(C.payments).doc(p.id), { status: "CAPTURED", capturedAt: now, updatedAt: now });
      }
      const rewards = await readDeliveryRewards(tx, order.userId);
      const after: (() => void)[] = [];
      await onOrderDelivered(tx, order, rewards, after);
      for (const fn of after) ctx.effects.push({ kind: "run", fn });
      break;
    }
    case "CANCELLED": {
      order.cancelledAt = now;
      order.cancelReason = note ?? "Cancelled";
      order.cancelledBy = actor.type;
      order.reservationExpiresAt = null;
      order.items = await releaseStock(ctx.stock, order, `Order ${order.orderNumber} cancelled`);
      if (order.couponCode) {
        const usage = await getDoc<CouponUsage>(db.collection(C.couponUsages).doc(order.id), tx);
        if (usage) {
          tx.delete(db.collection(C.couponUsages).doc(order.id));
          tx.update(db.collection(C.coupons).doc(order.couponCode), { usedCount: FieldValue.increment(-1) });
        }
      }
      if (order.pointsRedeemed > 0) {
        const user = await getDoc<User>(db.collection(C.users).doc(order.userId), tx);
        if (user) awardPoints(tx, user, order.pointsRedeemed, "REVERSAL", `Points restored — order ${order.orderNumber} cancelled`, order.id);
      }
      if (order.paymentMethod === "COD") {
        const pays = await getDocs<Payment>(db.collection(C.payments).where("orderId", "==", order.id), tx);
        for (const p of pays.filter((x) => x.status === "CREATED"))
          tx.update(db.collection(C.payments).doc(p.id), { status: "FAILED", failureReason: "Order cancelled", updatedAt: now });
      }
      const assignments = await getDocs<DeliveryAssignment>(db.collection(C.assignments).where("orderId", "==", order.id), tx);
      for (const a of assignments.filter((x) => ["OFFERED", "ACCEPTED", "AT_STORE"].includes(x.status))) {
        tx.update(db.collection(C.assignments).doc(a.id), { status: "CANCELLED", cancelledAt: now, updatedAt: now });
        ctx.effects.push({ kind: "partnerCancelled", partnerId: a.partnerId, assignmentId: a.id, orderNumber: order.orderNumber });
      }
      order.partnerId = null;
      if (order.paymentStatus === "PAID") ctx.effects.push({ kind: "autoRefund", orderId: order.id, reason: note ?? "Order cancelled" });
      break;
    }
    case "REFUNDED":
      break;
  }

  order.status = to;
  order.history = [
    ...order.history,
    { id: newId(), fromStatus: from, toStatus: to, note: note ?? null, actorType: actor.type, changedById: actor.userId ?? null, changedByName: actor.name ?? null, createdAt: now },
  ];
  ctx.save(order);
  ctx.effects.push({ kind: "status", order, status: to });
  return order;
}

/** Executes post-commit side effects (notifications, live updates, refunds, partner offers). */
export async function runEffects(effects: Effect[]) {
  // Status effects first (customer sees the change), then the rest in order.
  const ordered = [...effects.filter((e) => e.kind === "status"), ...effects.filter((e) => e.kind !== "status")];
  for (const e of ordered) {
    try {
      if (e.kind === "status") notifyOrderStatus(e.order, e.status);
      else if (e.kind === "paid") notifyPayment(e.order, true);
      else if (e.kind === "run") e.fn();
      else if (e.kind === "newOrder") {
        live.staff("new-order", { orderId: e.order.id, orderNumber: e.order.orderNumber, totalPaise: e.order.totalPaise });
        notifyStaff("orders.manage", { type: "ORDER", title: `New order ${e.order.orderNumber}`, body: `₹${(e.order.totalPaise / 100).toLocaleString("en-IN")} · ${e.order.paymentMethod === "COD" ? "Cash on delivery" : "Paid online"}`, link: `/orders/${e.order.id}`, template: "admin.new_order" });
      } else if (e.kind === "autoAssign") await autoOfferDelivery(e.orderId);
      else if (e.kind === "partnerCancelled") {
        live.partner(e.partnerId, "withdrawn", { assignmentId: e.assignmentId });
        notify({ userId: e.partnerId, type: "DELIVERY", title: "Delivery cancelled", body: `Order ${e.orderNumber} was cancelled. No action needed.`, template: "partner.cancelled", channels: ["IN_APP", "PUSH"] });
      } else if (e.kind === "autoRefund") {
        const order = await getDoc<Order>(orderRef(e.orderId));
        const due = order ? order.totalPaise - order.refundedPaise : 0;
        if (due > 0) await createRefund({ orderId: e.orderId, amountPaise: due, reason: e.reason, method: "GATEWAY" }, { type: "SYSTEM" });
      }
    } catch (err) {
      logger.error({ err, effect: e.kind }, "order effect failed");
    }
  }
}

export async function changeOrderStatus(orderId: string, to: OrderStatus, actor: Actor, note?: string) {
  const { result, effects } = await withOrderTx(async (ctx) => applyTransition(ctx, await ctx.lock(orderId), to, actor, note));
  await runEffects(effects);
  return result;
}

export async function cancelOrder(orderId: string, actor: Actor, reason: string) {
  return changeOrderStatus(orderId, "CANCELLED", actor, reason);
}

// ── Payments ──
const paymentsCol = () => db.collection(C.payments);

export async function paymentByGatewayOrder(gatewayOrderId: string, tx?: Transaction) {
  return (await getDocs<Payment>(paymentsCol().where("gatewayOrderId", "==", gatewayOrderId).limit(1), tx))[0] ?? null;
}

export async function markOrderPaid(input: { gatewayOrderId: string; gatewayPaymentId: string; amountPaise: number; method?: string; raw?: unknown }) {
  const lookup = await paymentByGatewayOrder(input.gatewayOrderId);
  if (!lookup) throw notFound("Payment");
  let mismatch: { expected: number; got: number } | null = null;
  const { result, effects } = await withOrderTx(async (ctx) => {
    const order = await ctx.lock(lookup.orderId);
    const fresh = await getDoc<Payment>(paymentsCol().doc(lookup.id), ctx.tx);
    if (!fresh) throw notFound("Payment");
    if (fresh.status === "CAPTURED") return { order, duplicate: true };
    const now = new Date();
    if (input.amountPaise !== fresh.amountPaise) {
      ctx.tx.update(paymentsCol().doc(fresh.id), { status: "FAILED", failureReason: `Amount mismatch: expected ${fresh.amountPaise}, got ${input.amountPaise}`, raw: (input.raw ?? null) as object, updatedAt: now });
      mismatch = { expected: fresh.amountPaise, got: input.amountPaise };
      return { order, duplicate: false };
    }
    ctx.tx.update(paymentsCol().doc(fresh.id), {
      status: "CAPTURED", gatewayPaymentId: input.gatewayPaymentId, methodDetail: input.method ?? null, capturedAt: now,
      raw: (input.raw ?? null) as object, failureReason: null, updatedAt: now,
    });
    order.paymentStatus = "PAID";
    ctx.save(order);
    if (order.status === "PENDING") await applyTransition(ctx, order, "CONFIRMED", { type: "SYSTEM" }, "Payment received");
    else if (order.status === "CANCELLED")
      // Payment arrived after the reservation expired: refund automatically.
      ctx.effects.push({ kind: "autoRefund", orderId: order.id, reason: "Payment received after order was cancelled" });
    ctx.effects.push({ kind: "paid", order });
    return { order, duplicate: false };
  });
  if (mismatch) {
    logger.error({ orderId: lookup.orderId, ...(mismatch as object) }, "payment amount mismatch");
    throw conflict("Payment amount does not match the order total.", undefined, "AMOUNT_MISMATCH");
  }
  await runEffects(effects);
  return result;
}

export async function markPaymentFailed(gatewayOrderId: string, _gatewayPaymentId: string, reason: string, raw?: unknown) {
  const payment = await paymentByGatewayOrder(gatewayOrderId);
  if (!payment || payment.status === "CAPTURED") return;
  await paymentsCol().doc(payment.id).update({ status: "FAILED", failureReason: reason.slice(0, 300), raw: (raw ?? null) as object, updatedAt: new Date() });
  const order = await getDoc<Order>(orderRef(payment.orderId));
  if (!order) return;
  if (order.paymentStatus === "PENDING") await orderRef(order.id).update({ paymentStatus: "FAILED", updatedAt: new Date() });
  notifyPayment(order, false);
}

// ── Refunds ──
const refundsCol = () => db.collection(C.refunds);

export async function createRefund(
  input: { orderId: string; amountPaise: number; reason: string; method?: "GATEWAY" | "MANUAL"; reference?: string; returnRequestId?: string },
  actor: Actor,
): Promise<WithId<Refund>> {
  const { result: prep, effects } = await withOrderTx(async (ctx) => {
    const order = await ctx.lock(input.orderId);
    if (!["PAID", "PARTIALLY_REFUNDED", "COD_COLLECTED"].includes(order.paymentStatus)) throw badRequest("Only paid orders can be refunded.");
    const [existing, payments] = await Promise.all([
      getDocs<Refund>(refundsCol().where("orderId", "==", order.id), ctx.tx),
      getDocs<Payment>(paymentsCol().where("orderId", "==", order.id), ctx.tx),
    ]);
    const pending = existing.filter((r) => r.status === "PENDING" || r.status === "PROCESSING").reduce((s, r) => s + r.amountPaise, 0);
    const refundable = order.totalPaise - order.refundedPaise - pending;
    if (input.amountPaise > refundable) throw badRequest(`Maximum refundable amount is ₹${(refundable / 100).toFixed(2)}.`);
    const payment = payments.filter((p) => p.method === "ONLINE" && p.status === "CAPTURED").sort((a, b) => +b.createdAt - +a.createdAt)[0] ?? null;
    const method = input.method ?? (payment ? "GATEWAY" : "MANUAL");
    if (method === "GATEWAY" && !payment?.gatewayPaymentId) throw badRequest("No captured online payment found — record a manual refund instead.");
    if (method === "MANUAL" && !input.reference && actor.type !== "SYSTEM") throw badRequest("Add the UPI/bank transfer reference for a manual refund.");
    const now = new Date();
    const ref = refundsCol().doc();
    const refund: Refund = {
      orderId: order.id, paymentId: payment?.id ?? null, amountPaise: input.amountPaise, reason: input.reason, method, status: method === "MANUAL" ? "PROCESSED" : "PENDING",
      gatewayRefundId: null, reference: input.reference ?? null, failureReason: null, initiatedById: actor.userId ?? null,
      processedAt: method === "MANUAL" ? now : null, returnRequestId: input.returnRequestId ?? null, createdAt: now, updatedAt: now,
    };
    ctx.tx.set(ref, refund);
    if (input.returnRequestId) ctx.tx.update(db.collection(C.returns).doc(input.returnRequestId), { refundId: ref.id, status: "APPROVED", updatedAt: now });
    if (order.status === "CANCELLED" || order.status === "DELIVERED") await applyTransition(ctx, order, "REFUND_INITIATED", actor, input.reason);
    if (method === "MANUAL") await applyRefundProcessed(ctx, order, { ...refund, id: ref.id }, payments);
    return { refund: { ...refund, id: ref.id }, payment };
  });
  await runEffects(effects);

  if (prep.refund.method === "GATEWAY") {
    try {
      const r = await razorpay.refund(prep.payment!.gatewayPaymentId!, prep.refund.amountPaise, { refundId: prep.refund.id, orderId: input.orderId });
      await refundsCol().doc(prep.refund.id).update({ gatewayRefundId: r.id, status: "PROCESSING", updatedAt: new Date() });
      if (r.status === "processed") await settleGatewayRefund(r.id, "processed");
    } catch (err) {
      await refundsCol().doc(prep.refund.id).update({ status: "FAILED", failureReason: (err as Error).message.slice(0, 300), updatedAt: new Date() });
      logger.error({ err, refundId: prep.refund.id }, "gateway refund failed");
      throw err;
    }
  }
  return (await getDoc<Refund>(refundsCol().doc(prep.refund.id)))!;
}

async function applyRefundProcessed(ctx: OrderTx, order: WithId<Order>, refund: WithId<Refund>, payments?: WithId<Payment>[]) {
  const refundedPaise = order.refundedPaise + refund.amountPaise;
  const full = refundedPaise >= order.totalPaise;
  order.refundedPaise = refundedPaise;
  order.paymentStatus = full ? "REFUNDED" : "PARTIALLY_REFUNDED";
  ctx.save(order);
  if (full) {
    const pays = payments ?? (await getDocs<Payment>(paymentsCol().where("orderId", "==", order.id), ctx.tx));
    for (const p of pays.filter((x) => x.status === "CAPTURED")) ctx.tx.update(paymentsCol().doc(p.id), { status: "REFUNDED", updatedAt: new Date() });
  }
  if (full && order.status === "REFUND_INITIATED") {
    await applyTransition(ctx, order, "REFUNDED", { type: "SYSTEM" }, "Refund processed");
  } else {
    const o = order;
    ctx.effects.push({
      kind: "run",
      fn: () => notify({ userId: o.userId, type: "PAYMENT", title: "Refund processed", body: `₹${(refund.amountPaise / 100).toFixed(2)} has been refunded for order ${o.orderNumber}.`, link: `/account/orders/${o.id}`, template: "refund.processed", channels: ["IN_APP", "EMAIL"] }),
    });
  }
}

export async function settleGatewayRefund(gatewayRefundId: string, status: "processed" | "failed", reason?: string) {
  const refund = (await getDocs<Refund>(refundsCol().where("gatewayRefundId", "==", gatewayRefundId).limit(1)))[0];
  if (!refund || refund.status === "PROCESSED" || refund.status === "FAILED") return refund ?? null;
  if (status === "failed") {
    await refundsCol().doc(refund.id).update({ status: "FAILED", failureReason: reason ?? "Refund failed at gateway", updatedAt: new Date() });
    return getDoc<Refund>(refundsCol().doc(refund.id));
  }
  const { effects } = await withOrderTx(async (ctx) => {
    const fresh = await getDoc<Refund>(refundsCol().doc(refund.id), ctx.tx);
    const order = await ctx.lock(refund.orderId);
    if (!fresh || (fresh.status !== "PENDING" && fresh.status !== "PROCESSING")) return;
    ctx.tx.update(refundsCol().doc(refund.id), { status: "PROCESSED", processedAt: new Date(), updatedAt: new Date() });
    await applyRefundProcessed(ctx, order, fresh);
  });
  await runEffects(effects);
  return getDoc<Refund>(refundsCol().doc(refund.id));
}

/** Job: cancel online orders whose payment window lapsed (after checking the gateway one last time). */
export async function expireUnpaidOrders() {
  const now = new Date();
  const due = (await getDocs<Order>(db.collection(C.orders).where("status", "==", "PENDING").limit(200)))
    .filter((o) => o.paymentMethod === "ONLINE" && o.reservationExpiresAt && o.reservationExpiresAt < now)
    .slice(0, 50);
  let cancelled = 0;
  for (const o of due) {
    const p = (await getDocs<Payment>(paymentsCol().where("orderId", "==", o.id))).find((x) => x.gatewayOrderId);
    try {
      if (p?.gatewayOrderId) {
        const list = await razorpay.fetchOrderPayments(p.gatewayOrderId).catch(() => null);
        const captured = list?.items.find((x) => x.status === "captured");
        if (captured) {
          await markOrderPaid({ gatewayOrderId: p.gatewayOrderId, gatewayPaymentId: captured.id, amountPaise: captured.amount, method: captured.method, raw: captured });
          continue;
        }
      }
      await cancelOrder(o.id, { type: "SYSTEM" }, "Payment not completed in time");
      cancelled++;
    } catch (err) {
      logger.error({ err, orderId: o.id }, "failed to expire order");
    }
  }
  return cancelled;
}
