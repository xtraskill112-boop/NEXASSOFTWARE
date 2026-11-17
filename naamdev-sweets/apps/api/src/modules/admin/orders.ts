import { Router } from "express";
import { z } from "zod";
import { prisma, type Prisma } from "@naamdev/db";
import {
  ORDER_STATUSES, PROCESS_TRANSITIONS, hasPermission, nextStatuses, orderNoteSchema, orderStatusUpdateSchema, paginationSchema, refundCreateSchema,
  type OrderStatus,
} from "@naamdev/shared";
import { audit } from "../../lib/audit";
import { badRequest, forbidden, notFound } from "../../lib/errors";
import { body, pageMeta, paginate, param, query } from "../../lib/http";
import { requireAnyPermission, requirePermission } from "../../middleware/auth";
import { assignPartner, autoOfferDelivery } from "../delivery/service";
import { notify } from "../notifications/service";
import { orderInclude, customerOrder, trackingPayload } from "../orders/serializers";
import { changeOrderStatus, createRefund, settleGatewayRefund } from "../orders/service";
import { razorpay } from "../payments/razorpay";

export const adminOrdersRouter = Router();

const listQuery = paginationSchema.extend({
  status: z.string().optional(),
  q: z.string().trim().max(60).optional(),
  payment: z.enum(["ONLINE", "COD"]).optional(),
  paymentStatus: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  view: z.enum(["all", "active", "kitchen", "unassigned"]).default("all"),
});

adminOrdersRouter.get("/", requirePermission("orders.view"), async (req, res) => {
  const q = query(req, listQuery);
  const where: Prisma.OrderWhereInput = {};
  const statuses = q.status?.split(",").filter((s): s is OrderStatus => (ORDER_STATUSES as readonly string[]).includes(s));
  if (statuses?.length) where.status = { in: statuses };
  if (q.view === "active") where.status = { in: ["CONFIRMED", "PROCESSING", "PREPARING", "PACKED", "READY_FOR_PICKUP", "DISPATCHED", "OUT_FOR_DELIVERY"] };
  if (q.view === "kitchen") where.status = { in: ["CONFIRMED", "PROCESSING", "PREPARING", "PACKED"] };
  if (q.view === "unassigned") {
    where.status = { in: ["CONFIRMED", "PROCESSING", "PREPARING", "PACKED", "READY_FOR_PICKUP"] };
    where.assignments = { none: { status: { in: ["OFFERED", "ACCEPTED", "AT_STORE", "PICKED_UP", "OUT_FOR_DELIVERY"] } } };
  }
  if (q.payment) where.paymentMethod = q.payment;
  if (q.paymentStatus) where.paymentStatus = q.paymentStatus as never;
  if (q.from || q.to) where.createdAt = { gte: q.from, lte: q.to };
  if (q.q) where.OR = [{ orderNumber: { contains: q.q, mode: "insensitive" } }, { customerName: { contains: q.q, mode: "insensitive" } }, { customerPhone: { contains: q.q } }];
  const [total, orders, counts] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where, orderBy: { createdAt: "desc" }, ...paginate(q.page, q.pageSize),
      include: { items: { select: { quantity: true, productName: true, variantLabel: true } }, assignments: { where: { status: { notIn: ["REJECTED", "EXPIRED", "CANCELLED"] } }, include: { partner: { include: { user: { select: { name: true } } } } }, orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    prisma.order.groupBy({ by: ["status"], _count: true }),
  ]);
  res.json({
    items: orders.map((o) => ({
      id: o.id, orderNumber: o.orderNumber, status: o.status, paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus, totalPaise: o.totalPaise,
      customerName: o.customerName, customerPhone: o.customerPhone, pincode: o.deliveryPincode, createdAt: o.createdAt, estimatedDeliveryAt: o.estimatedDeliveryAt,
      itemCount: o.items.reduce((s, i) => s + i.quantity, 0), itemsSummary: o.items.map((i) => `${i.quantity}× ${i.productName} (${i.variantLabel})`).join(", "),
      partner: o.assignments[0] ? { name: o.assignments[0].partner.user.name, status: o.assignments[0].status } : null,
    })),
    meta: pageMeta(total, q.page, q.pageSize),
    statusCounts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
  });
});

async function adminOrder(id: string) {
  const o = await prisma.order.findUnique({
    where: { id },
    include: {
      ...orderInclude,
      notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
      statusHistory: { orderBy: { createdAt: "asc" }, include: { changedBy: { select: { name: true } } } },
      user: { select: { id: true, name: true, email: true, phone: true, createdAt: true, _count: { select: { orders: true } } } },
      items: { include: { product: { select: { slug: true } }, allocations: { include: { batch: { select: { batchNumber: true, expiresAt: true } } } } } },
    },
  });
  if (!o) throw notFound("Order");
  return o;
}

