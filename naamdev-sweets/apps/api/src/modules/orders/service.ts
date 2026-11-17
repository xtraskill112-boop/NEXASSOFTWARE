import { prisma, type ActorType, type Order, type OrderStatus, type Tx } from "@naamdev/db";
import { canTransition, SOCKET_EVENTS } from "@naamdev/shared";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { nextInvoiceNumber } from "../../lib/counters";
import { emitTo, rooms } from "../../realtime/io";
import { awardPoints, onOrderDelivered } from "../loyalty/service";
import { commitStock, releaseStock } from "../inventory/service";
import { notify, notifyOrderStatus, notifyPayment, notifyStaff } from "../notifications/service";
import { razorpay } from "../payments/razorpay";
import { autoOfferDelivery } from "../delivery/service";

export interface Actor {
  type: ActorType;
  userId?: string | null;
}

export type Effect =
  | { kind: "status"; order: Order; status: OrderStatus }
  | { kind: "autoRefund"; orderId: string; reason: string }
  | { kind: "autoAssign"; orderId: string }
  | { kind: "partnerCancelled"; partnerId: string; assignmentId: string; orderNumber: string }
  | { kind: "paid"; order: Order }
  | { kind: "newOrder"; order: Order };

/** Locks the order row for the remainder of the transaction. */
export async function lockOrder(tx: Tx, orderId: string): Promise<Order> {
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound("Order");
  return order;
}

/**
 * Applies a lifecycle transition with all of its side effects (stock, coupons, points,
 * invoices, assignments). Must run inside a transaction holding the order lock.
 */
export async function applyTransition(tx: Tx, order: Order, to: OrderStatus, actor: Actor, note?: string): Promise<{ order: Order; effects: Effect[] }> {
  if (order.status === to) return { order, effects: [] };
  if (!canTransition(order.status, to)) throw conflict(`Cannot move an order from ${order.status} to ${to}.`, { from: order.status, to }, "INVALID_TRANSITION");
  const effects: Effect[] = [];
  const now = new Date();
  const data: Parameters<Tx["order"]["update"]>[0]["data"] = { status: to };

  switch (to) {
    case "CONFIRMED":
      data.confirmedAt = now;
      data.reservationExpiresAt = null;
      data.invoiceNumber = order.invoiceNumber ?? (await nextInvoiceNumber(tx));
      effects.push({ kind: "newOrder", order });
      break;
    case "PACKED":
    case "READY_FOR_PICKUP": {
      const active = await tx.deliveryAssignment.count({ where: { orderId: order.id, status: { in: ["OFFERED", "ACCEPTED", "AT_STORE", "PICKED_UP", "OUT_FOR_DELIVERY"] } } });
      if (!active) effects.push({ kind: "autoAssign", orderId: order.id });
      break;
    }
    case "DISPATCHED":
      data.dispatchedAt = now;
      await commitStock(tx, order.id);
      break;
    case "DELIVERED":
      data.deliveredAt = now;
      if (order.status !== "DISPATCHED" && order.status !== "OUT_FOR_DELIVERY") break;
      if (order.paymentMethod === "COD") {
        data.paymentStatus = "COD_COLLECTED";
        await tx.payment.updateMany({ where: { orderId: order.id, method: "COD" }, data: { status: "CAPTURED", capturedAt: now } });
      }
      await onOrderDelivered(tx, order);
      break;
    case "CANCELLED": {
      data.cancelledAt = now;
      data.cancelReason = note ?? "Cancelled";
      data.cancelledBy = actor.type;
      data.reservationExpiresAt = null;
      await releaseStock(tx, order.id, `Order ${order.orderNumber} cancelled`);
      if (order.couponId) {
        const usage = await tx.couponUsage.findUnique({ where: { orderId: order.id } });
        if (usage) {
          await tx.couponUsage.delete({ where: { id: usage.id } });
          await tx.coupon.update({ where: { id: order.couponId }, data: { usedCount: { decrement: 1 } } });
        }
      }
      if (order.pointsRedeemed > 0)
        await awardPoints(tx, order.userId, order.pointsRedeemed, "REVERSAL", `Points restored — order ${order.orderNumber} cancelled`, order.id);
      if (order.paymentMethod === "COD") await tx.payment.updateMany({ where: { orderId: order.id, status: "CREATED" }, data: { status: "FAILED", failureReason: "Order cancelled" } });
      const assignments = await tx.deliveryAssignment.findMany({ where: { orderId: order.id, status: { in: ["OFFERED", "ACCEPTED", "AT_STORE"] } } });
      for (const a of assignments) {
        await tx.deliveryAssignment.update({ where: { id: a.id }, data: { status: "CANCELLED", cancelledAt: now } });
        effects.push({ kind: "partnerCancelled", partnerId: a.partnerId, assignmentId: a.id, orderNumber: order.orderNumber });
      }
      if (order.paymentStatus === "PAID") effects.push({ kind: "autoRefund", orderId: order.id, reason: note ?? "Order cancelled" });
      break;
    }
    case "REFUNDED":
      break;
  }

  const updated = await tx.order.update({ where: { id: order.id }, data });
  await tx.orderStatusHistory.create({
    data: { orderId: order.id, fromStatus: order.status, toStatus: to, note: note ?? null, actorType: actor.type, changedById: actor.userId ?? null },
  });
  effects.unshift({ kind: "status", order: updated, status: to });
  return { order: updated, effects };
}

