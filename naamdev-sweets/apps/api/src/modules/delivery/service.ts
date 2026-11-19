import {
  C, db, FieldValue, getDoc, getDocs, getMany, SUB,
  type DeliveryAssignment, type DeliveryPartner, type Order, type PartnerEarning, type Store, type User, type WithId,
} from "@naamdev/db";
import { estimateTravelMinutes, haversineKm } from "@naamdev/shared";
import { safeEqual } from "../../lib/crypto";
import { badRequest, conflict, forbidden, notFound, tooMany } from "../../lib/errors";
import { live } from "../../lib/live";
import { logger } from "../../lib/logger";
import { getSetting } from "../../lib/settings";
import { defaultStore } from "../catalog/service";
import { notify, notifyStaff } from "../notifications/service";
import { applyTransition, orderRef, runEffects, withOrderTx } from "../orders/service";

export const ACTIVE = ["ACCEPTED", "AT_STORE", "PICKED_UP", "OUT_FOR_DELIVERY"] as const;
const BUSY = [...ACTIVE, "OFFERED"];
const ASSIGNABLE_ORDER = ["CONFIRMED", "PROCESSING", "PREPARING", "PACKED", "READY_FOR_PICKUP"];
const LOCATION_FRESH_MS = 10 * 60_000;
const MAX_CONCURRENT = 2;

const assignments = () => db.collection(C.assignments);
const assignmentRef = (id: string) => assignments().doc(id);

export function istDayStart(): Date {
  const now = new Date();
  const ist = new Date(now.getTime() + 330 * 60_000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 330 * 60_000);
}

async function earningFor(order: WithId<Order>) {
  const [store, s] = await Promise.all([defaultStore(), getSetting("delivery")]);
  const km = store && order.deliveryLat != null && order.deliveryLng != null ? haversineKm(store, { lat: order.deliveryLat, lng: order.deliveryLng }) * 1.35 : 3;
  return { distanceKm: Math.round(km * 10) / 10, earningPaise: Math.round((s.partnerBaseFeePaise + km * s.partnerPerKmPaise) / 100) * 100, store };
}

export function offerPayload(
  a: WithId<DeliveryAssignment>,
  order: { orderNumber: string; totalPaise: number; paymentMethod: string; addressSnapshot: unknown; deliveryLat: number | null; deliveryLng: number | null },
  store: Pick<Store, "name" | "addressLine" | "lat" | "lng"> | null,
) {
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
    pickup: store ? { name: store.name, address: store.addressLine, lat: store.lat, lng: store.lng } : null,
    drop: { area: `${addr.line2 ?? addr.line1}, ${addr.city} ${addr.pincode}`, lat: order.deliveryLat, lng: order.deliveryLng },
  };
}

async function createOffer(order: WithId<Order>, partnerId: string, opts: { force?: boolean } = {}) {
  const s = await getSetting("delivery");
  const { distanceKm, earningPaise } = await earningFor(order);
  const now = new Date();
  const data: DeliveryAssignment = {
    orderId: order.id, orderNumber: order.orderNumber, partnerId, distanceKm, earningPaise,
    status: opts.force ? "ACCEPTED" : "OFFERED",
    offerExpiresAt: opts.force ? null : new Date(now.getTime() + s.offerTimeoutSeconds * 1000),
    offeredAt: now, respondedAt: opts.force ? now : null, arrivedAtStoreAt: null, pickedUpAt: null, outForDeliveryAt: null,
    deliveredAt: null, cancelledAt: null, rejectionReason: null, createdAt: now, updatedAt: now,
  };
  const ref = assignments().doc();
  await ref.set(data);
  if (opts.force) await setOrderPartner(order, partnerId);
  live.partner(partnerId, opts.force ? "assignment" : "offer", { assignmentId: ref.id, orderNumber: order.orderNumber });
  notify({
    userId: partnerId,
    type: "DELIVERY",
    title: opts.force ? "New delivery assigned" : "New delivery request 🛵",
    body: `Order ${order.orderNumber} · ${distanceKm} km · earn ₹${(earningPaise / 100).toFixed(0)}`,
    link: "/",
    template: opts.force ? "partner.assigned" : "partner.offer",
    channels: ["IN_APP", "PUSH"],
  });
  return { ...data, id: ref.id };
}

