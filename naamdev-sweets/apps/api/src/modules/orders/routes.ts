import { Router } from "express";
import express from "express";
import { z } from "zod";
import { C, db, getDoc, getDocs, getMany, type Order, type Payment, type Review, type WebhookEvent } from "@naamdev/db";
import {
  CUSTOMER_CANCELLABLE, cancelOrderSchema, checkoutQuoteSchema, paginationSchema, placeOrderSchema, razorpayVerifySchema, returnRequestSchema, upiProofSchema,
} from "@naamdev/shared";
import { integrations } from "../../config/env";
import { badRequest, notFound } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { body, pageOf, param, query } from "../../lib/http";
import { getSetting } from "../../lib/settings";
import { requireAuth } from "../../middleware/auth";
import { writeLimiter } from "../../middleware/rate-limit";
import { findCart, addItem } from "../cart/service";
import { notifyStaff } from "../notifications/service";
import { verifyPaymentSignature, verifyWebhookSignature, razorpay, type RzpPayment, type RzpRefund } from "../payments/razorpay";
import { paymentSession, placeOrder, quote } from "./checkout";
import { customerOrder, loadOrderFull, loadOrdersFull, trackingPayload } from "./serializers";
import { cancelOrder, markOrderPaid, markPaymentFailed, settleGatewayRefund } from "./service";
import { submitUpiReference, upiSession } from "./upi";

export const checkoutRouter = Router();
checkoutRouter.use(requireAuth);

checkoutRouter.post("/quote", async (req, res) => {
  const input = body(req, checkoutQuoteSchema);
  res.json({ quote: await quote(req.auth!.user.id, input) });
});

checkoutRouter.post("/place-order", writeLimiter, async (req, res) => {
  const input = body(req, placeOrderSchema);
  const r = await placeOrder(req.auth!.user.id, input);
  const order = await loadOrderFull((await getDoc<Order>(db.collection(C.orders).doc(r.order.id)))!);
  res.status(r.duplicate ? 200 : 201).json({
    order: await customerOrder(order),
    duplicate: r.duplicate,
    payment: order.status === "PENDING" && order.paymentMethod === "ONLINE" ? await paymentSession(req.auth!.user.id, order.id) : null,
    upi: await upiSession(order),
  });
});

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

ordersRouter.get("/", async (req, res) => {
  const { page, pageSize, status } = query(req, paginationSchema.extend({ status: z.enum(["active", "past", "all"]).default("all") }));
  const ACTIVE = ["PENDING", "CONFIRMED", "PROCESSING", "PREPARING", "PACKED", "READY_FOR_PICKUP", "DISPATCHED", "OUT_FOR_DELIVERY"];
  const PAST = ["DELIVERED", "CANCELLED", "REFUND_INITIATED", "REFUNDED"];
  const all = await getDocs<Order>(db.collection(C.orders).where("userId", "==", req.auth!.user.id).orderBy("createdAt", "desc").limit(500));
  const filtered = all.filter((o) => (status === "active" ? ACTIVE.includes(o.status) : status === "past" ? PAST.includes(o.status) : true));
  const pg = pageOf(filtered, page, pageSize);
  const full = await loadOrdersFull(pg.items);
  res.json({ items: await Promise.all(full.map(customerOrder)), meta: pg.meta });
});

async function ownOrder(userId: string, id: string) {
  const o = await getDoc<Order>(db.collection(C.orders).doc(id));
  if (!o || o.userId !== userId) throw notFound("Order");
  return loadOrderFull(o);
}

