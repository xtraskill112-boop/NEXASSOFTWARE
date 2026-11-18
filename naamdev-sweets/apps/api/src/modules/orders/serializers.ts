import {
  C, db, getDocs, getMany, SUB, whereIn,
  type DeliveryAssignment, type DeliveryPartner, type Order, type Payment, type Refund, type ReturnRequest, type Store, type TrackingPoint, type User, type WithId,
} from "@naamdev/db";
import { estimateTravelMinutes, haversineKm } from "@naamdev/shared";
import { catalog } from "../catalog/cache";
import { defaultStore } from "../catalog/service";

export interface OrderFull extends WithId<Order> {
  payments: WithId<Payment>[];
  refunds: WithId<Refund>[];
  returnRequests: WithId<ReturnRequest>[];
  store: WithId<Store> | null;
  assignments: (WithId<DeliveryAssignment> & { partner: WithId<DeliveryPartner> & { avatarUrl: string | null } })[];
}

const desc = <T extends { createdAt: Date }>(xs: T[]) => xs.sort((a, b) => +b.createdAt - +a.createdAt);

/** Attaches payments, refunds, returns, store and assignments to orders (constant number of queries). */
export async function loadOrdersFull(orders: WithId<Order>[]): Promise<OrderFull[]> {
  if (!orders.length) return [];
  const ids = orders.map((o) => o.id);
  const [payments, refunds, returns, assignments, store] = await Promise.all([
    whereIn<Payment>(C.payments, "orderId", ids),
    whereIn<Refund>(C.refunds, "orderId", ids),
    whereIn<ReturnRequest>(C.returns, "orderId", ids),
    whereIn<DeliveryAssignment>(C.assignments, "orderId", ids),
    defaultStore(),
  ]);
  const partnerIds = [...new Set(assignments.map((a) => a.partnerId))];
  const [partners, partnerUsers] = await Promise.all([getMany<DeliveryPartner>(C.partners, partnerIds), getMany<User>(C.users, partnerIds)]);
  const partnerById = new Map(partners.map((p) => [p.id, { ...p, avatarUrl: partnerUsers.find((u) => u.id === p.id)?.avatarUrl ?? null }]));
  return orders.map((o) => ({
    ...o,
    payments: desc(payments.filter((p) => p.orderId === o.id)),
    refunds: desc(refunds.filter((r) => r.orderId === o.id)),
    returnRequests: desc(returns.filter((r) => r.orderId === o.id)),
    store: store && (!o.storeId || o.storeId === store.id) ? store : null,
    assignments: desc(assignments.filter((a) => a.orderId === o.id))
      .map((a) => ({ ...a, partner: partnerById.get(a.partnerId)! }))
      .filter((a) => !!a.partner),
  }));
}

export async function loadOrderFull(order: WithId<Order>): Promise<OrderFull> {
  return (await loadOrdersFull([order]))[0]!;
}

const ACTIVE_ASSIGNMENT = ["ACCEPTED", "AT_STORE", "PICKED_UP", "OUT_FOR_DELIVERY"];
const OTP_VISIBLE = ["DISPATCHED", "OUT_FOR_DELIVERY"];

