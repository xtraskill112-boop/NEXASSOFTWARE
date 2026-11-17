import { prisma, type DeliveryAssignment } from "@naamdev/db";
import { estimateTravelMinutes, haversineKm, SOCKET_EVENTS } from "@naamdev/shared";
import { safeEqual } from "../../lib/crypto";
import { badRequest, conflict, forbidden, notFound, tooMany } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { getSetting } from "../../lib/settings";
import { emitTo, rooms } from "../../realtime/io";
import { notify, notifyStaff } from "../notifications/service";
import { applyTransition, lockOrder, runEffects, type Effect } from "../orders/service";

const ACTIVE = ["ACCEPTED", "AT_STORE", "PICKED_UP", "OUT_FOR_DELIVERY"] as const;
const LOCATION_FRESH_MS = 10 * 60_000;
const MAX_CONCURRENT = 2;

function istDayStart(): Date {
  const now = new Date();
  const ist = new Date(now.getTime() + 330 * 60_000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 330 * 60_000);
}

async function earningFor(orderId: string) {
  const [order, s] = await Promise.all([prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { store: true } }), getSetting("delivery")]);
  const km = order.store && order.deliveryLat != null && order.deliveryLng != null ? haversineKm(order.store, { lat: order.deliveryLat, lng: order.deliveryLng }) * 1.35 : 3;
  return { distanceKm: Math.round(km * 10) / 10, earningPaise: Math.round((s.partnerBaseFeePaise + km * s.partnerPerKmPaise) / 100) * 100, order };
}

export function offerPayload(a: DeliveryAssignment, order: { orderNumber: string; totalPaise: number; paymentMethod: string; addressSnapshot: unknown; deliveryLat: number | null; deliveryLng: number | null; store?: { name: string; addressLine: string; lat: number; lng: number } | null }) {
  const addr = order.addressSnapshot as { line1: string; line2?: string; city: string; pincode: string; landmark?: string };
  return {
    assignmentId: a.id,
    orderId: a.orderId,
    orderNumber: order.orderNumber,
    status: a.status,
    distanceKm: a.distanceKm,
    earningPaise: a.earningPaise,
    offerExpiresAt: a.offerExpiresAt,
    paymentMethod: order.paymentMethod,
    collectPaise: order.paymentMethod === "COD" ? order.totalPaise : 0,
    pickup: order.store ? { name: order.store.name, address: order.store.addressLine, lat: order.store.lat, lng: order.store.lng } : null,
    drop: { area: `${addr.line2 ?? addr.line1}, ${addr.city} ${addr.pincode}`, lat: order.deliveryLat, lng: order.deliveryLng },
  };
}

async function createOffer(orderId: string, partnerId: string, opts: { force?: boolean } = {}) {
  const s = await getSetting("delivery");
  const { distanceKm, earningPaise, order } = await earningFor(orderId);
  const a = await prisma.deliveryAssignment.create({
    data: {
      orderId, partnerId, distanceKm, earningPaise,
      status: opts.force ? "ACCEPTED" : "OFFERED",
      offerExpiresAt: opts.force ? null : new Date(Date.now() + s.offerTimeoutSeconds * 1000),
      respondedAt: opts.force ? new Date() : null,
    },
  });
  const partner = await prisma.deliveryPartner.findUniqueOrThrow({ where: { id: partnerId } });
  emitTo(rooms.partner(partnerId), opts.force ? SOCKET_EVENTS.deliveryAssignmentUpdated : SOCKET_EVENTS.deliveryOffer, offerPayload(a, order));
  notify({
    userId: partner.userId,
    type: "DELIVERY",
    title: opts.force ? "New delivery assigned" : "New delivery request 🛵",
    body: `Order ${order.orderNumber} · ${distanceKm} km · earn ₹${(earningPaise / 100).toFixed(0)}`,
    link: "/",
    template: opts.force ? "partner.assigned" : "partner.offer",
    channels: ["IN_APP", "PUSH"],
  });
  return a;
}

