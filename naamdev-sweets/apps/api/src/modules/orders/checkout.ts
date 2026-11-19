import {
  C, db, getDoc, getDocs, newId, orderSearchText, SUB,
  type Address, type Cart, type Coupon, type CouponUsage, type DeliveryZone, type Order, type OrderItem, type Payment, type User, type WithId,
} from "@naamdev/db";
import { numericCode } from "../../lib/crypto";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { nextOrderNumber } from "../../lib/counters";
import { live } from "../../lib/live";
import { logger } from "../../lib/logger";
import { getSetting } from "../../lib/settings";
import { integrations, env } from "../../config/env";
import { buildCartView } from "../cart/service";
import { catalog } from "../catalog/cache";
import { defaultStore } from "../catalog/service";
import { awardPoints } from "../loyalty/service";
import { OutOfStockError, reserveStock } from "../inventory/service";
import { razorpay } from "../payments/razorpay";
import { applyTransition, cancelOrder, orderRef, runEffects, withOrderTx } from "./service";
import { upiOption, upiPaymentData } from "./upi";

async function addressAndZone(userId: string, addressId?: string) {
  if (!addressId) return { address: null, zone: null };
  const address = await getDoc<Address>(db.collection(C.users).doc(userId).collection(SUB.addresses).doc(addressId));
  if (!address || address.deletedAt) throw notFound("Address");
  const zone = await getDoc<DeliveryZone>(db.collection(C.zones).doc(address.pincode));
  return { address, zone };
}

const userCartRef = (userId: string) => db.collection(C.carts).doc(`u_${userId}`);

export async function quote(userId: string, input: { addressId?: string; couponCode?: string | null; redeemPoints?: number }) {
  const cart = await getDoc<Cart>(userCartRef(userId));
  const { address, zone } = await addressAndZone(userId, input.addressId);
  const [delivery, checkout] = await Promise.all([getSetting("delivery"), getSetting("checkout")]);
  const view = await buildCartView(cart, userId, {
    couponCode: input.couponCode === undefined ? undefined : input.couponCode,
    redeemPoints: input.redeemPoints,
    zoneDeliveryFeePaise: zone?.isActive ? zone.deliveryFeePaise : null,
  });
  const blockers = [...view.blockers];
  const serviceable = !address || !!zone?.isActive || !delivery.restrictToZones;
  if (address && !serviceable) blockers.push(`Sorry, we don't deliver to PIN code ${address.pincode} yet.`);
  const total = view.pricing.totalPaise;
  const upi = await upiOption();
  const paymentOptions = {
    upi,
    online: { available: integrations.razorpay && checkout.onlinePaymentsEnabled, reason: integrations.razorpay ? (checkout.onlinePaymentsEnabled ? null : "Online payments are temporarily disabled") : "Online payments are not configured" },
    cod: { available: checkout.codEnabled && total <= checkout.codMaxOrderPaise, reason: !checkout.codEnabled ? "Cash on delivery is currently unavailable" : total > checkout.codMaxOrderPaise ? `COD is available for orders up to ₹${checkout.codMaxOrderPaise / 100}` : null },
  };
  const etaMinutes = (zone?.etaMinutes ?? 60) + checkout.preparationMinutes;
  return { ...view, blockers, canCheckout: blockers.length === 0, address, zone, serviceable, paymentOptions, etaMinutes };
}

const orderKeyRef = (userId: string, key: string) => db.collection(C.orderKeys).doc(`${userId}__${key}`);

async function onlinePayment(orderId: string) {
  const pays = await getDocs<Payment>(db.collection(C.payments).where("orderId", "==", orderId));
  return pays.filter((p) => p.method === "ONLINE").sort((a, b) => +b.createdAt - +a.createdAt)[0] ?? null;
}