adminOrdersRouter.get("/:id", requirePermission("orders.view"), async (req, res) => {
  const o = await adminOrder(param(req, "id"));
  const perms = req.auth!.permissions;
  const allowed = nextStatuses(o.status).filter((s) => {
    if (s === "CANCELLED") return perms.includes("orders.cancel");
    if (s === "REFUND_INITIATED" || s === "REFUNDED") return false; // driven by refunds
    if (PROCESS_TRANSITIONS.includes(s)) return perms.includes("orders.process") || perms.includes("orders.manage");
    return perms.includes("orders.manage");
  });
  res.json({
    order: {
      ...customerOrder(o),
      deliveryOtp: perms.includes("orders.manage") ? o.deliveryOtp : null,
      customer: o.user,
      notes: o.notes,
      history: o.statusHistory.map((h) => ({ id: h.id, from: h.fromStatus, to: h.toStatus, note: h.note, actorType: h.actorType, actor: h.changedBy?.name ?? null, at: h.createdAt })),
      allocations: o.items.map((i) => ({ itemId: i.id, batches: i.allocations.map((a) => ({ batchNumber: a.batch.batchNumber, expiresAt: a.batch.expiresAt, quantity: a.quantity, released: !!a.releasedAt })) })),
      assignments: o.assignments.map((a) => ({ id: a.id, status: a.status, partnerId: a.partnerId, partnerName: a.partner.user.name, partnerPhone: a.partner.user.phone, distanceKm: a.distanceKm, earningPaise: a.earningPaise, offeredAt: a.offeredAt, pickedUpAt: a.pickedUpAt, deliveredAt: a.deliveredAt, rejectionReason: a.rejectionReason })),
      returnRequests: o.returnRequests,
      payments: o.payments,
      refunds: o.refunds,
    },
    allowedTransitions: allowed,
    tracking: await trackingPayload(o),
  });
});

adminOrdersRouter.post("/:id/status", requireAnyPermission("orders.process", "orders.manage", "orders.cancel"), async (req, res) => {
  const { status, note } = body(req, orderStatusUpdateSchema);
  const perms = req.auth!.permissions;
  const ok =
    status === "CANCELLED" ? hasPermission(perms, "orders.cancel")
    : PROCESS_TRANSITIONS.includes(status) ? hasPermission(perms, "orders.process") || hasPermission(perms, "orders.manage")
    : status === "REFUND_INITIATED" || status === "REFUNDED" ? false
    : hasPermission(perms, "orders.manage");
  if (!ok) throw forbidden(status === "REFUND_INITIATED" || status === "REFUNDED" ? "Use the refund action to refund an order." : undefined);
  if (status === "CANCELLED" && !note) throw badRequest("Add a cancellation reason.");
  const id = param(req, "id");
  const before = await prisma.order.findUniqueOrThrow({ where: { id }, select: { status: true } });
  await changeOrderStatus(id, status, { type: "STAFF", userId: req.auth!.user.id }, note);
  await audit(req, "order.status", "Order", id, { from: before.status, to: status, note });
  res.json({ ok: true });
});

adminOrdersRouter.post("/:id/notes", requirePermission("orders.view"), async (req, res) => {
  const { body: text } = body(req, orderNoteSchema);
  const note = await prisma.orderNote.create({ data: { orderId: param(req, "id"), authorId: req.auth!.user.id, body: text }, include: { author: { select: { name: true } } } });
  res.status(201).json({ note });
});

adminOrdersRouter.post("/:id/assign", requirePermission("delivery.manage"), async (req, res) => {
  const { partnerId, force } = body(req, z.object({ partnerId: z.string().optional(), force: z.boolean().default(false) }));
  const id = param(req, "id");
  const a = partnerId ? await assignPartner(id, partnerId, force) : await autoOfferDelivery(id);
  if (!a) throw badRequest("No delivery partner is online near the store right now. Try again shortly or assign manually.");
  await audit(req, "order.assign", "Order", id, { partnerId: a.partnerId, force });
  res.json({ assignment: a });
});

adminOrdersRouter.post("/:id/refunds", requirePermission("refunds.manage"), async (req, res) => {
  const input = body(req, refundCreateSchema);
  const refund = await createRefund({ orderId: param(req, "id"), ...input }, { type: "STAFF", userId: req.auth!.user.id });
  await audit(req, "refund.create", "Order", param(req, "id"), { amountPaise: input.amountPaise, method: refund.method });
  res.status(201).json({ refund });
});