/** Executes post-commit side effects (notifications, sockets, refunds, partner offers). */
export async function runEffects(effects: Effect[]) {
  for (const e of effects) {
    try {
      if (e.kind === "status") notifyOrderStatus(e.order, e.status);
      else if (e.kind === "paid") notifyPayment(e.order, true);
      else if (e.kind === "newOrder") {
        emitTo(rooms.staff, SOCKET_EVENTS.adminNewOrder, { orderId: e.order.id, orderNumber: e.order.orderNumber, totalPaise: e.order.totalPaise });
        notifyStaff("orders.manage", { type: "ORDER", title: `New order ${e.order.orderNumber}`, body: `₹${(e.order.totalPaise / 100).toLocaleString("en-IN")} · ${e.order.paymentMethod === "COD" ? "Cash on delivery" : "Paid online"}`, link: `/orders/${e.order.id}`, template: "admin.new_order" });
      } else if (e.kind === "autoAssign") await autoOfferDelivery(e.orderId);
      else if (e.kind === "partnerCancelled") {
        emitTo(rooms.partner(e.partnerId), SOCKET_EVENTS.deliveryOfferWithdrawn, { assignmentId: e.assignmentId });
        const partner = await prisma.deliveryPartner.findUnique({ where: { id: e.partnerId } });
        if (partner) notify({ userId: partner.userId, type: "DELIVERY", title: "Delivery cancelled", body: `Order ${e.orderNumber} was cancelled. No action needed.`, template: "partner.cancelled", channels: ["IN_APP", "PUSH"] });
      } else if (e.kind === "autoRefund") {
        const order = await prisma.order.findUniqueOrThrow({ where: { id: e.orderId } });
        const due = order.totalPaise - order.refundedPaise;
        if (due > 0) await createRefund({ orderId: e.orderId, amountPaise: due, reason: e.reason, method: "GATEWAY" }, { type: "SYSTEM" });
      }
    } catch (err) {
      logger.error({ err, effect: e.kind }, "order effect failed");
    }
  }
}

export async function changeOrderStatus(orderId: string, to: OrderStatus, actor: Actor, note?: string) {
  const { order, effects } = await prisma.$transaction(async (tx) => applyTransition(tx, await lockOrder(tx, orderId), to, actor, note));
  await runEffects(effects);
  return order;
}

export async function cancelOrder(orderId: string, actor: Actor, reason: string) {
  return changeOrderStatus(orderId, "CANCELLED", actor, reason);
}

// ── Payments ──