/** Records the rider on the order (so they may follow it live) and signals the change. */
async function setOrderPartner(order: WithId<Order>, partnerId: string | null) {
  await orderRef(order.id).update({ partnerId, updatedAt: new Date() });
  live.order(order.id, { userId: order.userId, partnerId, status: order.status, event: "assignment" });
  live.staff("order-updated", { orderId: order.id, assignment: partnerId ? "ASSIGNED" : "NONE" });
}

/** Busy counts per partner (open offers + active deliveries). */
async function busyCounts(): Promise<Map<string, number>> {
  const open = await getDocs<DeliveryAssignment>(assignments().where("status", "in", BUSY));
  const counts = new Map<string, number>();
  for (const a of open) counts.set(a.partnerId, (counts.get(a.partnerId) ?? 0) + 1);
  return counts;
}

/** Offers the order to the nearest available partner who hasn't already declined it. */
export async function autoOfferDelivery(orderId: string): Promise<WithId<DeliveryAssignment> | null> {
  const order = await getDoc<Order>(orderRef(orderId));
  if (!order || !ASSIGNABLE_ORDER.includes(order.status)) return null;
  const history = await getDocs<DeliveryAssignment>(assignments().where("orderId", "==", orderId));
  if (history.some((a) => BUSY.includes(a.status))) return null;
  const tried = new Set(history.map((a) => a.partnerId));
  const [online, counts, store, s] = await Promise.all([
    getDocs<DeliveryPartner>(db.collection(C.partners).where("status", "==", "APPROVED").where("isOnline", "==", true)),
    busyCounts(),
    defaultStore(),
    getSetting("delivery"),
  ]);
  const fresh = online.filter((p) => !tried.has(p.id) && p.lastLocationAt && Date.now() - +p.lastLocationAt < LOCATION_FRESH_MS);
  const users = new Map((await getMany<User>(C.users, fresh.map((p) => p.id))).map((u) => [u.id, u]));
  const origin = store ?? { lat: order.deliveryLat ?? 0, lng: order.deliveryLng ?? 0 };
  const ranked = fresh
    .filter((p) => users.get(p.id)?.status === "ACTIVE" && (counts.get(p.id) ?? 0) < MAX_CONCURRENT && p.currentLat != null && p.currentLng != null)
    .map((p) => ({ p, d: haversineKm(origin, { lat: p.currentLat!, lng: p.currentLng! }) }))
    .filter((x) => x.d <= s.serviceRadiusKm)
    .sort((a, b) => a.d - b.d);
  const best = ranked[0];
  if (!best) {
    notifyStaff("delivery.manage", { type: "DELIVERY", title: `No partner available · ${order.orderNumber}`, body: "Assign a delivery partner manually from the order page.", link: `/orders/${order.id}`, template: "admin.no_partner" });
    return null;
  }
  return createOffer(order, best.p.id);
}

/** Admin: offer (or force-assign) an order to a specific partner. */
export async function assignPartner(orderId: string, partnerId: string, force: boolean) {
  const partner = await getDoc<DeliveryPartner>(db.collection(C.partners).doc(partnerId));
  if (!partner || partner.status !== "APPROVED") throw badRequest("Partner is not approved for deliveries.");
  const order = await getDoc<Order>(orderRef(orderId));
  if (!order) throw notFound("Order");
  if (!ASSIGNABLE_ORDER.includes(order.status)) throw badRequest("This order can't be assigned in its current status.");
  const existing = await getDocs<DeliveryAssignment>(assignments().where("orderId", "==", orderId));
  if (existing.some((a) => a.status === "PICKED_UP" || a.status === "OUT_FOR_DELIVERY")) throw conflict("This order is already on its way.");
  // Withdraw any open offers / unstarted assignments.
  for (const a of existing.filter((x) => ["OFFERED", "ACCEPTED", "AT_STORE"].includes(x.status))) {
    await assignmentRef(a.id).update({ status: "CANCELLED", cancelledAt: new Date(), rejectionReason: "Reassigned by store", updatedAt: new Date() });
    live.partner(a.partnerId, "withdrawn", { assignmentId: a.id });
  }
  return createOffer(order, partnerId, { force });
}