export async function customerOrder(o: OrderFull) {
  const snap = await catalog();
  const assignment = o.assignments.find((a) => ACTIVE_ASSIGNMENT.includes(a.status) || a.status === "DELIVERED") ?? null;
  const showOtp = OTP_VISIBLE.includes(o.status);
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    invoiceNumber: o.invoiceNumber,
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    placedAt: o.placedAt,
    confirmedAt: o.confirmedAt,
    dispatchedAt: o.dispatchedAt,
    deliveredAt: o.deliveredAt,
    cancelledAt: o.cancelledAt,
    cancelReason: o.cancelReason,
    estimatedDeliveryAt: o.estimatedDeliveryAt,
    reservationExpiresAt: o.reservationExpiresAt,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    customerEmail: o.customerEmail,
    address: o.addressSnapshot,
    deliveryInstructions: o.deliveryInstructions,
    customerNote: o.customerNote,
    deliveryOtp: showOtp ? o.deliveryOtp : null,
    totals: {
      mrpTotalPaise: o.mrpTotalPaise, subtotalPaise: o.subtotalPaise, itemDiscountPaise: o.itemDiscountPaise,
      couponDiscountPaise: o.couponDiscountPaise, loyaltyDiscountPaise: o.loyaltyDiscountPaise, deliveryFeePaise: o.deliveryFeePaise,
      taxPaise: o.taxPaise, totalPaise: o.totalPaise, refundedPaise: o.refundedPaise,
    },
    couponCode: o.couponCode,
    pointsRedeemed: o.pointsRedeemed,
    pointsEarned: o.pointsEarned,
    items: o.items.map((i) => ({
      id: i.id, productId: i.productId, productSlug: snap.byId.get(i.productId)?.slug ?? null, variantId: i.variantId, name: i.productName, variantLabel: i.variantLabel,
      sku: i.sku, imageUrl: i.imageUrl, unitMrpPaise: i.unitMrpPaise, unitPricePaise: i.unitPricePaise, quantity: i.quantity,
      lineTotalPaise: i.lineTotalPaise, discountPaise: i.discountPaise, gstRate: i.gstRate, taxPaise: i.taxPaise,
    })),
    timeline: o.history.map((h) => ({ status: h.toStatus, at: h.createdAt, note: h.actorType === "STAFF" ? null : h.note })),
    payments: o.payments.map((p) => ({ id: p.id, method: p.method, provider: p.provider, status: p.status, amountPaise: p.amountPaise, methodDetail: p.methodDetail, gatewayPaymentId: p.gatewayPaymentId, capturedAt: p.capturedAt, createdAt: p.createdAt })),
    refunds: o.refunds.map((r) => ({ id: r.id, amountPaise: r.amountPaise, status: r.status, method: r.method, reason: r.reason, createdAt: r.createdAt, processedAt: r.processedAt })),
    returnRequests: o.returnRequests.map((r) => ({ id: r.id, reason: r.reason, status: r.status, resolutionNote: r.resolutionNote, createdAt: r.createdAt })),
    store: o.store ? { name: o.store.name, phone: o.store.phone, address: `${o.store.addressLine}, ${o.store.city}`, lat: o.store.lat, lng: o.store.lng } : null,
    deliveryPartner: assignment
      ? { name: assignment.partner.name, phone: assignment.partner.phone, avatarUrl: assignment.partner.avatarUrl, vehicleType: assignment.partner.vehicleType, vehicleNumber: assignment.partner.vehicleNumber, rating: assignment.partner.rating, assignmentStatus: assignment.status }
      : null,
  };
}

/** Live tracking payload. Partner location is only shown when it is genuinely fresh. */
export async function trackingPayload(o: OrderFull) {
  const assignment = o.assignments.find((a) => ACTIVE_ASSIGNMENT.includes(a.status)) ?? null;
  const drop = o.deliveryLat != null && o.deliveryLng != null ? { lat: o.deliveryLat, lng: o.deliveryLng } : null;
  const pickup = o.store ? { lat: o.store.lat, lng: o.store.lng } : null;
  let partnerLocation: { lat: number; lng: number; heading: number | null; at: Date } | null = null;
  let path: { lat: number; lng: number }[] = [];
  let etaMinutes: number | null = null;
  if (assignment) {
    const p = assignment.partner;
    const fresh = p.lastLocationAt && Date.now() - p.lastLocationAt.getTime() < 3 * 60_000;
    if (fresh && p.currentLat != null && p.currentLng != null) {
      partnerLocation = { lat: p.currentLat, lng: p.currentLng, heading: null, at: p.lastLocationAt! };
      const target = ["PICKED_UP", "OUT_FOR_DELIVERY"].includes(assignment.status) ? drop : pickup;
      if (target) etaMinutes = estimateTravelMinutes(haversineKm(partnerLocation, target)) + (target === pickup && drop && pickup ? estimateTravelMinutes(haversineKm(pickup, drop)) : 0);
    }
    const pts = await getDocs<TrackingPoint>(db.collection(C.orders).doc(o.id).collection(SUB.tracking).orderBy("recordedAt", "desc").limit(60));
    path = pts.filter((x) => x.assignmentId === assignment.id).slice(0, 40).map((x) => ({ lat: x.lat, lng: x.lng })).reverse();
  }
  return {
    orderId: o.id,
    status: o.status,
    estimatedDeliveryAt: o.estimatedDeliveryAt,
    pickup,
    drop,
    partnerLocation,
    path,
    etaMinutes,
    assignmentStatus: assignment?.status ?? null,
  };
}
