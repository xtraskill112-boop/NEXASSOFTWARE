import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@naamdev/db";
import { addAddress, inventoryOf, loginAs, newCustomer, rzp, settle, variantBySlug } from "./helpers";

async function onlineOrder() {
  const { c } = await newCustomer("Online Payer");
  const addressId = await addAddress(c);
  const v = await variantBySlug("royal-mixed-dry-fruits", 1);
  await c.post("/api/v1/cart/items", { variantId: v.id, quantity: 1 });
  const r = await c.post("/api/v1/checkout/place-order", { addressId, paymentMethod: "ONLINE", idempotencyKey: randomUUID() });
  expect(r.status).toBe(201);
  return { c, order: r.body.order, payment: r.body.payment, variant: v };
}

describe("Razorpay payments", () => {
  it("creates a pending order with a gateway order and a reservation window", async () => {
    const { order, payment } = await onlineOrder();
    expect(order.status).toBe("PENDING");
    expect(order.paymentStatus).toBe("PENDING");
    expect(payment.razorpayOrderId).toMatch(/^order_/);
    expect(payment.amountPaise).toBe(order.totals.totalPaise);
    expect(new Date(payment.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects a forged signature and does not confirm the order", async () => {
    const { c, order, payment } = await onlineOrder();
    const p = await rzp.pay(payment.razorpayOrderId);
    const r = await c.post("/api/v1/payments/razorpay/verify", { orderId: order.id, razorpay_order_id: payment.razorpayOrderId, razorpay_payment_id: p.id, razorpay_signature: "f".repeat(64) });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("SIGNATURE_INVALID");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe("PENDING");
  });

  it("verifies a genuine payment, confirms the order and is idempotent on replay", async () => {
    const { c, order, payment } = await onlineOrder();
    const p = await rzp.pay(payment.razorpayOrderId);
    const body = { orderId: order.id, razorpay_order_id: payment.razorpayOrderId, razorpay_payment_id: p.id, razorpay_signature: rzp.signature(payment.razorpayOrderId, p.id) };
    const r = await c.post("/api/v1/payments/razorpay/verify", body);
    expect(r.status).toBe(200);
    expect(r.body.order.status).toBe("CONFIRMED");
    expect(r.body.order.paymentStatus).toBe("PAID");
    const again = await c.post("/api/v1/payments/razorpay/verify", body);
    expect(again.status).toBe(200);
    // Webhook for the same payment is also a no-op.
    const wh = await rzp.webhook({ event: "payment.captured", payload: { payment: { entity: { ...p, status: "captured" } } } });
    expect(wh.status).toBe(200);
    expect(await prisma.payment.count({ where: { orderId: order.id, status: "CAPTURED" } })).toBe(1);
    expect(await prisma.orderStatusHistory.count({ where: { orderId: order.id, toStatus: "CONFIRMED" } })).toBe(1);
    await settle();
  });

  it("rejects payments whose amount doesn't match the order", async () => {
    const { c, order, payment } = await onlineOrder();
    const p = await rzp.pay(payment.razorpayOrderId, 100);
    const r = await c.post("/api/v1/payments/razorpay/verify", { orderId: order.id, razorpay_order_id: payment.razorpayOrderId, razorpay_payment_id: p.id, razorpay_signature: rzp.signature(payment.razorpayOrderId, p.id) });
    expect(r.status).toBe(409);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");
  });

  it("confirms via webhook when the browser never returns, and ignores duplicate events", async () => {
    const { order, payment } = await onlineOrder();
    const p = await rzp.pay(payment.razorpayOrderId);
    const eventId = randomUUID();
    const evt = { event: "payment.captured", payload: { payment: { entity: { ...p, status: "captured" } } } };
    expect((await rzp.webhook(evt, eventId)).status).toBe(200);
    const dup = await rzp.webhook(evt, eventId);
    expect(dup.body.duplicate).toBe(true);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("CONFIRMED");
    await settle();
  });

  it("rejects webhooks with an invalid signature", async () => {
    const { default: request } = await import("supertest");
    const { app } = await import("./helpers");
    const r = await request(app).post("/api/v1/payments/razorpay/webhook").set("content-type", "application/json").set("x-razorpay-signature", "bad").send(JSON.stringify({ event: "payment.captured", payload: {} }));
    expect(r.status).toBe(400);
  });

  it("refunds automatically when a paid order is cancelled, and settles via webhook", async () => {
    const { c, order, payment, variant } = await onlineOrder();
    const p = await rzp.pay(payment.razorpayOrderId);
    await c.post("/api/v1/payments/razorpay/verify", { orderId: order.id, razorpay_order_id: payment.razorpayOrderId, razorpay_payment_id: p.id, razorpay_signature: rzp.signature(payment.razorpayOrderId, p.id) });
    const stockBefore = await inventoryOf(variant.id);
    const cancel = await c.post(`/api/v1/orders/${order.id}/cancel`, { reason: "Changed my mind" });
    expect(cancel.status).toBe(200);
    const refund = await prisma.refund.findFirstOrThrow({ where: { orderId: order.id } });
    expect(refund.status).toBe("PROCESSING");
    expect(refund.gatewayRefundId).toMatch(/^rfnd_/);
    expect(refund.amountPaise).toBe(order.totals.totalPaise);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("REFUND_INITIATED");
    expect((await inventoryOf(variant.id)).available).toBe(stockBefore.available + 1);

    const wh = await rzp.webhook({ event: "refund.processed", payload: { refund: { entity: { id: refund.gatewayRefundId, payment_id: p.id, amount: refund.amountPaise, status: "processed" } } } });
    expect(wh.status).toBe(200);
    const final = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(final.status).toBe("REFUNDED");
    expect(final.paymentStatus).toBe("REFUNDED");
    expect(final.refundedPaise).toBe(final.totalPaise);
    await settle();
  });

  it("supports partial refunds initiated by staff and blocks over-refunding", async () => {
    const { c, order, payment } = await onlineOrder();
    const p = await rzp.pay(payment.razorpayOrderId);
    await c.post("/api/v1/payments/razorpay/verify", { orderId: order.id, razorpay_order_id: payment.razorpayOrderId, razorpay_payment_id: p.id, razorpay_signature: rzp.signature(payment.razorpayOrderId, p.id) });
    const admin = await loginAs("manager@naamdevsweets.local");
    const r1 = await admin.post(`/api/v1/admin/orders/${order.id}/refunds`, { amountPaise: 5000, reason: "Box slightly damaged" });
    expect(r1.status).toBe(201);
    const over = await admin.post(`/api/v1/admin/orders/${order.id}/refunds`, { amountPaise: order.totals.totalPaise, reason: "Too much" });
    expect(over.status).toBe(400);
    await rzp.setRefundStatus(r1.body.refund.gatewayRefundId, "processed");
    const sync = await admin.post(`/api/v1/admin/orders/refunds/${r1.body.refund.id}/sync`);
    expect(sync.body.refund.status).toBe("PROCESSED");
    const o = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.paymentStatus).toBe("PARTIALLY_REFUNDED");
    expect(o.refundedPaise).toBe(5000);
    await settle();
  });
});