/** Job: expire unanswered offers and move on to the next nearest partner. */
export async function expireOffers() {
  const now = new Date();
  const due = (await getDocs<DeliveryAssignment>(assignments().where("status", "==", "OFFERED"))).filter((a) => a.offerExpiresAt && a.offerExpiresAt < now).slice(0, 50);
  for (const a of due) {
    const expired = await db.runTransaction(async (tx) => {
      const fresh = await getDoc<DeliveryAssignment>(assignmentRef(a.id), tx);
      if (fresh?.status !== "OFFERED") return false;
      tx.update(assignmentRef(a.id), { status: "EXPIRED", respondedAt: now, updatedAt: now });
      return true;
    });
    if (expired) {
      live.partner(a.partnerId, "withdrawn", { assignmentId: a.id });
      await autoOfferDelivery(a.orderId).catch((err) => logger.error({ err }, "re-offer failed"));
    }
  }
  return due.length;
}

export async function ownAssignment(partnerId: string, assignmentId: string) {
  const a = await getDoc<DeliveryAssignment>(assignmentRef(assignmentId));
  if (!a || a.partnerId !== partnerId) throw notFound("Delivery");
  return a;
}

export async function respondToOffer(partnerId: string, assignmentId: string, accept: boolean, reason?: string) {
  const a = await ownAssignment(partnerId, assignmentId);
  if (a.status !== "OFFERED") throw conflict("This request is no longer available.", undefined, "OFFER_UNAVAILABLE");
  if (a.offerExpiresAt && a.offerExpiresAt < new Date()) throw conflict("This request has expired.", undefined, "OFFER_UNAVAILABLE");
  const partner = await getDoc<DeliveryPartner>(db.collection(C.partners).doc(partnerId));
  if (accept && (!partner || partner.status !== "APPROVED" || !partner.isOnline)) throw forbidden("Go online to accept deliveries.");
  const ok = await db.runTransaction(async (tx) => {
    const fresh = await getDoc<DeliveryAssignment>(assignmentRef(a.id), tx);
    if (fresh?.status !== "OFFERED") return false;
    const now = new Date();
    tx.update(assignmentRef(a.id), accept ? { status: "ACCEPTED", respondedAt: now, updatedAt: now } : { status: "REJECTED", respondedAt: now, rejectionReason: reason ?? null, updatedAt: now });
    return true;
  });
  if (!ok) throw conflict("This request is no longer available.", undefined, "OFFER_UNAVAILABLE");
  if (!accept) await autoOfferDelivery(a.orderId);
  else {
    const order = await getDoc<Order>(orderRef(a.orderId));
    if (order) await setOrderPartner(order, partnerId);
  }
  return (await getDoc<DeliveryAssignment>(assignmentRef(a.id)))!;
}

