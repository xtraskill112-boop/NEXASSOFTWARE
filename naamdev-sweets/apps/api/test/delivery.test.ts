import { describe, expect, it } from "vitest";
import { C, db, getDocs, type PartnerEarning } from "@naamdev/db";
import { addAddress, Client, CUSTOMER_PASSWORD, firebaseSignUp, inventoryOf, loginAs, newCustomer, orderDoc, placeCodOrder, productBySlug, settle, uniqueEmail, uniquePhone, userDoc, variantBySlug } from "./helpers";

describe("order lifecycle & delivery partner flow", () => {
  it("moves an order from kitchen to doorstep with OTP verification, earnings and loyalty", async () => {
    const { c, user } = await newCustomer("Doorstep");
    const addressId = await addAddress(c);
    const v = await variantBySlug("kaju-katli", 2);
    await c.post("/api/v1/cart/items", { variantId: v.id, quantity: 1 });
    const placed = await placeCodOrder(c, addressId);
    const orderId = placed.body.order.id as string;
    const pointsBefore = (await userDoc(user.id)).loyaltyPoints;

    const rider = await loginAs("rider@naamdevsweets.local", "delivery");
    expect((await rider.post("/api/v1/delivery/status", { online: true })).body.isOnline).toBe(true);
    await rider.post("/api/v1/delivery/location", { lat: 26.912, lng: 75.79 });

    // Packing staff can run kitchen stages but cannot cancel or dispatch.
    const packing = await loginAs("packing@naamdevsweets.local");
    expect((await packing.post(`/api/v1/admin/orders/${orderId}/status`, { status: "PREPARING" })).status).toBe(200);
    expect((await packing.post(`/api/v1/admin/orders/${orderId}/status`, { status: "CANCELLED", note: "x" })).status).toBe(403);
    expect((await packing.post(`/api/v1/admin/orders/${orderId}/status`, { status: "DELIVERED" })).status).toBe(403);
    // Invalid jump is refused by the state machine.
    const manager = await loginAs("orders@naamdevsweets.local");
    expect((await manager.post(`/api/v1/admin/orders/${orderId}/status`, { status: "OUT_FOR_DELIVERY" })).status).toBe(409);
    expect((await packing.post(`/api/v1/admin/orders/${orderId}/status`, { status: "PACKED" })).status).toBe(200);
    await settle();

    // Packing triggers an automatic offer to the nearest online partner.
    const offers = await rider.get("/api/v1/delivery/offers");
    const offer = offers.body.offers.find((o: { orderId: string }) => o.orderId === orderId);
    expect(offer).toBeTruthy();
    expect(offer.customer).toBeNull(); // customer details hidden until accepted
    const accepted = await rider.post(`/api/v1/delivery/assignments/${offer.assignmentId}/accept`);
    expect(accepted.body.assignment.customer.phone).toBeTruthy();

    const reservedBefore = (await inventoryOf(v.id)).reserved;
    expect((await rider.post(`/api/v1/delivery/assignments/${offer.assignmentId}/pickup`)).status).toBe(200);
    expect((await orderDoc(orderId)).status).toBe("DISPATCHED");
    expect((await inventoryOf(v.id)).reserved).toBe(reservedBefore - 1);

    // Customer now sees the delivery OTP and live tracking.
    const detail = await c.get(`/api/v1/orders/${orderId}`);
    const otp = detail.body.order.deliveryOtp as string;
    expect(otp).toMatch(/^\d{4}$/);
    await rider.post("/api/v1/delivery/location", { lat: 26.908, lng: 75.8 });
    const tracking = await c.get(`/api/v1/orders/${orderId}/tracking`);
    expect(tracking.body.tracking.partnerLocation).not.toBeNull();
    expect(tracking.body.tracking.path.length).toBeGreaterThan(0);

    await rider.post(`/api/v1/delivery/assignments/${offer.assignmentId}/start`);
    const wrong = await rider.post(`/api/v1/delivery/assignments/${offer.assignmentId}/deliver`, { otp: otp === "0000" ? "1111" : "0000", codCollected: true });
    expect(wrong.status).toBe(400);
    const noCash = await rider.post(`/api/v1/delivery/assignments/${offer.assignmentId}/deliver`, { otp });
    expect(noCash.body.error.code).toBe("COD_NOT_COLLECTED");
    const done = await rider.post(`/api/v1/delivery/assignments/${offer.assignmentId}/deliver`, { otp, codCollected: true });
    expect(done.status).toBe(200);

    const final = await orderDoc(orderId);
    expect(final.status).toBe("DELIVERED");
    expect(final.paymentStatus).toBe("COD_COLLECTED");
    expect(final.pointsEarned).toBeGreaterThan(0);
    expect((await userDoc(user.id)).loyaltyPoints).toBe(pointsBefore + final.pointsEarned);
    const earnings = await getDocs<PartnerEarning>(db.collection(C.earnings).where("assignmentId", "==", offer.assignmentId));
    expect(earnings[0]?.amountPaise).toBeGreaterThan(0);
    expect(final.history.map((h) => h.toStatus)).toEqual(["PENDING", "CONFIRMED", "PREPARING", "PACKED", "READY_FOR_PICKUP", "DISPATCHED", "OUT_FOR_DELIVERY", "DELIVERED"]);

    // Verified buyer can now review; review appears after moderation.
    const rev = await c.post("/api/v1/reviews", { productId: (await productBySlug("kaju-katli")).id, rating: 5, title: "Superb", body: "Fresh and not too sweet." });
    expect(rev.status).toBe(201);
    const support = await loginAs("support@naamdevsweets.local");
    expect((await support.post(`/api/v1/admin/people/reviews/${rev.body.review.id}/moderate`, { status: "APPROVED" })).status).toBe(200);
    const kk = await productBySlug("kaju-katli");
    expect(kk.reviewCount).toBeGreaterThan(0);

    await rider.post("/api/v1/delivery/status", { online: false });
    await settle();
  });

  it("only allows verified buyers to review", async () => {
    const { c } = await newCustomer();
    const p = await productBySlug("jalebi");
    const r = await c.post("/api/v1/reviews", { productId: p.id, rating: 4 });
    expect(r.status).toBe(400);
  });

  it("does not let pending partners go online", async () => {
    const pending = await loginAs("rider2@naamdevsweets.local", "delivery");
    const r = await pending.post("/api/v1/delivery/status", { online: true });
    expect(r.status).toBe(403);
  });

  it("registers a new partner who starts as pending verification", async () => {
    const c = new Client("delivery");
    c.token = (await firebaseSignUp(uniqueEmail("rider"), CUSTOMER_PASSWORD)).idToken;
    const r = await c.post("/api/v1/delivery/register", { name: "New Rider", phone: uniquePhone(), city: "Jaipur", vehicleType: "SCOOTER", vehicleNumber: "RJ14 XY 1234" });
    expect(r.status).toBe(201);
    expect(r.body.user.role.key).toBe("DELIVERY_PARTNER");
    // A storefront account can't be turned into a partner account.
    const { c: shopper } = await newCustomer("Shopper");
    shopper.appName = "delivery";
    expect((await shopper.post("/api/v1/delivery/register", { name: "Nope", phone: uniquePhone(), city: "Jaipur", vehicleType: "MOTORCYCLE" })).status).toBe(409);
    const me = await c.get("/api/v1/delivery/me");
    expect(me.body.partner.status).toBe("PENDING");
    expect(me.body.partner.missingDocuments).toContain("AADHAAR");
    await settle();
  });
});