/** Offers the order to the nearest available partner who hasn't already declined it. */
export async function autoOfferDelivery(orderId: string): Promise<DeliveryAssignment | null> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { store: true, assignments: true } });
  if (!order || !["CONFIRMED", "PROCESSING", "PREPARING", "PACKED", "READY_FOR_PICKUP"].includes(order.status)) return null;
  if (order.assignments.some((a) => a.status === "OFFERED" || (ACTIVE as readonly string[]).includes(a.status))) return null;
  const tried = new Set(order.assignments.map((a) => a.partnerId));
  const candidates = await prisma.deliveryPartner.findMany({
    where: {
      status: "APPROVED", isOnline: true, lastLocationAt: { gte: new Date(Date.now() - LOCATION_FRESH_MS) },
      user: { status: "ACTIVE" }, id: { notIn: [...tried] },
    },
    include: { _count: { select: { assignments: { where: { status: { in: [...ACTIVE, "OFFERED"] } } } } } },
  });
  const origin = order.store ?? { lat: order.deliveryLat ?? 0, lng: order.deliveryLng ?? 0 };
  const s = await getSetting("delivery");
  const ranked = candidates
    .filter((p) => p._count.assignments < MAX_CONCURRENT && p.currentLat != null && p.currentLng != null)
    .map((p) => ({ p, d: haversineKm(origin, { lat: p.currentLat!, lng: p.currentLng! }) }))
    .filter((x) => x.d <= s.serviceRadiusKm)
    .sort((a, b) => a.d - b.d);
  const best = ranked[0];
  if (!best) {
    notifyStaff("delivery.manage", { type: "DELIVERY", title: `No partner available · ${order.orderNumber}`, body: "Assign a delivery partner manually from the order page.", link: `/orders/${order.id}`, template: "admin.no_partner" });
    return null;
  }
  return createOffer(order.id, best.p.id);
}

/** Admin: offer (or force-assign) an order to a specific partner. */
export async function assignPartner(orderId: string, partnerId: string, force: boolean) {
  const partner = await prisma.deliveryPartner.findUnique({ where: { id: partnerId } });
  if (!partner || partner.status !== "APPROVED") throw badRequest("Partner is not approved for deliveries.");
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound("Order");
  if (!["CONFIRMED", "PROCESSING", "PREPARING", "PACKED", "READY_FOR_PICKUP"].includes(order.status)) throw badRequest("This order can't be assigned in its current status.");
  // Withdraw any open offers / unstarted assignments.
  const open = await prisma.deliveryAssignment.findMany({ where: { orderId, status: { in: ["OFFERED", "ACCEPTED", "AT_STORE"] } } });
  for (const a of open) {
    await prisma.deliveryAssignment.update({ where: { id: a.id }, data: { status: "CANCELLED", cancelledAt: new Date(), rejectionReason: "Reassigned by store" } });
    emitTo(rooms.partner(a.partnerId), SOCKET_EVENTS.deliveryOfferWithdrawn, { assignmentId: a.id });
  }
  if (await prisma.deliveryAssignment.findFirst({ where: { orderId, status: { in: ["PICKED_UP", "OUT_FOR_DELIVERY"] } } })) throw conflict("This order is already on its way.");
  return createOffer(orderId, partnerId, { force });
}

/** Job: expire unanswered offers and move on to the next nearest partner. */
export async function expireOffers() {
  const due = await prisma.deliveryAssignment.findMany({ where: { status: "OFFERED", offerExpiresAt: { lt: new Date() } }, take: 50 });
  for (const a of due) {
    const r = await prisma.deliveryAssignment.updateMany({ where: { id: a.id, status: "OFFERED" }, data: { status: "EXPIRED", respondedAt: new Date() } });
    if (r.count) {
      emitTo(rooms.partner(a.partnerId), SOCKET_EVENTS.deliveryOfferWithdrawn, { assignmentId: a.id });
      await autoOfferDelivery(a.orderId).catch((err) => logger.error({ err }, "re-offer failed"));
    }
  }
  return due.length;
}

async function ownAssignment(partnerId: string, assignmentId: string) {
  const a = await prisma.deliveryAssignment.findFirst({ where: { id: assignmentId, partnerId } });
  if (!a) throw notFound("Delivery");
  return a;
}

export async function respondToOffer(partnerId: string, assignmentId: string, accept: boolean, reason?: string) {
  const a = await ownAssignment(partnerId, assignmentId);
  if (a.status !== "OFFERED") throw conflict("This request is no longer available.", undefined, "OFFER_UNAVAILABLE");
  if (a.offerExpiresAt && a.offerExpiresAt < new Date()) throw conflict("This request has expired.", undefined, "OFFER_UNAVAILABLE");
  const partner = await prisma.deliveryPartner.findUniqueOrThrow({ where: { id: partnerId } });
  if (accept && (partner.status !== "APPROVED" || !partner.isOnline)) throw forbidden("Go online to accept deliveries.");
  const r = await prisma.deliveryAssignment.updateMany({
    where: { id: a.id, status: "OFFERED" },
    data: accept ? { status: "ACCEPTED", respondedAt: new Date() } : { status: "REJECTED", respondedAt: new Date(), rejectionReason: reason ?? null },
  });
  if (!r.count) throw conflict("This request is no longer available.", undefined, "OFFER_UNAVAILABLE");
  if (!accept) await autoOfferDelivery(a.orderId);
  else emitTo(rooms.staff, SOCKET_EVENTS.adminOrderUpdated, { orderId: a.orderId, assignment: "ACCEPTED" });
  return prisma.deliveryAssignment.findUniqueOrThrow({ where: { id: a.id } });
}

