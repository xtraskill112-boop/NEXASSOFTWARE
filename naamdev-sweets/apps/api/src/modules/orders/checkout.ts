import { prisma, type Order } from "@naamdev/db";
import { numericCode } from "../../lib/crypto";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { nextOrderNumber } from "../../lib/counters";
import { logger } from "../../lib/logger";
import { getSetting } from "../../lib/settings";
import { integrations, env } from "../../config/env";
import { buildCartView, couponForCode } from "../cart/service";
import { awardPoints } from "../loyalty/service";
import { OutOfStockError, reserveStock } from "../inventory/service";
import { razorpay } from "../payments/razorpay";
import { applyTransition, cancelOrder, runEffects, type Effect } from "./service";

async function addressAndZone(userId: string, addressId?: string) {
  if (!addressId) return { address: null, zone: null };
  const address = await prisma.address.findFirst({ where: { id: addressId, userId, deletedAt: null } });
  if (!address) throw notFound("Address");
  const zone = await prisma.deliveryZone.findUnique({ where: { pincode: address.pincode } });
  return { address, zone };
}

export async function quote(userId: string, input: { addressId?: string; couponCode?: string | null; redeemPoints?: number }) {
  const cart = await prisma.cart.findUnique({ where: { userId } });
  const { address, zone } = await addressAndZone(userId, input.addressId);
  const [delivery, checkout] = await Promise.all([getSetting("delivery"), getSetting("checkout")]);
  const view = await buildCartView(cart?.id ?? null, userId, {
    couponCode: input.couponCode === undefined ? undefined : input.couponCode,
    redeemPoints: input.redeemPoints,
    zoneDeliveryFeePaise: zone?.isActive ? zone.deliveryFeePaise : null,
  });
  const blockers = [...view.blockers];
  const serviceable = !address || !!zone?.isActive || !delivery.restrictToZones;
  if (address && !serviceable) blockers.push(`Sorry, we don't deliver to PIN code ${address.pincode} yet.`);
  const total = view.pricing.totalPaise;
  const paymentOptions = {
    online: { available: integrations.razorpay && checkout.onlinePaymentsEnabled, reason: integrations.razorpay ? (checkout.onlinePaymentsEnabled ? null : "Online payments are temporarily disabled") : "Online payments are not configured" },
    cod: { available: checkout.codEnabled && total <= checkout.codMaxOrderPaise, reason: !checkout.codEnabled ? "Cash on delivery is currently unavailable" : total > checkout.codMaxOrderPaise ? `COD is available for orders up to ₹${checkout.codMaxOrderPaise / 100}` : null },
  };
  const etaMinutes = (zone?.etaMinutes ?? 60) + checkout.preparationMinutes;
  return { ...view, blockers, canCheckout: blockers.length === 0, address, zone, serviceable, paymentOptions, etaMinutes };
}