export async function advanceAssignment(partnerId: string, assignmentId: string, step: "arrived" | "pickup" | "start") {
  const a = await ownAssignment(partnerId, assignmentId);
  const actor = { type: "PARTNER" as const, userId: partnerId };
  const { effects } = await withOrderTx(async (ctx) => {
    const order = await ctx.lock(a.orderId);
    const fresh = (await getDoc<DeliveryAssignment>(assignmentRef(a.id), ctx.tx))!;
    const now = new Date();
    if (step === "arrived") {
      if (fresh.status !== "ACCEPTED") throw conflict("Accept the delivery first.");
      ctx.tx.update(assignmentRef(a.id), { status: "AT_STORE", arrivedAtStoreAt: now, updatedAt: now });
    } else if (step === "pickup") {
      if (fresh.status !== "ACCEPTED" && fresh.status !== "AT_STORE") throw conflict("This delivery can't be picked up right now.");
      if (!["PACKED", "READY_FOR_PICKUP"].includes(order.status)) throw conflict("The order isn't packed yet. Please wait for the store to hand it over.", undefined, "NOT_READY");
      if (order.status === "PACKED") {
        await applyTransition(ctx, order, "READY_FOR_PICKUP", actor, "Handed over to partner");
        ctx.effects = ctx.effects.filter((e) => e.kind !== "autoAssign");
      }
      await applyTransition(ctx, order, "DISPATCHED", actor, "Picked up by delivery partner");
      order.partnerId = partnerId;
      ctx.tx.update(assignmentRef(a.id), { status: "PICKED_UP", pickedUpAt: now, updatedAt: now });
    } else {
      if (fresh.status !== "PICKED_UP") throw conflict("Pick up the order first.");
      await applyTransition(ctx, order, "OUT_FOR_DELIVERY", actor, "On the way");
      ctx.tx.update(assignmentRef(a.id), { status: "OUT_FOR_DELIVERY", outForDeliveryAt: now, updatedAt: now });
    }
  });
  await runEffects(effects);
  return (await getDoc<DeliveryAssignment>(assignmentRef(a.id)))!;
}

const otpAttempts = new Map<string, { n: number; at: number }>();

async function deliveredToday(partnerId: string) {
  return (await getDocs<DeliveryAssignment>(assignments().where("partnerId", "==", partnerId).where("status", "==", "DELIVERED").where("deliveredAt", ">=", istDayStart()))).length;
}

export async function completeDelivery(partnerId: string, assignmentId: string, otp: string, codCollected?: boolean) {
  const a = await ownAssignment(partnerId, assignmentId);
  if (a.status !== "PICKED_UP" && a.status !== "OUT_FOR_DELIVERY") throw conflict("This delivery isn't in progress.");
  const att = otpAttempts.get(a.id);
  if (att && att.n >= 5 && Date.now() - att.at < 15 * 60_000) throw tooMany("Too many incorrect OTP attempts. Contact the store.");
  const order = await getDoc<Order>(orderRef(a.orderId));
  if (!order) throw notFound("Order");
  if (!order.deliveryOtp || !safeEqual(order.deliveryOtp, otp)) {
    otpAttempts.set(a.id, { n: (att?.n ?? 0) + 1, at: Date.now() });
    throw badRequest("Incorrect delivery OTP. Ask the customer to check their app or SMS.", undefined, "OTP_INVALID");
  }
  if (order.paymentMethod === "COD" && order.paymentStatus === "COD_PENDING" && !codCollected)
    throw badRequest(`Collect ₹${(order.totalPaise / 100).toFixed(2)} in cash/UPI before completing this delivery.`, undefined, "COD_NOT_COLLECTED");
  otpAttempts.delete(a.id);

  const settings = await getSetting("delivery");
  const doneToday = await deliveredToday(partnerId);
  const actor = { type: "PARTNER" as const, userId: partnerId };
  const { effects } = await withOrderTx(async (ctx) => {
    const o = await ctx.lock(a.orderId);
    const fresh = (await getDoc<DeliveryAssignment>(assignmentRef(a.id), ctx.tx))!;
    if (fresh.status !== "PICKED_UP" && fresh.status !== "OUT_FOR_DELIVERY") throw conflict("This delivery isn't in progress.");
    if (o.status === "DISPATCHED") await applyTransition(ctx, o, "OUT_FOR_DELIVERY", actor, "On the way");
    await applyTransition(ctx, o, "DELIVERED", actor, "Delivered — OTP verified");
    const now = new Date();
    ctx.tx.update(assignmentRef(a.id), { status: "DELIVERED", deliveredAt: now, updatedAt: now });
    const earning = (type: PartnerEarning["type"], amountPaise: number, description: string, assignment: string | null): PartnerEarning => ({
      partnerId, assignmentId: assignment, orderId: o.id, type, amountPaise, description, isSettled: false, settledAt: null, createdAt: now,
    });
    ctx.tx.set(db.collection(C.earnings).doc(), earning("DELIVERY_FEE", a.earningPaise, `Delivery ${o.orderNumber} · ${a.distanceKm ?? "-"} km`, a.id));
    ctx.tx.update(db.collection(C.partners).doc(partnerId), { totalDeliveries: FieldValue.increment(1), updatedAt: now });
    const today = doneToday + 1;
    if (settings.dailyIncentiveTarget > 0 && today === settings.dailyIncentiveTarget && settings.dailyIncentivePaise > 0)
      ctx.tx.set(db.collection(C.earnings).doc(), earning("INCENTIVE", settings.dailyIncentivePaise, `Daily target bonus — ${today} deliveries`, null));
  });
  await runEffects(effects);
  return (await getDoc<DeliveryAssignment>(assignmentRef(a.id)))!;
}

