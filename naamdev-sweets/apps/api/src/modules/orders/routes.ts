import { Router } from "express";
import express from "express";
import { z } from "zod";
import { prisma } from "@naamdev/db";
import {
  CUSTOMER_CANCELLABLE, cancelOrderSchema, checkoutQuoteSchema, paginationSchema, placeOrderSchema, razorpayVerifySchema, returnRequestSchema,
} from "@naamdev/shared";
import { integrations } from "../../config/env";
import { badRequest, notFound } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { body, pageMeta, paginate, param, query } from "../../lib/http";
import { getSetting } from "../../lib/settings";
import { requireAuth } from "../../middleware/auth";
import { writeLimiter } from "../../middleware/rate-limit";
import { findCart, addItem } from "../cart/service";
import { notifyStaff } from "../notifications/service";
import { verifyPaymentSignature, verifyWebhookSignature, razorpay, type RzpPayment, type RzpRefund } from "../payments/razorpay";
import { paymentSession, placeOrder, quote } from "./checkout";
import { customerOrder, orderInclude, trackingPayload } from "./serializers";
import { cancelOrder, markOrderPaid, markPaymentFailed, settleGatewayRefund } from "./service";

export const checkoutRouter = Router();
checkoutRouter.use(requireAuth);

checkoutRouter.post("/quote", async (req, res) => {
  const input = body(req, checkoutQuoteSchema);
  res.json({ quote: await quote(req.auth!.user.id, input) });
});

checkoutRouter.post("/place-order", writeLimiter, async (req, res) => {
  const input = body(req, placeOrderSchema);
  const r = await placeOrder(req.auth!.user.id, input);
  const order = await prisma.order.findUniqueOrThrow({ where: { id: r.order.id }, include: orderInclude });
  res.status(r.duplicate ? 200 : 201).json({
    order: customerOrder(order),
    duplicate: r.duplicate,
    payment: order.status === "PENDING" && order.paymentMethod === "ONLINE" ? await paymentSession(req.auth!.user.id, order.id) : null,
  });
});

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

ordersRouter.get("/", async (req, res) => {
  const { page, pageSize, status } = query(req, paginationSchema.extend({ status: z.enum(["active", "past", "all"]).default("all") }));
  const where = {
    userId: req.auth!.user.id,
    ...(status === "active" ? { status: { in: ["PENDING", "CONFIRMED", "PROCESSING", "PREPARING", "PACKED", "READY_FOR_PICKUP", "DISPATCHED", "OUT_FOR_DELIVERY"] as never } } : {}),
    ...(status === "past" ? { status: { in: ["DELIVERED", "CANCELLED", "REFUND_INITIATED", "REFUNDED"] as never } } : {}),
  };
  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, include: orderInclude, ...paginate(page, pageSize) }),
  ]);
  res.json({ items: orders.map(customerOrder), meta: pageMeta(total, page, pageSize) });
});

async function ownOrder(userId: string, id: string) {
  const o = await prisma.order.findFirst({ where: { id, userId }, include: orderInclude });
  if (!o) throw notFound("Order");
  return o;
}

ordersRouter.get("/:id", async (req, res) => {
  const o = await ownOrder(req.auth!.user.id, param(req, "id"));
  const returns = await getSetting("returns");
  const canReturn =
    returns.enabled && o.status === "DELIVERED" && !!o.deliveredAt && Date.now() - o.deliveredAt.getTime() < returns.windowHours * 3600_000 && !o.returnRequests.some((r) => r.status !== "REJECTED");
  const reviewed = await prisma.review.findMany({ where: { userId: req.auth!.user.id, productId: { in: o.items.map((i) => i.productId) } }, select: { productId: true } });
  res.json({
    order: customerOrder(o),
    actions: {
      canCancel: CUSTOMER_CANCELLABLE.includes(o.status),
      canPay: o.status === "PENDING" && o.paymentMethod === "ONLINE" && o.paymentStatus !== "PAID" && integrations.razorpay,
      canReturn,
      canReview: o.status === "DELIVERED",
      reviewedProductIds: reviewed.map((r) => r.productId),
    },
  });
});

ordersRouter.get("/:id/tracking", async (req, res) => {
  res.json({ tracking: await trackingPayload(await ownOrder(req.auth!.user.id, param(req, "id"))) });
});

ordersRouter.get("/:id/payment-session", async (req, res) => {
  res.json({ payment: await paymentSession(req.auth!.user.id, param(req, "id")) });
});

ordersRouter.post("/:id/cancel", writeLimiter, async (req, res) => {
  const { reason } = body(req, cancelOrderSchema);
  const o = await ownOrder(req.auth!.user.id, param(req, "id"));
  if (!CUSTOMER_CANCELLABLE.includes(o.status))
    throw badRequest("This order is already being prepared and can't be cancelled from the app. Please contact support.", undefined, "NOT_CANCELLABLE");
  await cancelOrder(o.id, { type: "CUSTOMER", userId: req.auth!.user.id }, reason);
  res.json({ order: customerOrder(await ownOrder(req.auth!.user.id, o.id)) });
});