export async function markOrderPaid(input: { gatewayOrderId: string; gatewayPaymentId: string; amountPaise: number; method?: string; raw?: unknown }) {
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { gatewayOrderId: input.gatewayOrderId } });
    if (!payment) throw notFound("Payment");
    const order = await lockOrder(tx, payment.orderId);
    const fresh = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    if (fresh.status === "CAPTURED") return { order, effects: [] as Effect[], duplicate: true };
    if (input.amountPaise !== fresh.amountPaise) {
      await tx.payment.update({ where: { id: fresh.id }, data: { status: "FAILED", failureReason: `Amount mismatch: expected ${fresh.amountPaise}, got ${input.amountPaise}`, raw: input.raw as object } });
      logger.error({ orderId: order.id, expected: fresh.amountPaise, got: input.amountPaise }, "payment amount mismatch");
      throw conflict("Payment amount does not match the order total.", undefined, "AMOUNT_MISMATCH");
    }
    await tx.payment.update({
      where: { id: fresh.id },
      data: { status: "CAPTURED", gatewayPaymentId: input.gatewayPaymentId, methodDetail: input.method, capturedAt: new Date(), raw: (input.raw ?? undefined) as object | undefined, failureReason: null },
    });
    const effects: Effect[] = [];
    let updated = await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "PAID" } });
    if (updated.status === "PENDING") {
      const r = await applyTransition(tx, updated, "CONFIRMED", { type: "SYSTEM" }, "Payment received");
      updated = r.order;
      effects.push(...r.effects);
    } else if (updated.status === "CANCELLED") {
      // Payment arrived after the reservation expired: refund automatically.
      effects.push({ kind: "autoRefund", orderId: order.id, reason: "Payment received after order was cancelled" });
    }
    effects.push({ kind: "paid", order: updated });
    return { order: updated, effects, duplicate: false };
  });
  await runEffects(result.effects);
  return result;
}

export async function markPaymentFailed(gatewayOrderId: string, gatewayPaymentId: string, reason: string, raw?: unknown) {
  const payment = await prisma.payment.findUnique({ where: { gatewayOrderId }, include: { order: true } });
  if (!payment || payment.status === "CAPTURED") return;
  await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: reason.slice(0, 300), raw: raw as object } });
  if (payment.order.paymentStatus === "PENDING") await prisma.order.update({ where: { id: payment.orderId }, data: { paymentStatus: "FAILED" } });
  notifyPayment(payment.order, false);
  void gatewayPaymentId;
}

// ── Refunds ──

export async function createRefund(
  input: { orderId: string; amountPaise: number; reason: string; method?: "GATEWAY" | "MANUAL"; reference?: string; returnRequestId?: string },
  actor: Actor,
) {
  const prep = await prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (!["PAID", "PARTIALLY_REFUNDED", "COD_COLLECTED"].includes(order.paymentStatus))
      throw badRequest("Only paid orders can be refunded.");
    const pending = await tx.refund.aggregate({ where: { orderId: order.id, status: { in: ["PENDING", "PROCESSING"] } }, _sum: { amountPaise: true } });
    const refundable = order.totalPaise - order.refundedPaise - (pending._sum.amountPaise ?? 0);
    if (input.amountPaise > refundable) throw badRequest(`Maximum refundable amount is ₹${(refundable / 100).toFixed(2)}.`);
    const payment = await tx.payment.findFirst({ where: { orderId: order.id, method: "ONLINE", status: "CAPTURED" }, orderBy: { createdAt: "desc" } });
    const method = input.method ?? (payment ? "GATEWAY" : "MANUAL");
    if (method === "GATEWAY" && !payment?.gatewayPaymentId) throw badRequest("No captured online payment found — record a manual refund instead.");
    if (method === "MANUAL" && !input.reference && actor.type !== "SYSTEM") throw badRequest("Add the UPI/bank transfer reference for a manual refund.");
    const refund = await tx.refund.create({
      data: {
        orderId: order.id, paymentId: payment?.id, amountPaise: input.amountPaise, reason: input.reason, method,
        reference: input.reference, initiatedById: actor.userId ?? null, status: method === "MANUAL" ? "PROCESSED" : "PENDING",
        processedAt: method === "MANUAL" ? new Date() : null,
      },
    });
    if (input.returnRequestId) await tx.returnRequest.update({ where: { id: input.returnRequestId }, data: { refundId: refund.id, status: "APPROVED" } });
    const effects: Effect[] = [];
    if (order.status === "CANCELLED" || order.status === "DELIVERED") {
      const r = await applyTransition(tx, order, "REFUND_INITIATED", actor, input.reason);
      effects.push(...r.effects);
    }
    if (method === "MANUAL") effects.push(...(await applyRefundProcessed(tx, refund.id)));
    return { refund, payment, effects };
  });
  await runEffects(prep.effects);

  if (prep.refund.method === "GATEWAY") {
    try {
      const r = await razorpay.refund(prep.payment!.gatewayPaymentId!, prep.refund.amountPaise, { refundId: prep.refund.id, orderId: input.orderId });
      await prisma.refund.update({ where: { id: prep.refund.id }, data: { gatewayRefundId: r.id, status: "PROCESSING" } });
      if (r.status === "processed") await settleGatewayRefund(r.id, "processed");
    } catch (err) {
      await prisma.refund.update({ where: { id: prep.refund.id }, data: { status: "FAILED", failureReason: (err as Error).message.slice(0, 300) } });
      logger.error({ err, refundId: prep.refund.id }, "gateway refund failed");
      throw err;
    }
  }
  return prisma.refund.findUniqueOrThrow({ where: { id: prep.refund.id } });
}