ordersRouter.get("/:id", async (req, res) => {
  const o = await ownOrder(req.auth!.user.id, param(req, "id"));
  const returns = await getSetting("returns");
  const canReturn =
    returns.enabled && o.status === "DELIVERED" && !!o.deliveredAt && Date.now() - o.deliveredAt.getTime() < returns.windowHours * 3600_000 && !o.returnRequests.some((r) => r.status !== "REJECTED");
  const reviewed = await getMany<Review>(C.reviews, o.items.map((i) => `${req.auth!.user.id}_${i.productId}`));
  res.json({
    order: await customerOrder(o),
    upi: await upiSession(o),
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

/** Direct UPI: the customer reports the reference number of their payment for staff to check. */
ordersRouter.post("/:id/upi-reference", writeLimiter, async (req, res) => {
  const { utr } = body(req, upiProofSchema);
  const order = await submitUpiReference(req.auth!.user.id, param(req, "id"), utr);
  const full = await ownOrder(req.auth!.user.id, order.id);
  res.json({ order: await customerOrder(full), upi: await upiSession(full) });
});

ordersRouter.post("/:id/cancel", writeLimiter, async (req, res) => {
  const { reason } = body(req, cancelOrderSchema);
  const o = await ownOrder(req.auth!.user.id, param(req, "id"));
  if (!CUSTOMER_CANCELLABLE.includes(o.status))
    throw badRequest("This order is already being prepared and can't be cancelled from the app. Please contact support.", undefined, "NOT_CANCELLABLE");
  await cancelOrder(o.id, { type: "CUSTOMER", userId: req.auth!.user.id, name: req.auth!.user.name }, reason);
  res.json({ order: await customerOrder(await ownOrder(req.auth!.user.id, o.id)) });
});

ordersRouter.post("/:id/reorder", async (req, res) => {
  const o = await ownOrder(req.auth!.user.id, param(req, "id"));
  const cart = (await findCart(req, true, res))!;
  const added: string[] = [];
  const skipped: string[] = [];
  for (const i of o.items) {
    try {
      await addItem(cart, i.variantId, i.quantity);
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
  const now = new Date();
  const ref = db.collection(C.returns).doc();
  const data = { orderId: o.id, userId: req.auth!.user.id, reason: input.reason, description: input.description ?? null, images: input.images, status: "REQUESTED" as const, resolutionNote: null, refundId: null, createdAt: now, updatedAt: now };
  await ref.set(data);
  const rr = { ...data, id: ref.id };
  notifyStaff("refunds.manage", { type: "SUPPORT", title: `Return requested · ${o.orderNumber}`, body: input.reason, link: `/orders/${o.id}`, template: "admin.return_request" });
  res.status(201).json({ returnRequest: rr });
});

// ── Payments ──
export const paymentsRouter = Router();

paymentsRouter.post("/razorpay/verify", requireAuth, async (req, res) => {
  const input = body(req, razorpayVerifySchema);
  const order = await getDoc<Order>(db.collection(C.orders).doc(input.orderId));
  if (!order || order.userId !== req.auth!.user.id) throw notFound("Order");
  const payment = (await getDocs<Payment>(db.collection(C.payments).where("orderId", "==", order.id))).find((p) => p.gatewayOrderId === input.razorpay_order_id);
  if (!payment) throw badRequest("Payment does not belong to this order.");
  if (!verifyPaymentSignature(input.razorpay_order_id, input.razorpay_payment_id, input.razorpay_signature))
    throw badRequest("Payment verification failed. If money was debited it will be refunded automatically.", undefined, "SIGNATURE_INVALID");
  // Never trust the client: confirm status and amount with Razorpay before fulfilling.
  const rp = await razorpay.fetchPayment(input.razorpay_payment_id);
  if (rp.order_id !== input.razorpay_order_id) throw badRequest("Payment does not match this order.", undefined, "SIGNATURE_INVALID");
  if (rp.status !== "captured" && rp.status !== "authorized") throw badRequest("Payment is not complete yet.", { status: rp.status }, "PAYMENT_INCOMPLETE");
  await markOrderPaid({ gatewayOrderId: rp.order_id, gatewayPaymentId: rp.id, amountPaise: rp.amount, method: rp.method, raw: rp });
  const full = await loadOrderFull((await getDoc<Order>(db.collection(C.orders).doc(order.id)))!);
  res.json({ order: await customerOrder(full) });
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
    const eventRef = db.collection(C.webhookEvents).doc(`razorpay__${eventId.replace(/\//g, "_").slice(0, 200)}`);
    try {
      await eventRef.create({ provider: "razorpay", eventId, type: event.event, payload: event as object, processedAt: null, error: null, createdAt: new Date() } satisfies WebhookEvent);
    } catch (err) {
      if ((err as { code?: number }).code === 6) return res.json({ ok: true, duplicate: true }); // ALREADY_EXISTS: processed before
      throw err;
    }
    try {
      const p = event.payload.payment?.entity;
      const r = event.payload.refund?.entity;
      if ((event.event === "payment.captured" || event.event === "order.paid") && p) await markOrderPaid({ gatewayOrderId: p.order_id, gatewayPaymentId: p.id, amountPaise: p.amount, method: p.method, raw: p });
      else if (event.event === "payment.failed" && p) await markPaymentFailed(p.order_id, p.id, p.error_description ?? "Payment failed", p);
      else if (event.event === "refund.processed" && r) await settleGatewayRefund(r.id, "processed");
      else if (event.event === "refund.failed" && r) await settleGatewayRefund(r.id, "failed");
      await eventRef.update({ processedAt: new Date() });
    } catch (err) {
      logger.error({ err, eventId }, "webhook processing failed");
      // Remove the dedupe marker so Razorpay's automatic retry can process the event again.
      await eventRef.delete().catch(() => undefined);
      return res.status(500).json({ ok: false });
    }
    res.json({ ok: true });
  },
] as const;