adminOrdersRouter.post("/refunds/:refundId/sync", requirePermission("refunds.manage"), async (req, res) => {
  const refund = await prisma.refund.findUnique({ where: { id: param(req, "refundId") } });
  if (!refund?.gatewayRefundId) throw badRequest("This refund has no gateway reference.");
  const r = await razorpay.fetchRefund(refund.gatewayRefundId);
  const updated = r.status === "pending" ? refund : await settleGatewayRefund(refund.gatewayRefundId, r.status);
  res.json({ refund: updated, gatewayStatus: r.status });
});

adminOrdersRouter.post("/returns/:returnId/decision", requirePermission("refunds.manage"), async (req, res) => {
  const { decision, note, refundAmountPaise } = body(req, z.object({ decision: z.enum(["APPROVE", "REJECT"]), note: z.string().trim().max(500).optional(), refundAmountPaise: z.number().int().positive().optional() }));
  const rr = await prisma.returnRequest.findUnique({ where: { id: param(req, "returnId") }, include: { order: true } });
  if (!rr || rr.status !== "REQUESTED") throw badRequest("This return request has already been handled.");
  if (decision === "REJECT") {
    await prisma.returnRequest.update({ where: { id: rr.id }, data: { status: "REJECTED", resolutionNote: note } });
    notify({ userId: rr.userId, type: "SUPPORT", title: "Return request update", body: `We couldn't approve the return for ${rr.order.orderNumber}. ${note ?? ""}`.trim(), link: `/account/orders/${rr.orderId}`, template: "return.rejected", channels: ["IN_APP", "EMAIL"] });
  } else {
    await prisma.returnRequest.update({ where: { id: rr.id }, data: { resolutionNote: note } });
    await createRefund({ orderId: rr.orderId, amountPaise: refundAmountPaise ?? rr.order.totalPaise - rr.order.refundedPaise, reason: `Return approved: ${rr.reason}`, returnRequestId: rr.id, method: rr.order.paymentMethod === "COD" ? "MANUAL" : "GATEWAY", reference: rr.order.paymentMethod === "COD" ? note ?? "Manual refund — return approved" : undefined }, { type: "STAFF", userId: req.auth!.user.id });
    await prisma.returnRequest.update({ where: { id: rr.id }, data: { status: "COMPLETED" } });
  }
  await audit(req, `return.${decision.toLowerCase()}`, "ReturnRequest", rr.id, { note });
  res.json({ ok: true });
});

// ── Payments & refunds ledgers ──
export const adminPaymentsRouter = Router();

adminPaymentsRouter.get("/", requirePermission("payments.view"), async (req, res) => {
  const q = query(req, paginationSchema.extend({ status: z.string().optional(), method: z.enum(["ONLINE", "COD"]).optional() }));
  const where: Prisma.PaymentWhereInput = { ...(q.status ? { status: q.status as never } : {}), ...(q.method ? { method: q.method } : {}) };
  const [total, items, agg] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({ where, orderBy: { createdAt: "desc" }, include: { order: { select: { orderNumber: true, customerName: true } } }, ...paginate(q.page, q.pageSize) }),
    prisma.payment.groupBy({ by: ["status", "method"], _sum: { amountPaise: true }, _count: true }),
  ]);
  res.json({ items: items.map(({ raw: _raw, ...p }) => p), meta: pageMeta(total, q.page, q.pageSize), summary: agg });
});

adminPaymentsRouter.get("/refunds", requireAnyPermission("refunds.manage", "payments.view"), async (req, res) => {
  const q = query(req, paginationSchema.extend({ status: z.string().optional() }));
  const where: Prisma.RefundWhereInput = q.status ? { status: q.status as never } : {};
  const [total, items] = await Promise.all([
    prisma.refund.count({ where }),
    prisma.refund.findMany({ where, orderBy: { createdAt: "desc" }, include: { order: { select: { orderNumber: true, customerName: true } }, initiatedBy: { select: { name: true } } }, ...paginate(q.page, q.pageSize) }),
  ]);
  res.json({ items, meta: pageMeta(total, q.page, q.pageSize) });
});

adminPaymentsRouter.get("/returns", requireAnyPermission("refunds.manage", "orders.view"), async (req, res) => {
  const q = query(req, paginationSchema.extend({ status: z.string().optional() }));
  const where: Prisma.ReturnRequestWhereInput = q.status ? { status: q.status as never } : {};
  const [total, items] = await Promise.all([
    prisma.returnRequest.count({ where }),
    prisma.returnRequest.findMany({ where, orderBy: { createdAt: "desc" }, include: { order: { select: { orderNumber: true, totalPaise: true, paymentMethod: true } }, user: { select: { name: true } } }, ...paginate(q.page, q.pageSize) }),
  ]);
  res.json({ items, meta: pageMeta(total, q.page, q.pageSize) });
});