const lastPoint = new Map<string, number>();

export async function updateLocation(partnerId: string, loc: { lat: number; lng: number; heading?: number | null; speed?: number | null; accuracy?: number | null }) {
  const partnerRef = db.collection(C.partners).doc(partnerId);
  const [partner, active] = await Promise.all([
    getDoc<DeliveryPartner>(partnerRef),
    getDocs<DeliveryAssignment>(assignments().where("partnerId", "==", partnerId).where("status", "in", [...ACTIVE])),
  ]);
  if (!partner) throw notFound("Partner");
  await partnerRef.update({ currentLat: loc.lat, currentLng: loc.lng, lastLocationAt: new Date() });
  const store = await defaultStore();
  for (const a of active) {
    const now = Date.now();
    if (now - (lastPoint.get(a.id) ?? 0) > 8_000) {
      lastPoint.set(a.id, now);
      await orderRef(a.orderId).collection(SUB.tracking).add({
        assignmentId: a.id, partnerId, orderId: a.orderId, lat: loc.lat, lng: loc.lng, heading: loc.heading ?? null, speed: loc.speed ?? null,
        accuracy: loc.accuracy ?? null, recordedAt: new Date(),
      });
    }
    const order = await getDoc<Order>(orderRef(a.orderId));
    const toDrop = ["PICKED_UP", "OUT_FOR_DELIVERY"].includes(a.status);
    const target = toDrop ? (order?.deliveryLat != null ? { lat: order.deliveryLat, lng: order.deliveryLng! } : null) : store;
    const etaMinutes = target ? estimateTravelMinutes(haversineKm(loc, target)) : null;
    live.orderLocation(a.orderId, { lat: loc.lat, lng: loc.lng, heading: loc.heading ?? null, etaMinutes, assignmentStatus: a.status });
  }
  return { ok: true, activeDeliveries: active.length, isOnline: partner.isOnline };
}

export async function earningsSummary(partnerId: string) {
  const day = istDayStart();
  const week = new Date(day.getTime() - 6 * 86_400_000);
  const month = new Date(day.getTime() - 29 * 86_400_000);
  const [recent, unsettled, deliveriesToday, s] = await Promise.all([
    getDocs<PartnerEarning>(db.collection(C.earnings).where("partnerId", "==", partnerId).where("createdAt", ">=", month)),
    getDocs<PartnerEarning>(db.collection(C.earnings).where("partnerId", "==", partnerId).where("isSettled", "==", false)),
    deliveredToday(partnerId),
    getSetting("delivery"),
  ]);
  const sum = (from: Date) => recent.filter((e) => e.createdAt >= from).reduce((t, e) => t + e.amountPaise, 0);
  return {
    todayPaise: sum(day), last7DaysPaise: sum(week), last30DaysPaise: sum(month), unsettledPaise: unsettled.reduce((t, e) => t + e.amountPaise, 0), deliveriesToday,
    incentive: { target: s.dailyIncentiveTarget, bonusPaise: s.dailyIncentivePaise, progress: Math.min(deliveriesToday, s.dailyIncentiveTarget), achieved: deliveriesToday >= s.dailyIncentiveTarget },
  };
}