export async function advanceAssignment(partnerId: string, assignmentId: string, step: "arrived" | "pickup" | "start") {
  const a = await ownAssignment(partnerId, assignmentId);
  const effects: Effect[] = [];
  await prisma.$transaction(async (tx) => {
    let order = await lockOrder(tx, a.orderId);
    const fresh = await tx.deliveryAssignment.findUniqueOrThrow({ where: { id: a.id } });
    if (step === "arrived") {
      if (fresh.status !== "ACCEPTED") throw conflict("Accept the delivery first.");
      await tx.deliveryAssignment.update({ where: { id: a.id }, data: { status: "AT_STORE", arrivedAtStoreAt: new Date() } });
    } else if (step === "pickup") {
      if (fresh.status !== "ACCEPTED" && fresh.status !== "AT_STORE") throw conflict("This delivery can't be picked up right now.");
      if (!["PACKED", "READY_FOR_PICKUP"].includes(order.status)) throw conflict("The order isn't packed yet. Please wait for the store to hand it over.", undefined, "NOT_READY");
      if (order.status === "PACKED") {
        const r = await applyTransition(tx, order, "READY_FOR_PICKUP", { type: "PARTNER", userId: null }, "Handed over to partner");
        order = r.order;
        effects.push(...r.effects.filter((e) => e.kind !== "autoAssign"));
      }
      const r = await applyTransition(tx, order, "DISPATCHED", { type: "PARTNER" }, "Picked up by delivery partner");
      effects.push(...r.effects);
      await tx.deliveryAssignment.update({ where: { id: a.id }, data: { status: "PICKED_UP", pickedUpAt: new Date() } });
    } else {
      if (fresh.status !== "PICKED_UP") throw conflict("Pick up the order first.");
      const r = await applyTransition(tx, order, "OUT_FOR_DELIVERY", { type: "PARTNER" }, "On the way");
      effects.push(...r.effects);
      await tx.deliveryAssignment.update({ where: { id: a.id }, data: { status: "OUT_FOR_DELIVERY", outForDeliveryAt: new Date() } });
    }
  });
  await runEffects(effects);
  return prisma.deliveryAssignment.findUniqueOrThrow({ where: { id: a.id } });
}

const otpAttempts = new Map<string, { n: number; at: number }>();

export async function completeDelivery(partnerId: string, assignmentId: string, otp: string, codCollected?: boolean) {
  const a = await ownAssignment(partnerId, assignmentId);
  if (a.status !== "PICKED_UP" && a.status !== "OUT_FOR_DELIVERY") throw conflict("This delivery isn't in progress.");
  const att = otpAttempts.get(a.id);
  if (att && att.n >= 5 && Date.now() - att.at < 15 * 60_000) throw tooMany("Too many incorrect OTP attempts. Contact the store.");
  const order = await prisma.order.findUniqueOrThrow({ where: { id: a.orderId } });
  if (!order.deliveryOtp || !safeEqual(order.deliveryOtp, otp)) {
    otpAttempts.set(a.id, { n: (att?.n ?? 0) + 1, at: Date.now() });
    throw badRequest("Incorrect delivery OTP. Ask the customer to check their app or SMS.", undefined, "OTP_INVALID");
  }
  if (order.paymentMethod === "COD" && order.paymentStatus === "COD_PENDING" && !codCollected)
    throw badRequest(`Collect ₹${(order.totalPaise / 100).toFixed(2)} in cash/UPI before completing this delivery.`, undefined, "COD_NOT_COLLECTED");
  otpAttempts.delete(a.id);

  const settings = await getSetting("delivery");
  const effects: Effect[] = [];
  await prisma.$transaction(async (tx) => {
    let o = await lockOrder(tx, a.orderId);
    if (o.status === "DISPATCHED") {
      const r = await applyTransition(tx, o, "OUT_FOR_DELIVERY", { type: "PARTNER" }, "On the way");
      o = r.order;
    }
    const r = await applyTransition(tx, o, "DELIVERED", { type: "PARTNER" }, "Delivered — OTP verified");
    effects.push(...r.effects);
    await tx.deliveryAssignment.update({ where: { id: a.id }, data: { status: "DELIVERED", deliveredAt: new Date() } });
    await tx.partnerEarning.create({ data: { partnerId, assignmentId: a.id, type: "DELIVERY_FEE", amountPaise: a.earningPaise, description: `Delivery ${o.orderNumber} · ${a.distanceKm ?? "-"} km` } });
    await tx.deliveryPartner.update({ where: { id: partnerId }, data: { totalDeliveries: { increment: 1 } } });
    const today = await tx.deliveryAssignment.count({ where: { partnerId, status: "DELIVERED", deliveredAt: { gte: istDayStart() } } });
    if (settings.dailyIncentiveTarget > 0 && today === settings.dailyIncentiveTarget && settings.dailyIncentivePaise > 0)
      await tx.partnerEarning.create({ data: { partnerId, type: "INCENTIVE", amountPaise: settings.dailyIncentivePaise, description: `Daily target bonus — ${today} deliveries` } });
  });
  await runEffects(effects);
  return prisma.deliveryAssignment.findUniqueOrThrow({ where: { id: a.id } });
}

