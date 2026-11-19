import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { C, db, getDocs, type Payment, type Refund } from "@naamdev/db";
import { addAddress, inventoryOf, loginAs, newCustomer, orderDoc, settle, variantBySlug } from "./helpers";

let utrSeq = Math.floor(Math.random() * 1_000_000);
const utr = () => `4${String(10_000_000_000 + utrSeq++).slice(-11)}`;

async function upiOrder(slug = "kaju-katli", index = 1) {
  const { c, user } = await newCustomer("UPI Payer");
  const addressId = await addAddress(c);
  const v = await variantBySlug(slug, index);
  await c.post("/api/v1/cart/items", { variantId: v.id, quantity: 1 });
  const quote = await c.post("/api/v1/checkout/quote", { addressId });
  expect(quote.body.quote.paymentOptions.upi.available).toBe(true);
  const r = await c.post("/api/v1/checkout/place-order", { addressId, paymentMethod: "UPI", idempotencyKey: randomUUID() });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return { c, user, variant: v, order: r.body.order, upi: r.body.upi };
}

describe("direct UPI payments (shop UPI ID, staff-verified)", () => {
  it("creates a pending order with a UPI link for the exact server-side total", async () => {
    const { order, upi, variant } = await upiOrder();
    expect(order.status).toBe("PENDING");
    expect(order.paymentStatus).toBe("PENDING");
    const amount = (order.totals.totalPaise / 100).toFixed(2);
    expect(upi.link).toBe(`upi://pay?pa=paytmqr6rgzn2%40ptys&pn=RAKESH%20TAILOR&am=${amount}&cu=INR&tn=ORDER%20%23${encodeURIComponent(order.orderNumber)}`);
    expect(upi.qrSvg).toMatch(/^<svg/);
    expect(upi.status).toBe("AWAITING_PAYMENT");
    expect(new Date(upi.expiresAt).getTime()).toBeGreaterThan(Date.now());
    // Stock is held for the order while the customer pays.
    expect((await inventoryOf(variant.id)).reserved).toBeGreaterThan(0);
  });

  it("never confirms an order just because the customer submitted a reference", async () => {
    const { c, order } = await upiOrder();
    const bad = await c.post(`/api/v1/orders/${order.id}/upi-reference`, { utr: "12345" });
    expect(bad.status).toBe(400);
    const ref = utr();
    const r = await c.post(`/api/v1/orders/${order.id}/upi-reference`, { utr: ref });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.order.status).toBe("PENDING");
    expect(r.body.order.paymentStatus).toBe("VERIFYING");
    expect(r.body.upi.status).toBe("VERIFYING");
    expect(r.body.upi.link).toBeNull();
    const stored = await orderDoc(order.id);
    expect(stored.status).toBe("PENDING");
    expect(stored.confirmedAt ?? null).toBeNull();
    // Submitting again while staff check is refused, and Razorpay verification can't be used for it.
    expect((await c.post(`/api/v1/orders/${order.id}/upi-reference`, { utr: utr() })).status).toBe(409);
    expect((await c.post("/api/v1/payments/razorpay/verify", { orderId: order.id, razorpay_order_id: "order_x", razorpay_payment_id: "pay_x", razorpay_signature: "f".repeat(64) })).status).toBeGreaterThanOrEqual(400);
    // The same UPI reference can't be claimed for another order.
    const other = await upiOrder("gulab-jamun", 1);
    const reuse = await other.c.post(`/api/v1/orders/${other.order.id}/upi-reference`, { utr: ref });
    expect(reuse.status).toBe(409);
    expect(reuse.body.error.code).toBe("UPI_REFERENCE_USED");
    await settle();
  });

  it("lets only staff with payments.verify confirm the payment, which confirms the order", async () => {
    const { c, order } = await upiOrder();
    const ref = utr();
    await c.post(`/api/v1/orders/${order.id}/upi-reference`, { utr: ref });
    expect((await c.post(`/api/v1/admin/orders/${order.id}/upi/verify`, { decision: "RECEIVED" })).status).toBe(403); // customers can't
    const packing = await loginAs("packing@naamdevsweets.local");
    expect((await packing.post(`/api/v1/admin/orders/${order.id}/upi/verify`, { decision: "RECEIVED" })).status).toBe(403);
    const manager = await loginAs("orders@naamdevsweets.local");
    const pending = await manager.get("/api/v1/admin/orders/upi/pending");
    expect(pending.body.items.some((x: { orderId: string; reference: string }) => x.orderId === order.id && x.reference === ref)).toBe(true);
    const ok = await manager.post(`/api/v1/admin/orders/${order.id}/upi/verify`, { decision: "RECEIVED", note: "Seen in Paytm Business" });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.order).toMatchObject({ status: "CONFIRMED", paymentStatus: "PAID" });
    const stored = await orderDoc(order.id);
    expect(stored.history.at(-1)?.note).toMatch(/UPI payment verified by/);
    const payments = await getDocs<Payment>(db.collection(C.payments).where("orderId", "==", order.id));
    expect(payments.find((p) => p.status === "CAPTURED")).toMatchObject({ method: "UPI", gatewayPaymentId: ref });
    // Deciding twice is refused.
    expect((await manager.post(`/api/v1/admin/orders/${order.id}/upi/verify`, { decision: "RECEIVED" })).status).toBe(400);
    await settle();
  });

  it("a reference staff can't find goes back to the customer to correct", async () => {
    const { c, order } = await upiOrder();
    await c.post(`/api/v1/orders/${order.id}/upi-reference`, { utr: utr() });
    const manager = await loginAs("manager@naamdevsweets.local");
    const r = await manager.post(`/api/v1/admin/orders/${order.id}/upi/verify`, { decision: "NOT_FOUND", note: "No credit at that time" });
    expect(r.body.order).toMatchObject({ status: "PENDING", paymentStatus: "PENDING" });
    const view = await c.get(`/api/v1/orders/${order.id}`);
    expect(view.body.upi.status).toBe("AWAITING_PAYMENT");
    expect(view.body.upi.lastRejection).toMatch(/Not found/);
    const again = await c.post(`/api/v1/orders/${order.id}/upi-reference`, { utr: utr() });
    expect(again.body.order.paymentStatus).toBe("VERIFYING");
    await settle();
  });

  it("expires unpaid UPI orders but keeps those being verified", async () => {
    const { expireUnpaidOrders } = await import("../src/modules/orders/service");
    const unpaid = await upiOrder();
    const verifying = await upiOrder("gulab-jamun", 1);
    await verifying.c.post(`/api/v1/orders/${verifying.order.id}/upi-reference`, { utr: utr() });
    const past = new Date(Date.now() - 60_000);
    await db.collection(C.orders).doc(unpaid.order.id).update({ reservationExpiresAt: past });
    await db.collection(C.orders).doc(verifying.order.id).update({ reservationExpiresAt: past });
    const before = await inventoryOf(unpaid.variant.id);
    await expireUnpaidOrders();
    expect((await orderDoc(unpaid.order.id)).status).toBe("CANCELLED");
    expect((await inventoryOf(unpaid.variant.id)).available).toBe(before.available + 1);
    expect((await orderDoc(verifying.order.id))).toMatchObject({ status: "PENDING", paymentStatus: "VERIFYING" });
    await settle();
  });

  it("cancelling a paid UPI order creates a refund staff must send and record", async () => {
    const { c, order } = await upiOrder();
    await c.post(`/api/v1/orders/${order.id}/upi-reference`, { utr: utr() });
    const manager = await loginAs("manager@naamdevsweets.local");
    await manager.post(`/api/v1/admin/orders/${order.id}/upi/verify`, { decision: "RECEIVED" });
    const cancel = await c.post(`/api/v1/orders/${order.id}/cancel`, { reason: "Ordered by mistake" });
    expect(cancel.status, JSON.stringify(cancel.body)).toBe(200);
    await settle();
    const [refund] = await getDocs<Refund>(db.collection(C.refunds).where("orderId", "==", order.id));
    // Not marked as refunded until staff actually send the money back.
    expect(refund).toMatchObject({ method: "MANUAL", status: "PENDING", amountPaise: order.totals.totalPaise });
    expect((await orderDoc(order.id)).paymentStatus).toBe("PAID");
    expect((await manager.post(`/api/v1/admin/orders/refunds/${refund!.id}/complete`, { reference: "UPI 498765432109" })).status).toBe(200);
    const final = await orderDoc(order.id);
    expect(final).toMatchObject({ status: "REFUNDED", paymentStatus: "REFUNDED", refundedPaise: order.totals.totalPaise });
    await settle();
  });

  it("shop UPI details are editable by admins and validated", async () => {
    const admin = await loginAs("admin@naamdevsweets.local");
    const cur = (await admin.get("/api/v1/admin/settings")).body.settings.upi;
    expect(cur).toMatchObject({ enabled: true, vpa: "paytmqr6rgzn2@ptys", payeeName: "RAKESH TAILOR" });
    expect((await admin.put("/api/v1/admin/settings/upi", { ...cur, vpa: "not a upi id" })).status).toBe(400);
    const off = await admin.put("/api/v1/admin/settings/upi", { ...cur, enabled: false });
    expect(off.body.value.enabled).toBe(false);
    await admin.put("/api/v1/admin/settings/upi", cur);
  });
});