ordersRouter.post("/:id/reorder", async (req, res) => {
  const o = await ownOrder(req.auth!.user.id, param(req, "id"));
  const cart = (await findCart(req, true, res))!;
  const added: string[] = [];
  const skipped: string[] = [];
  for (const i of o.items) {
    try {
      await addItem(cart.id, i.variantId, i.quantity);
      added.push(i.productName);
    } catch {
      skipped.push(`${i.productName} (${i.variantLabel})`);
    }
  }
  res.json({ added, skipped });
});

ordersRouter.post("/:id/return", writeLimiter, async (req, res) => {
  const input = body(req, returnRequestSchema.extend({ images: z.array(z.string().max(600)).max(4).default([]) }));
  const o = await ownOrder(req.auth!.user.id, param(req, "id"));
  const returns = await getSetting("returns");
  if (!returns.enabled || o.status !== "DELIVERED" || !o.deliveredAt || Date.now() - o.deliveredAt.getTime() > returns.windowHours * 3600_000)
    throw badRequest(`Returns can be requested within ${returns.windowHours} hours of delivery.`);
  if (o.returnRequests.some((r) => r.status !== "REJECTED")) throw badRequest("A return request already exists for this order.");
  const rr = await prisma.returnRequest.create({ data: { orderId: o.id, userId: req.auth!.user.id, reason: input.reason, description: input.description, images: input.images } });
  notifyStaff("refunds.manage", { type: "SUPPORT", title: `Return requested · ${o.orderNumber}`, body: input.reason, link: `/orders/${o.id}`, template: "admin.return_request" });
  res.status(201).json({ returnRequest: rr });
});

// ── Payments ──
export const paymentsRouter = Router();

paymentsRouter.post("/razorpay/verify", requireAuth, async (req, res) => {
  const input = body(req, razorpayVerifySchema);
  const order = await prisma.order.findFirst({ where: { id: input.orderId, userId: req.auth!.user.id }, include: { payments: true } });
  if (!order) throw notFound("Order");
  const payment = order.payments.find((p) => p.gatewayOrderId === input.razorpay_order_id);
  if (!payment) throw badRequest("Payment does not belong to this order.");
  if (!verifyPaymentSignature(input.razorpay_order_id, input.razorpay_payment_id, input.razorpay_signature))
    throw badRequest("Payment verification failed. If money was debited it will be refunded automatically.", undefined, "SIGNATURE_INVALID");
  // Never trust the client: confirm status and amount with Razorpay before fulfilling.
  const rp = await razorpay.fetchPayment(input.razorpay_payment_id);
  if (rp.order_id !== input.razorpay_order_id) throw badRequest("Payment does not match this order.", undefined, "SIGNATURE_INVALID");
  if (rp.status !== "captured" && rp.status !== "authorized") throw badRequest("Payment is not complete yet.", { status: rp.status }, "PAYMENT_INCOMPLETE");
  await markOrderPaid({ gatewayOrderId: rp.order_id, gatewayPaymentId: rp.id, amountPaise: rp.amount, method: rp.method, raw: rp });
  const full = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  res.json({ order: customerOrder(full) });
});

/** Razorpay webhook — mounted before the JSON parser so the raw body can be verified. */
export const razorpayWebhook = [
  express.raw({ type: "application/json", limit: "1mb" }),
  async (req: express.Request, res: express.Response) => {
    const raw = req.body as Buffer;
    const signature = req.get("x-razorpay-signature") ?? "";
    if (!Buffer.isBuffer(raw) || !verifyWebhookSignature(raw, signature)) return res.status(400).json({ error: { code: "SIGNATURE_INVALID", message: "Invalid signature" } });
    const event = JSON.parse(raw.toString("utf8")) as { event: string; payload: { payment?: { entity: RzpPayment }; refund?: { entity: RzpRefund } } };
    const eventId = req.get("x-razorpay-event-id") ?? `${event.event}:${event.payload.payment?.entity.id ?? event.payload.refund?.entity.id}`;
    const stored = await prisma.webhookEvent.createMany({ data: [{ provider: "razorpay", eventId, type: event.event, payload: event as object }], skipDuplicates: true });
    if (stored.count === 0) return res.json({ ok: true, duplicate: true }); // already processed
    try {
      const p = event.payload.payment?.entity;
      const r = event.payload.refund?.entity;
      if ((event.event === "payment.captured" || event.event === "order.paid") && p) await markOrderPaid({ gatewayOrderId: p.order_id, gatewayPaymentId: p.id, amountPaise: p.amount, method: p.method, raw: p });
      else if (event.event === "payment.failed" && p) await markPaymentFailed(p.order_id, p.id, p.error_description ?? "Payment failed", p);
      else if (event.event === "refund.processed" && r) await settleGatewayRefund(r.id, "processed");
      else if (event.event === "refund.failed" && r) await settleGatewayRefund(r.id, "failed");
      await prisma.webhookEvent.update({ where: { provider_eventId: { provider: "razorpay", eventId } }, data: { processedAt: new Date() } });
    } catch (err) {
      logger.error({ err, eventId }, "webhook processing failed");
      // Remove the dedupe marker so Razorpay's automatic retry can process the event again.
      await prisma.webhookEvent.delete({ where: { provider_eventId: { provider: "razorpay", eventId } } }).catch(() => undefined);
      return res.status(500).json({ ok: false });
    }
    res.json({ ok: true });
  },
] as const;
