import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@naamdev/db";
import { addAddress, client, inventoryOf, newCustomer, placeCodOrder, settle, variantBySlug } from "./helpers";

describe("cart", () => {
  it("keeps a guest cart and merges it into the user's cart on login", async () => {
    const { phone } = await newCustomer("Merger");
    const guest = await client();
    const v = await variantBySlug("besan-laddu", 1);
    const add = await guest.post("/api/v1/cart/items", { variantId: v.id, quantity: 2 });
    expect(add.status).toBe(201);
    expect(add.body.cart.items[0].quantity).toBe(2);
    // Persistence across "refresh"
    const again = await guest.get("/api/v1/cart");
    expect(again.body.cart.items).toHaveLength(1);
    const login = await guest.post("/api/v1/auth/login", { identifier: phone, password: "Sweets@2026" });
    expect(login.status).toBe(200);
    const merged = await guest.get("/api/v1/cart");
    expect(merged.body.cart.items[0].variant.id).toBe(v.id);
    expect(merged.body.cart.items[0].quantity).toBe(2);
  });

  it("changes variants and recalculates totals on the server", async () => {
    const { c } = await newCustomer();
    const small = await variantBySlug("kaju-katli", 0);
    const big = await variantBySlug("kaju-katli", 2);
    const r = await c.post("/api/v1/cart/items", { variantId: small.id, quantity: 1 });
    const itemId = r.body.cart.items[0].id;
    const before = r.body.cart.pricing.subtotalPaise;
    const u = await c.patch(`/api/v1/cart/items/${itemId}`, { variantId: big.id });
    expect(u.body.cart.items[0].variant.id).toBe(big.id);
    expect(u.body.cart.pricing.subtotalPaise).toBeGreaterThan(before);
    expect(u.body.cart.pricing.subtotalPaise).toBe(big.salePricePaise ?? big.mrpPaise);
  });

  it("supports save-for-later and blocks quantities above stock", async () => {
    const { c } = await newCustomer();
    const v = await variantBySlug("rasmalai", 2);
    const inv = await inventoryOf(v.id);
    const r = await c.post("/api/v1/cart/items", { variantId: v.id, quantity: 1 });
    const id = r.body.cart.items[0].id;
    const saved = await c.patch(`/api/v1/cart/items/${id}`, { savedForLater: true });
    expect(saved.body.cart.items).toHaveLength(0);
    expect(saved.body.cart.savedItems).toHaveLength(1);
    const back = await c.patch(`/api/v1/cart/items/${id}`, { savedForLater: false });
    expect(back.body.cart.items).toHaveLength(1);
    const tooMany = await c.patch(`/api/v1/cart/items/${id}`, { quantity: inv.available + 1 });
    expect(tooMany.status).toBe(409);
  });

  it("validates coupons with clear reasons", async () => {
    const { c } = await newCustomer();
    const v = await variantBySlug("soan-papdi", 0);
    await c.post("/api/v1/cart/items", { variantId: v.id, quantity: 1 });
    const min = await c.post("/api/v1/cart/coupon", { code: "WELCOME100" });
    expect(min.status).toBe(400);
    expect(min.body.error.message).toMatch(/Add items worth/);
    const bogus = await c.post("/api/v1/cart/coupon", { code: "NOPE123" });
    expect(bogus.status).toBe(400);
  });

  it("enforces the minimum order value", async () => {
    const { c } = await newCustomer();
    const v = await variantBySlug("mishti-doi", 0); // ₹80 < ₹199 minimum
    const r = await c.post("/api/v1/cart/items", { variantId: v.id, quantity: 1 });
    expect(r.body.cart.canCheckout).toBe(false);
    expect(r.body.cart.pricing.meetsMinimumOrder).toBe(false);
  });
});