export async function placeOrder(
  userId: string,
  input: { addressId: string; paymentMethod: "ONLINE" | "COD"; idempotencyKey: string; couponCode?: string | null; redeemPoints?: number; customerNote?: string | null },
) {
  const existing = await prisma.order.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: input.idempotencyKey } }, include: { payments: true } });
  if (existing) return { order: existing, duplicate: true, payment: existing.payments.find((p) => p.method === "ONLINE") ?? null };

  const q = await quote(userId, input);
  if (!q.canCheckout) throw conflict(q.blockers[0] ?? "Your cart can't be checked out yet.", { blockers: q.blockers }, "CHECKOUT_BLOCKED");
  const ev = q.pricing.coupon?.evaluation;
  if (input.couponCode && ev && !ev.valid) throw badRequest(ev.message, { reason: ev.reason }, "COUPON_INVALID");
  const pay = input.paymentMethod === "ONLINE" ? q.paymentOptions.online : q.paymentOptions.cod;
  if (!pay.available) throw badRequest(pay.reason ?? "This payment method is unavailable.", undefined, "PAYMENT_METHOD_UNAVAILABLE");

  const [user, checkout] = await Promise.all([prisma.user.findUniqueOrThrow({ where: { id: userId } }), getSetting("checkout")]);
  const address = q.address!;
  const couponRow = q.couponCode && ev?.valid ? (await couponForCode(q.couponCode))?.coupon ?? null : null;
  const pricing = q.pricing;

  let created: { order: Order; effects: Effect[] };
  try {
    created = await prisma.$transaction(
      async (tx) => {
        // Serialise checkouts per customer to make double-submits and coupon races impossible.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"checkout:" + userId}))`;
        const dupe = await tx.order.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: input.idempotencyKey } } });
        if (dupe) return { order: dupe, effects: [] };

        if (couponRow) {
          const used = await tx.couponUsage.count({ where: { couponId: couponRow.id, userId } });
          if (used >= couponRow.perUserLimit) throw badRequest("You have already used this coupon.", undefined, "COUPON_INVALID");
          const inc = await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = "usedCount" + 1 WHERE "id" = ${couponRow.id} AND "isActive" = true AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`;
          if (inc !== 1) throw badRequest("This coupon has just reached its usage limit.", undefined, "COUPON_INVALID");
        }

        const orderNumber = await nextOrderNumber(tx);
        const now = new Date();
        const order = await tx.order.create({
          data: {
            orderNumber,
            userId,
            storeId: (await tx.store.findFirst({ where: { isDefault: true }, select: { id: true } }))?.id,
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
            couponId: couponRow?.id,
            couponCode: couponRow?.code,
            pointsRedeemed: pricing.pointsRedeemed,
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
            reservationExpiresAt: input.paymentMethod === "ONLINE" ? new Date(now.getTime() + checkout.reservationMinutes * 60_000) : null,
            idempotencyKey: input.idempotencyKey,
            items: {
              create: pricing.lines.map((l) => {
                const item = q.items.find((i) => i.variant.id === l.variantId)!;
                return {
                  productId: l.productId, variantId: l.variantId, productName: item.product.name, variantLabel: item.variant.label,
                  sku: item.variant.sku, imageUrl: item.product.image, unitMrpPaise: l.unitMrpPaise, unitPricePaise: l.unitPricePaise,
                  quantity: l.quantity, lineTotalPaise: l.lineTotalPaise, discountPaise: l.discountPaise, gstRate: l.gstRate, taxPaise: l.taxPaise,
                };
              }),
            },
            statusHistory: { create: { toStatus: "PENDING", actorType: "CUSTOMER", changedById: userId, note: "Order placed" } },
          },
          include: { items: true },
        });

        await reserveStock(tx, order.id, order.items.map((i) => ({ orderItemId: i.id, variantId: i.variantId, quantity: i.quantity })));
        if (couponRow) await tx.couponUsage.create({ data: { couponId: couponRow.id, userId, orderId: order.id, discountPaise: pricing.couponDiscountPaise } });
        if (pricing.pointsRedeemed > 0) {
          try {
            await awardPoints(tx, userId, -pricing.pointsRedeemed, "REDEEM", `Redeemed on order ${orderNumber}`, order.id);
          } catch {
            throw badRequest("Your Mithaas points balance changed. Please review your order.", undefined, "POINTS_CHANGED");
          }
        }
        const cart = await tx.cart.findUnique({ where: { userId } });
        if (cart) {
          await tx.cartItem.deleteMany({ where: { cartId: cart.id, savedForLater: false, variantId: { in: order.items.map((i) => i.variantId) } } });
          await tx.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
        }

        if (input.paymentMethod === "COD") {
          await tx.payment.create({ data: { orderId: order.id, method: "COD", provider: "cod", amountPaise: order.totalPaise } });
          return applyTransition(tx, order, "CONFIRMED", { type: "SYSTEM" }, "Cash on delivery order confirmed");
        }
        return { order, effects: [] as Effect[] };
      },
      { timeout: 20_000 },
    );
  } catch (err) {
    if (err instanceof OutOfStockError) {
      const v = await prisma.productVariant.findUnique({ where: { id: err.variantId }, include: { product: true } });
      throw conflict(`${v?.product.name ?? "An item"} (${v?.label ?? ""}) ${err.available > 0 ? `has only ${err.available} left` : "just went out of stock"}. Please update your cart.`, { variantId: err.variantId, available: err.available }, "OUT_OF_STOCK");
    }
    throw err;
  }

  await runEffects(created.effects);
  let payment = null;
  if (input.paymentMethod === "ONLINE" && created.order.status === "PENDING") {
    try {
      const rzp = await razorpay.createOrder(created.order.totalPaise, created.order.orderNumber, { orderId: created.order.id, orderNumber: created.order.orderNumber });
      payment = await prisma.payment.create({
        data: { orderId: created.order.id, method: "ONLINE", provider: "razorpay", amountPaise: created.order.totalPaise, gatewayOrderId: rzp.id, raw: rzp as object },
      });
    } catch (err) {
      logger.error({ err, orderId: created.order.id }, "razorpay order creation failed — rolling back reservation");
      await cancelOrder(created.order.id, { type: "SYSTEM" }, "Payment could not be initiated");
      throw err;
    }
  }
  return { order: created.order, duplicate: false, payment };
}

/** Razorpay Checkout options for an order that is awaiting payment. */
export async function paymentSession(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId }, include: { payments: { where: { method: "ONLINE" }, orderBy: { createdAt: "desc" } } } });
  if (!order) throw notFound("Order");
  if (order.status !== "PENDING" || order.paymentMethod !== "ONLINE" || order.paymentStatus === "PAID")
    throw badRequest("This order is not awaiting payment.");
  if (order.reservationExpiresAt && order.reservationExpiresAt < new Date()) throw badRequest("The payment window for this order has expired.");
  const payment = order.payments[0];
  if (!payment?.gatewayOrderId) throw badRequest("Payment was not initiated for this order.");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return {
    keyId: env.RAZORPAY_KEY_ID,
    razorpayOrderId: payment.gatewayOrderId,
    amountPaise: payment.amountPaise,
    currency: "INR",
    orderId: order.id,
    orderNumber: order.orderNumber,
    expiresAt: order.reservationExpiresAt,
    prefill: { name: user.name, email: user.email ?? undefined, contact: user.phone ?? undefined },
  };
}