const lastPoint = new Map<string, number>();

export async function updateLocation(partnerId: string, loc: { lat: number; lng: number; heading?: number | null; speed?: number | null; accuracy?: number | null }) {
  const partner = await prisma.deliveryPartner.update({ where: { id: partnerId }, data: { currentLat: loc.lat, currentLng: loc.lng, lastLocationAt: new Date() } });
  const active = await prisma.deliveryAssignment.findMany({ where: { partnerId, status: { in: [...ACTIVE] } }, include: { order: { include: { store: true } } } });
  for (const a of active) {
    const now = Date.now();
    if (now - (lastPoint.get(a.id) ?? 0) > 8_000) {
      lastPoint.set(a.id, now);
      await prisma.trackingPoint.create({ data: { assignmentId: a.id, partnerId, orderId: a.orderId, lat: loc.lat, lng: loc.lng, heading: loc.heading, speed: loc.speed, accuracy: loc.accuracy } });
    }
    const toDrop = ["PICKED_UP", "OUT_FOR_DELIVERY"].includes(a.status);
    const target = toDrop ? (a.order.deliveryLat != null ? { lat: a.order.deliveryLat, lng: a.order.deliveryLng! } : null) : a.order.store;
    const etaMinutes = target ? estimateTravelMinutes(haversineKm(loc, target)) : null;
    emitTo(rooms.order(a.orderId), SOCKET_EVENTS.trackingLocation, { orderId: a.orderId, lat: loc.lat, lng: loc.lng, heading: loc.heading ?? null, at: new Date(), etaMinutes, assignmentStatus: a.status });
  }
  emitTo(rooms.staff, SOCKET_EVENTS.partnerLocation, { partnerId, lat: loc.lat, lng: loc.lng, at: new Date(), busy: active.length > 0 });
  return { ok: true, activeDeliveries: active.length, isOnline: partner.isOnline };
}

export async function earningsSummary(partnerId: string) {
  const day = istDayStart();
  const week = new Date(day.getTime() - 6 * 86_400_000);
  const month = new Date(day.getTime() - 29 * 86_400_000);
  const sum = async (from?: Date, extra: object = {}) =>
    (await prisma.partnerEarning.aggregate({ where: { partnerId, ...(from ? { createdAt: { gte: from } } : {}), ...extra }, _sum: { amountPaise: true } }))._sum.amountPaise ?? 0;
  const [today, last7, last30, unsettled, deliveriesToday, s] = await Promise.all([
    sum(day), sum(week), sum(month), sum(undefined, { isSettled: false }),
    prisma.deliveryAssignment.count({ where: { partnerId, status: "DELIVERED", deliveredAt: { gte: day } } }),
    getSetting("delivery"),
  ]);
  return {
    todayPaise: today, last7DaysPaise: last7, last30DaysPaise: last30, unsettledPaise: unsettled, deliveriesToday,
    incentive: { target: s.dailyIncentiveTarget, bonusPaise: s.dailyIncentivePaise, progress: Math.min(deliveriesToday, s.dailyIncentiveTarget), achieved: deliveriesToday >= s.dailyIncentiveTarget },
  };
}