describe("checkout & orders (COD)", () => {
  it("places a COD order with server-side totals, reserves stock FEFO, applies first-order coupon", async () => {
    const { c, user } = await newCustomer("First Order");
    const addressId = await addAddress(c);
    const v = await variantBySlug("kaju-katli", 1);
    const invBefore = await inventoryOf(v.id);
    const oldest = await prisma.inventoryBatch.findFirstOrThrow({ where: { variantId: v.id, status: "ACTIVE", remaining: { gt: 0 } }, orderBy: { expiresAt: "asc" } });

    await c.post("/api/v1/cart/items", { variantId: v.id, quantity: 2 });
    const coupon = await c.post("/api/v1/cart/coupon", { code: "WELCOME100" });
    expect(coupon.status).toBe(200);
    const quote = await c.post("/api/v1/checkout/quote", { addressId });
    expect(quote.body.quote.pricing.couponDiscountPaise).toBe(10000);
    expect(quote.body.quote.paymentOptions.cod.available).toBe(true);

    // A tampered client total is irrelevant — the server never accepts prices from the client.
    const r = await placeCodOrder(c, addressId, { totalPaise: 1, subtotalPaise: 1 });
    expect(r.status).toBe(201);
    const order = r.body.order;
    expect(order.status).toBe("CONFIRMED");
    expect(order.paymentStatus).toBe("COD_PENDING");
    const unit = v.salePricePaise ?? v.mrpPaise;
    expect(order.totals.subtotalPaise).toBe(unit * 2);
    expect(order.totals.couponDiscountPaise).toBe(10000);
    expect(order.totals.totalPaise).toBe(quote.body.quote.pricing.totalPaise);
    expect(order.orderNumber).toMatch(/^ND\d{6}-\d{4}$/);
    expect(order.invoiceNumber).toMatch(/^NDS\/\d{4}-\d{2}\/\d{6}$/);

    const invAfter = await inventoryOf(v.id);
    expect(invAfter.available).toBe(invBefore.available - 2);
    expect(invAfter.reserved).toBe(invBefore.reserved + 2);
    const alloc = await prisma.orderItemAllocation.findMany({ where: { orderItem: { orderId: order.id } } });
    expect(alloc[0]!.batchId).toBe(oldest.id);

    const cart = await c.get("/api/v1/cart");
    expect(cart.body.cart.items).toHaveLength(0);
    const usage = await prisma.couponUsage.findUnique({ where: { orderId: order.id } });
    expect(usage?.userId).toBe(user.id);

    // First-order coupon can't be reused.
    await c.post("/api/v1/cart/items", { variantId: v.id, quantity: 2 });
    const reuse = await c.post("/api/v1/cart/coupon", { code: "WELCOME100" });
    expect(reuse.status).toBe(400);
  });

  it("is idempotent: retrying with the same key returns the same order", async () => {
    const { c } = await newCustomer();
    const addressId = await addAddress(c);
    const v = await variantBySlug("motichoor-laddu", 1);
    await c.post("/api/v1/cart/items", { variantId: v.id, quantity: 1 });
    const key = randomUUID();
    const [a, b] = await Promise.all([
      c.post("/api/v1/checkout/place-order", { addressId, paymentMethod: "COD", idempotencyKey: key }),
      c.post("/api/v1/checkout/place-order", { addressId, paymentMethod: "COD", idempotencyKey: key }),
    ]);
    const ids = [a, b].filter((x) => x.status < 300).map((x) => x.body.order.id);
    expect(new Set(ids).size).toBe(1);
    expect(await prisma.order.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it("prevents ordering more than available stock", async () => {
    const { c } = await newCustomer();
    const addressId = await addAddress(c);
    const v = await variantBySlug("wedding-shagun-box", 2);
    const inv = await inventoryOf(v.id);
    await c.post("/api/v1/cart/items", { variantId: v.id, quantity: inv.available });
    // Someone else buys the stock first
    await prisma.inventory.update({ where: { variantId: v.id }, data: { available: { decrement: 1 } } });
    const r = await placeCodOrder(c, addressId);
    expect(r.status).toBe(409);
    await prisma.inventory.update({ where: { variantId: v.id }, data: { available: { increment: 1 } } });
    expect((await inventoryOf(v.id)).available).toBe(inv.available);
  });

  it("refuses delivery to non-serviceable pincodes", async () => {
    const { c } = await newCustomer();
    const addressId = await addAddress(c, "560001");
    const v = await variantBySlug("kaju-katli", 1);
    await c.post("/api/v1/cart/items", { variantId: v.id, quantity: 1 });
    const r = await placeCodOrder(c, addressId);
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/don't deliver/);
  });

  it("lets a customer cancel early, restoring stock, coupon usage and points", async () => {
    const { c } = await newCustomer();
    const addressId = await addAddress(c);
    const v = await variantBySlug("kesar-pista-barfi", 2);
    const before = await inventoryOf(v.id);
    await c.post("/api/v1/cart/items", { variantId: v.id, quantity: 1 });
    await c.post("/api/v1/cart/coupon", { code: "WELCOME100" });
    const r = await placeCodOrder(c, addressId);
    expect(r.status).toBe(201);
    const coupon = await prisma.coupon.findUniqueOrThrow({ where: { code: "WELCOME100" } });
    const cancel = await c.post(`/api/v1/orders/${r.body.order.id}/cancel`, { reason: "Ordered by mistake" });
    expect(cancel.status).toBe(200);
    expect(cancel.body.order.status).toBe("CANCELLED");
    expect(await inventoryOf(v.id)).toMatchObject({ available: before.available, reserved: before.reserved });
    expect((await prisma.coupon.findUniqueOrThrow({ where: { code: "WELCOME100" } })).usedCount).toBe(coupon.usedCount - 1);
    expect(await prisma.couponUsage.findUnique({ where: { orderId: r.body.order.id } })).toBeNull();
    await settle();
  });

  it("redeems loyalty points at checkout within limits", async () => {
    const { c, user } = await newCustomer();
    await prisma.user.update({ where: { id: user.id }, data: { loyaltyPoints: 1000 } });
    const addressId = await addAddress(c);
    const v = await variantBySlug("royal-celebration-hamper", 0);
    await c.post("/api/v1/cart/items", { variantId: v.id, quantity: 1 });
    const q = await c.post("/api/v1/checkout/quote", { addressId, redeemPoints: 1000 });
    const pricing = q.body.quote.pricing;
    expect(pricing.pointsRedeemed).toBeGreaterThan(0);
    expect(pricing.loyaltyDiscountPaise).toBeLessThanOrEqual(Math.floor(pricing.subtotalPaise * 0.2));
    const r = await placeCodOrder(c, addressId, { redeemPoints: 1000 });
    expect(r.status).toBe(201);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(u.loyaltyPoints).toBe(1000 - pricing.pointsRedeemed);
  });

  it("reorders a past order into the cart", async () => {
    const { c } = await newCustomer();
    const addressId = await addAddress(c);
    const v = await variantBySlug("gulab-jamun", 1);
    await c.post("/api/v1/cart/items", { variantId: v.id, quantity: 1 });
    const o = await placeCodOrder(c, addressId);
    const r = await c.post(`/api/v1/orders/${o.body.order.id}/reorder`);
    expect(r.body.added).toContain("Gulab Jamun");
    const cart = await c.get("/api/v1/cart");
    expect(cart.body.cart.items[0].variant.id).toBe(v.id);
  });
});