async function applyRefundProcessed(tx: Tx, refundId: string): Promise<Effect[]> {
  const refund = await tx.refund.findUniqueOrThrow({ where: { id: refundId } });
  const order = await lockOrder(tx, refund.orderId);
  const refundedPaise = order.refundedPaise + refund.amountPaise;
  const full = refundedPaise >= order.totalPaise;
  let updated = await tx.order.update({ where: { id: order.id }, data: { refundedPaise, paymentStatus: full ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
  if (full) await tx.payment.updateMany({ where: { orderId: order.id, status: "CAPTURED" }, data: { status: "REFUNDED" } });
  const effects: Effect[] = [];
  if (full && updated.status === "REFUND_INITIATED") {
    const r = await applyTransition(tx, updated, "REFUNDED", { type: "SYSTEM" }, "Refund processed");
    updated = r.order;
    effects.push(...r.effects);
  } else {
    notify({ userId: order.userId, type: "PAYMENT", title: "Refund processed", body: `₹${(refund.amountPaise / 100).toFixed(2)} has been refunded for order ${order.orderNumber}.`, link: `/account/orders/${order.id}`, template: "refund.processed", channels: ["IN_APP", "EMAIL"] });
  }
  return effects;
}

export async function settleGatewayRefund(gatewayRefundId: string, status: "processed" | "failed", reason?: string) {
  const refund = await prisma.refund.findUnique({ where: { gatewayRefundId } });
  if (!refund || refund.status === "PROCESSED" || refund.status === "FAILED") return refund;
  if (status === "failed") return prisma.refund.update({ where: { id: refund.id }, data: { status: "FAILED", failureReason: reason ?? "Refund failed at gateway" } });
  const effects = await prisma.$transaction(async (tx) => {
    const r = await tx.refund.updateMany({ where: { id: refund.id, status: { in: ["PENDING", "PROCESSING"] } }, data: { status: "PROCESSED", processedAt: new Date() } });
    if (r.count !== 1) return [] as Effect[];
    return applyRefundProcessed(tx, refund.id);
  });
  await runEffects(effects);
  return prisma.refund.findUnique({ where: { id: refund.id } });
}

/** Job: cancel online orders whose payment window lapsed (after checking the gateway one last time). */
export async function expireUnpaidOrders() {
  const due = await prisma.order.findMany({
    where: { status: "PENDING", paymentMethod: "ONLINE", reservationExpiresAt: { lt: new Date() } },
    include: { payments: true },
    take: 50,
  });
  let cancelled = 0;
  for (const o of due) {
    const p = o.payments.find((x) => x.gatewayOrderId);
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
