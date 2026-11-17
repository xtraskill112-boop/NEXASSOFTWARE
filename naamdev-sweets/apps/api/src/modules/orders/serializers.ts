import { prisma, type Prisma } from "@naamdev/db";
import { estimateTravelMinutes, haversineKm } from "@naamdev/shared";

export const orderInclude = {
  items: { include: { product: { select: { slug: true } } } },
  statusHistory: { orderBy: { createdAt: "asc" } },
  payments: { orderBy: { createdAt: "desc" } },
  refunds: { orderBy: { createdAt: "desc" } },
  returnRequests: { orderBy: { createdAt: "desc" } },
  store: true,
  assignments: {
    orderBy: { createdAt: "desc" },
    include: { partner: { include: { user: { select: { name: true, phone: true, avatarUrl: true } } } } },
  },
} satisfies Prisma.OrderInclude;

export type OrderFull = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

const ACTIVE_ASSIGNMENT = ["ACCEPTED", "AT_STORE", "PICKED_UP", "OUT_FOR_DELIVERY"];
const OTP_VISIBLE = ["DISPATCHED", "OUT_FOR_DELIVERY"];

export function customerOrder(o: OrderFull) {
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
      id: i.id, productId: i.productId, productSlug: i.product.slug, variantId: i.variantId, name: i.productName, variantLabel: i.variantLabel,
      sku: i.sku, imageUrl: i.imageUrl, unitMrpPaise: i.unitMrpPaise, unitPricePaise: i.unitPricePaise, quantity: i.quantity,
      lineTotalPaise: i.lineTotalPaise, discountPaise: i.discountPaise, gstRate: i.gstRate, taxPaise: i.taxPaise,
    })),
    timeline: o.statusHistory.map((h) => ({ status: h.toStatus, at: h.createdAt, note: h.actorType === "STAFF" ? null : h.note })),
    payments: o.payments.map((p) => ({ id: p.id, method: p.method, provider: p.provider, status: p.status, amountPaise: p.amountPaise, methodDetail: p.methodDetail, gatewayPaymentId: p.gatewayPaymentId, capturedAt: p.capturedAt, createdAt: p.createdAt })),
    refunds: o.refunds.map((r) => ({ id: r.id, amountPaise: r.amountPaise, status: r.status, method: r.method, reason: r.reason, createdAt: r.createdAt, processedAt: r.processedAt })),
    returnRequests: o.returnRequests.map((r) => ({ id: r.id, reason: r.reason, status: r.status, resolutionNote: r.resolutionNote, createdAt: r.createdAt })),
    store: o.store ? { name: o.store.name, phone: o.store.phone, address: `${o.store.addressLine}, ${o.store.city}`, lat: o.store.lat, lng: o.store.lng } : null,
    deliveryPartner: assignment
      ? { name: assignment.partner.user.name, phone: assignment.partner.user.phone, avatarUrl: assignment.partner.user.avatarUrl, vehicleType: assignment.partner.vehicleType, vehicleNumber: assignment.partner.vehicleNumber, rating: assignment.partner.rating, assignmentStatus: assignment.status }
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
    const fresh = assignment.partner.lastLocationAt && Date.now() - assignment.partner.lastLocationAt.getTime() < 3 * 60_000;
    if (fresh && assignment.partner.currentLat != null && assignment.partner.currentLng != null) {
      partnerLocation = { lat: assignment.partner.currentLat, lng: assignment.partner.currentLng, heading: null, at: assignment.partner.lastLocationAt! };
      const target = ["PICKED_UP", "OUT_FOR_DELIVERY"].includes(assignment.status) ? drop : pickup;
      if (target) etaMinutes = estimateTravelMinutes(haversineKm(partnerLocation, target)) + (target === pickup && drop && pickup ? estimateTravelMinutes(haversineKm(pickup, drop)) : 0);
    }
    const pts = await prisma.trackingPoint.findMany({ where: { assignmentId: assignment.id }, orderBy: { recordedAt: "desc" }, take: 40, select: { lat: true, lng: true } });
    path = pts.reverse();
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