export async function placeOrder(
  userId: string,
  input: { addressId: string; paymentMethod: "ONLINE" | "UPI" | "COD"; idempotencyKey: string; couponCode?: string | null; redeemPoints?: number; customerNote?: string | null },
) {
  // Retries with the same key return the original order (no second order, no second charge).
  const known = (await orderKeyRef(userId, input.idempotencyKey).get()).data();
  if (known) {
    const existing = await getDoc<Order>(orderRef(known.orderId as string));
    if (existing) return { order: existing, duplicate: true, payment: await onlinePayment(existing.id) };
  }

  const q = await quote(userId, input);
  if (!q.canCheckout) throw conflict(q.blockers[0] ?? "Your cart can't be checked out yet.", { blockers: q.blockers }, "CHECKOUT_BLOCKED");
  const ev = q.pricing.coupon?.evaluation;
  if (input.couponCode && ev && !ev.valid) throw badRequest(ev.message, { reason: ev.reason }, "COUPON_INVALID");
  const pay = input.paymentMethod === "ONLINE" ? q.paymentOptions.online : input.paymentMethod === "UPI" ? q.paymentOptions.upi : q.paymentOptions.cod;
  if (!pay.available) throw badRequest(pay.reason ?? "This payment method is unavailable.", undefined, "PAYMENT_METHOD_UNAVAILABLE");

  const [checkout, store, upiSettings] = await Promise.all([getSetting("checkout"), defaultStore(), getSetting("upi")]);
  const address = q.address!;
  const couponCode = q.couponCode && ev?.valid ? q.couponCode.toUpperCase() : null;
  const pricing = q.pricing;

  let created: { result: { order: WithId<Order>; duplicate: boolean }; effects: Parameters<typeof runEffects>[0] };
  try {
    created = await withOrderTx(async (ctx) => {
      const { tx } = ctx;
      // The idempotency document is read inside the transaction: a double-submit racing this one
      // will either see it or conflict and retry, so only one order is ever created.
      const key = (await tx.get(orderKeyRef(userId, input.idempotencyKey))).data();
      if (key) return { order: await ctx.lock(key.orderId as string), duplicate: true };

      const [user, cart] = await Promise.all([getDoc<User>(db.collection(C.users).doc(userId), tx), getDoc<Cart>(userCartRef(userId), tx)]);
      if (!user) throw notFound("Account");
      let coupon: WithId<Coupon> | null = null;
      if (couponCode) {
        coupon = await getDoc<Coupon>(db.collection(C.coupons).doc(couponCode), tx);
        if (!coupon || !coupon.isActive) throw badRequest("This coupon is no longer available.", undefined, "COUPON_INVALID");
        const used = await getDocs<CouponUsage>(db.collection(C.couponUsages).where("userId", "==", userId).where("couponCode", "==", couponCode), tx);
        if (used.length >= coupon.perUserLimit) throw badRequest("You have already used this coupon.", undefined, "COUPON_INVALID");
        if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) throw badRequest("This coupon has just reached its usage limit.", undefined, "COUPON_INVALID");
        tx.update(db.collection(C.coupons).doc(couponCode), { usedCount: coupon.usedCount + 1, updatedAt: new Date() });
      }

      const orderNumber = await nextOrderNumber(tx);
      const id = newId();
      const now = new Date();
      const snap = await catalog();
      const items: OrderItem[] = pricing.lines.map((l) => {
        const item = q.items.find((i) => i.variant.id === l.variantId)!;
        return {
          id: newId(), productId: l.productId, variantId: l.variantId, productName: item.product.name, variantLabel: item.variant.label,
          sku: item.variant.sku, imageUrl: item.product.image, unitMrpPaise: l.unitMrpPaise, unitPricePaise: l.unitPricePaise,
          quantity: l.quantity, lineTotalPaise: l.lineTotalPaise, discountPaise: l.discountPaise, gstRate: l.gstRate, taxPaise: l.taxPaise,
          categoryId: snap.byId.get(l.productId)?.categoryId ?? "", allocations: [],
        };
      });
      const allocations = await reserveStock(ctx.stock, id, items.map((i) => ({ orderItemId: i.id, variantId: i.variantId, quantity: i.quantity })));
      for (const i of items) i.allocations = allocations.get(i.id) ?? [];

      const order: WithId<Order> = {
        id,
        orderNumber,
        userId,
        storeId: store?.id ?? null,
        status: "PENDING",
        paymentMethod: input.paymentMethod,
        paymentStatus: input.paymentMethod === "COD" ? "COD_PENDING" : "PENDING",
        mrpTotalPaise: pricing.mrpTotalPaise,
        subtotalPaise: pricing.subtotalPaise,
        itemDiscountPaise: pricing.itemDiscountPaise,
        couponDiscountPaise: pricing.couponDiscountPaise,
        loyaltyDiscountPaise: pricing.loyaltyDiscountPaise,
        deliveryFeePaise: pricing.deliveryFeePaise,
        taxPaise: pricing.taxPaise,
        totalPaise: pricing.totalPaise,
        refundedPaise: 0,
        couponId: coupon?.id ?? null,
        couponCode: coupon?.code ?? null,
        pointsRedeemed: pricing.pointsRedeemed,
        pointsEarned: 0,
        addressSnapshot: {
          type: address.type, label: address.label, fullName: address.fullName, phone: address.phone, line1: address.line1,
          line2: address.line2, landmark: address.landmark, city: address.city, state: address.state, pincode: address.pincode,
        },
        customerName: address.fullName || user.name,
        customerPhone: address.phone,
        customerEmail: user.email,
        deliveryPincode: address.pincode,
        deliveryLat: address.lat,
        deliveryLng: address.lng,
        deliveryInstructions: address.instructions,
        customerNote: input.customerNote ?? null,
        deliveryOtp: numericCode(4),
        estimatedDeliveryAt: new Date(now.getTime() + q.etaMinutes * 60_000),
        reservationExpiresAt:
          input.paymentMethod === "ONLINE" ? new Date(now.getTime() + checkout.reservationMinutes * 60_000)
          : input.paymentMethod === "UPI" ? new Date(now.getTime() + upiSettings.payWithinMinutes * 60_000)
          : null,
        idempotencyKey: input.idempotencyKey,
        invoiceNumber: null,
        cancelReason: null,
        cancelledBy: null,
        items,
        history: [{ id: newId(), fromStatus: null, toStatus: "PENDING", note: "Order placed", actorType: "CUSTOMER", changedById: userId, changedByName: user.name, createdAt: now }],
        notes: [],
        productIds: [...new Set(items.map((i) => i.productId))],
        partnerId: null,
        searchText: "",
        placedAt: now,
        confirmedAt: null,
        dispatchedAt: null,
        deliveredAt: null,
        cancelledAt: null,
        createdAt: now,
        updatedAt: now,
      };
      order.searchText = orderSearchText(order);
      ctx.save(order);
      tx.set(orderKeyRef(userId, input.idempotencyKey), { orderId: id, createdAt: now });

      if (coupon)
        tx.set(db.collection(C.couponUsages).doc(id), { couponId: coupon.id, couponCode: coupon.code, userId, orderId: id, discountPaise: pricing.couponDiscountPaise, createdAt: now });
      if (pricing.pointsRedeemed > 0) {
        try {
          awardPoints(tx, user, -pricing.pointsRedeemed, "REDEEM", `Redeemed on order ${orderNumber}`, id);
        } catch {
          throw badRequest("Your Mithaas points balance changed. Please review your order.", undefined, "POINTS_CHANGED");
        }
      }
      if (cart) {
        const bought = new Set(items.map((i) => i.variantId));
        tx.set(userCartRef(userId), { ...cart, id: undefined, items: cart.items.filter((i) => i.savedForLater || !bought.has(i.variantId)), couponCode: null, updatedAt: now });
      }
      ctx.effects.push({ kind: "run", fn: () => live.order(id, { userId, partnerId: null, status: order.status, event: "created" }) });

      if (input.paymentMethod === "COD") {
        tx.set(db.collection(C.payments).doc(), {
          orderId: id, userId, method: "COD", provider: "cod", status: "CREATED", amountPaise: order.totalPaise, currency: "INR", gatewayOrderId: null,
          gatewayPaymentId: null, methodDetail: null, failureReason: null, raw: null, capturedAt: null, createdAt: now, updatedAt: now,
        } satisfies Payment);
        await applyTransition(ctx, order, "CONFIRMED", { type: "SYSTEM" }, "Cash on delivery order confirmed");
      } else if (input.paymentMethod === "UPI") {
        // Stays PENDING until staff confirm the money reached the shop's UPI account.
        tx.set(db.collection(C.payments).doc(), upiPaymentData(order, id, now));
      }
      return { order, duplicate: false };
    });
  } catch (err) {
    if (err instanceof OutOfStockError) {
      const hit = (await catalog()).variants.get(err.variantId);
      throw conflict(
        `${hit?.product.name ?? "An item"} (${hit?.variant.label ?? ""}) ${err.available > 0 ? `has only ${err.available} left` : "just went out of stock"}. Please update your cart.`,
        { variantId: err.variantId, available: err.available },
        "OUT_OF_STOCK",
      );
    }
    throw err;
  }

  const { order, duplicate } = created.result;
  if (duplicate) return { order, duplicate: true, payment: await onlinePayment(order.id) };
  await runEffects(created.effects);
  let payment: WithId<Payment> | null = null;
  if (input.paymentMethod === "ONLINE" && order.status === "PENDING") {
    try {
      const rzp = await razorpay.createOrder(order.totalPaise, order.orderNumber, { orderId: order.id, orderNumber: order.orderNumber });
      const now = new Date();
      const data: Payment = {
        orderId: order.id, userId, method: "ONLINE", provider: "razorpay", status: "CREATED", amountPaise: order.totalPaise, currency: "INR",
        gatewayOrderId: rzp.id, gatewayPaymentId: null, methodDetail: null, failureReason: null, raw: rzp as object, capturedAt: null, createdAt: now, updatedAt: now,
      };
      const ref = await db.collection(C.payments).add(data);
      payment = { ...data, id: ref.id };
    } catch (err) {
      logger.error({ err, orderId: order.id }, "razorpay order creation failed — rolling back reservation");
      await cancelOrder(order.id, { type: "SYSTEM" }, "Payment could not be initiated");
      throw err;
    }
  }
  return { order, duplicate: false, payment };
}

/** Razorpay Checkout options for an order that is awaiting payment. */
export async function paymentSession(userId: string, orderId: string) {
  const order = await getDoc<Order>(orderRef(orderId));
  if (!order || order.userId !== userId) throw notFound("Order");
  if (order.status !== "PENDING" || order.paymentMethod !== "ONLINE" || order.paymentStatus === "PAID")
    throw badRequest("This order is not awaiting payment.");
  if (order.reservationExpiresAt && order.reservationExpiresAt < new Date()) throw badRequest("The payment window for this order has expired.");
  const payment = await onlinePayment(order.id);
  if (!payment?.gatewayOrderId) throw badRequest("Payment was not initiated for this order.");
  const user = await getDoc<User>(db.collection(C.users).doc(userId));
  return {
    keyId: env.RAZORPAY_KEY_ID,
    razorpayOrderId: payment.gatewayOrderId,
    amountPaise: payment.amountPaise,
    currency: "INR",
    orderId: order.id,
    orderNumber: order.orderNumber,
    expiresAt: order.reservationExpiresAt,
    prefill: { name: user?.name, email: user?.email ?? undefined, contact: user?.phone ?? undefined },
  };
}
