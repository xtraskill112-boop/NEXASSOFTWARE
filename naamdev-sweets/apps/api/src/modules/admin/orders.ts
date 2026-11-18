import { Router } from "express";
import { AggregateField } from "firebase-admin/firestore";
import { z } from "zod";
import {
  C, countOf, db, FieldValue, getDoc, getDocs, getMany, newId, whereIn,
  type DeliveryAssignment, type DeliveryPartner, type InventoryBatch, type Order, type Payment, type Refund, type ReturnRequest, type User, type WithId,
} from "@naamdev/db";
import {
  ORDER_STATUSES, PROCESS_TRANSITIONS, hasPermission, nextStatuses, orderNoteSchema, orderStatusUpdateSchema, paginationSchema, refundCreateSchema,
  type OrderStatus,
} from "@naamdev/shared";
import { audit } from "../../lib/audit";
import { badRequest, forbidden, notFound } from "../../lib/errors";
import { body, pageOf, param, query } from "../../lib/http";
import { requireAnyPermission, requirePermission } from "../../middleware/auth";
import { assignPartner, autoOfferDelivery } from "../delivery/service";
import { notify } from "../notifications/service";
import { customerOrder, loadOrderFull, trackingPayload } from "../orders/serializers";
import { changeOrderStatus, createRefund, settleGatewayRefund } from "../orders/service";
import { razorpay } from "../payments/razorpay";

export const adminOrdersRouter = Router();
const orders = () => db.collection(C.orders);
const BUSY = ["OFFERED", "ACCEPTED", "AT_STORE", "PICKED_UP", "OUT_FOR_DELIVERY"];
/** Console lists scan the most recent orders; older ones are reachable by date range or search. */
const SCAN_LIMIT = 2000;

const listQuery = paginationSchema.extend({
  status: z.string().optional(),
  q: z.string().trim().max(60).optional(),
  payment: z.enum(["ONLINE", "COD"]).optional(),
  paymentStatus: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  view: z.enum(["all", "active", "kitchen", "unassigned"]).default("all"),
});

const actorOf = (req: { auth?: { user: { id: string; name: string } } }) => ({ type: "STAFF" as const, userId: req.auth!.user.id, name: req.auth!.user.name });

adminOrdersRouter.get("/", requirePermission("orders.view"), async (req, res) => {
  const q = query(req, listQuery);
  let ref = orders().orderBy("createdAt", "desc");
  if (q.from) ref = ref.where("createdAt", ">=", q.from);
  if (q.to) ref = ref.where("createdAt", "<=", q.to);
  const [all, counts] = await Promise.all([
    getDocs<Order>(ref.limit(SCAN_LIMIT)),
    Promise.all(ORDER_STATUSES.map(async (s) => [s, await countOf(orders().where("status", "==", s))] as const)),
  ]);

  let statuses = q.status?.split(",").filter((s): s is OrderStatus => (ORDER_STATUSES as readonly string[]).includes(s));
  if (q.view === "active") statuses = ["CONFIRMED", "PROCESSING", "PREPARING", "PACKED", "READY_FOR_PICKUP", "DISPATCHED", "OUT_FOR_DELIVERY"];
  if (q.view === "kitchen") statuses = ["CONFIRMED", "PROCESSING", "PREPARING", "PACKED"];
  if (q.view === "unassigned") statuses = ["CONFIRMED", "PROCESSING", "PREPARING", "PACKED", "READY_FOR_PICKUP"];
  const busyOrders = q.view === "unassigned" ? new Set((await getDocs<DeliveryAssignment>(db.collection(C.assignments).where("status", "in", BUSY))).map((a) => a.orderId)) : null;
  const term = q.q?.toLowerCase();
  const filtered = all.filter(
    (o) =>
      (!statuses?.length || statuses.includes(o.status)) &&
      (!busyOrders || !busyOrders.has(o.id)) &&
      (!q.payment || o.paymentMethod === q.payment) &&
      (!q.paymentStatus || o.paymentStatus === q.paymentStatus) &&
      (!term || o.searchText.includes(term)),
  );
  const pg = pageOf(filtered, q.page, q.pageSize);
  const assignments = await whereIn<DeliveryAssignment>(C.assignments, "orderId", pg.items.map((o) => o.id));
  const live = assignments.filter((a) => !["REJECTED", "EXPIRED", "CANCELLED"].includes(a.status)).sort((a, b) => +b.createdAt - +a.createdAt);
  const partners = new Map((await getMany<DeliveryPartner>(C.partners, live.map((a) => a.partnerId))).map((p) => [p.id, p]));
  res.json({
    items: pg.items.map((o) => {
      const a = live.find((x) => x.orderId === o.id);
      return {
        id: o.id, orderNumber: o.orderNumber, status: o.status, paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus, totalPaise: o.totalPaise,
        customerName: o.customerName, customerPhone: o.customerPhone, pincode: o.deliveryPincode, createdAt: o.createdAt, estimatedDeliveryAt: o.estimatedDeliveryAt,
        itemCount: o.items.reduce((s, i) => s + i.quantity, 0), itemsSummary: o.items.map((i) => `${i.quantity}× ${i.productName} (${i.variantLabel})`).join(", "),
        partner: a ? { name: partners.get(a.partnerId)?.name ?? "Partner", status: a.status } : null,
      };
    }),
    meta: pg.meta,
    statusCounts: Object.fromEntries(counts.filter(([, n]) => n > 0)),
  });
});

async function adminOrder(id: string) {
  const o = await getDoc<Order>(orders().doc(id));
  if (!o) throw notFound("Order");
  const [full, user, orderCount, batches] = await Promise.all([
    loadOrderFull(o),
    getDoc<User>(db.collection(C.users).doc(o.userId)),
    countOf(orders().where("userId", "==", o.userId)),
    getMany<InventoryBatch>(C.batches, o.items.flatMap((i) => i.allocations.map((a) => a.batchId))),
  ]);
  return { full, user, orderCount, batches: new Map(batches.map((b) => [b.id, b])) };
}

adminOrdersRouter.get("/:id", requirePermission("orders.view"), async (req, res) => {
  const { full: o, user, orderCount, batches } = await adminOrder(param(req, "id"));
  const perms = req.auth!.permissions;
  const allowed = nextStatuses(o.status).filter((s) => {
    if (s === "CANCELLED") return perms.includes("orders.cancel");
    if (s === "REFUND_INITIATED" || s === "REFUNDED") return false; // driven by refunds
    if (PROCESS_TRANSITIONS.includes(s)) return perms.includes("orders.process") || perms.includes("orders.manage");
    return perms.includes("orders.manage");
  });
  res.json({
    order: {
      ...(await customerOrder(o)),
      deliveryOtp: perms.includes("orders.manage") ? o.deliveryOtp : null,
      customer: user ? { id: user.id, name: user.name, email: user.email, phone: user.phone, createdAt: user.createdAt, _count: { orders: orderCount } } : null,
      notes: [...o.notes].sort((a, b) => +b.createdAt - +a.createdAt).map((n) => ({ ...n, author: { name: n.authorName } })),
      history: o.history.map((h) => ({ id: h.id, from: h.fromStatus, to: h.toStatus, note: h.note, actorType: h.actorType, actor: h.changedByName, at: h.createdAt })),
      allocations: o.items.map((i) => ({
        itemId: i.id,
        batches: i.allocations.map((a) => ({ batchNumber: batches.get(a.batchId)?.batchNumber ?? "—", expiresAt: batches.get(a.batchId)?.expiresAt ?? null, quantity: a.quantity, released: !!a.releasedAt })),
      })),
      assignments: o.assignments.map((a) => ({ id: a.id, status: a.status, partnerId: a.partnerId, partnerName: a.partner.name, partnerPhone: a.partner.phone, distanceKm: a.distanceKm, earningPaise: a.earningPaise, offeredAt: a.offeredAt, pickedUpAt: a.pickedUpAt, deliveredAt: a.deliveredAt, rejectionReason: a.rejectionReason })),
      returnRequests: o.returnRequests,
      payments: o.payments.map(({ raw: _raw, ...p }) => p),
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
  const before = await getDoc<Order>(orders().doc(id));
  if (!before) throw notFound("Order");
  await changeOrderStatus(id, status, actorOf(req), note);
  await audit(req, "order.status", "Order", id, { from: before.status, to: status, note });
  res.json({ ok: true });
});

adminOrdersRouter.post("/:id/notes", requirePermission("orders.view"), async (req, res) => {
  const { body: text } = body(req, orderNoteSchema);
  const id = param(req, "id");
  if (!(await orders().doc(id).get()).exists) throw notFound("Order");
  const note = { id: newId(), authorId: req.auth!.user.id, authorName: req.auth!.user.name, body: text, createdAt: new Date() };
  await orders().doc(id).update({ notes: FieldValue.arrayUnion(note) });
  res.status(201).json({ note: { ...note, author: { name: note.authorName } } });
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
  const refund = await createRefund({ orderId: param(req, "id"), ...input }, actorOf(req));
  await audit(req, "refund.create", "Order", param(req, "id"), { amountPaise: input.amountPaise, method: refund.method });
  res.status(201).json({ refund });
});

adminOrdersRouter.post("/refunds/:refundId/sync", requirePermission("refunds.manage"), async (req, res) => {
  const refund = await getDoc<Refund>(db.collection(C.refunds).doc(param(req, "refundId")));
  if (!refund?.gatewayRefundId) throw badRequest("This refund has no gateway reference.");
  const r = await razorpay.fetchRefund(refund.gatewayRefundId);
  const updated = r.status === "pending" ? refund : await settleGatewayRefund(refund.gatewayRefundId, r.status);
  res.json({ refund: updated, gatewayStatus: r.status });
});

adminOrdersRouter.post("/returns/:returnId/decision", requirePermission("refunds.manage"), async (req, res) => {
  const { decision, note, refundAmountPaise } = body(req, z.object({ decision: z.enum(["APPROVE", "REJECT"]), note: z.string().trim().max(500).optional(), refundAmountPaise: z.number().int().positive().optional() }));
  const ref = db.collection(C.returns).doc(param(req, "returnId"));
  const rr = await getDoc<ReturnRequest>(ref);
  if (!rr || rr.status !== "REQUESTED") throw badRequest("This return request has already been handled.");
  const order = (await getDoc<Order>(orders().doc(rr.orderId)))!;
  if (decision === "REJECT") {
    await ref.update({ status: "REJECTED", resolutionNote: note ?? null, updatedAt: new Date() });
    notify({ userId: rr.userId, type: "SUPPORT", title: "Return request update", body: `We couldn't approve the return for ${order.orderNumber}. ${note ?? ""}`.trim(), link: `/account/orders/${rr.orderId}`, template: "return.rejected", channels: ["IN_APP", "EMAIL"] });
  } else {
    await ref.update({ resolutionNote: note ?? null, updatedAt: new Date() });
    await createRefund(
      {
        orderId: rr.orderId, amountPaise: refundAmountPaise ?? order.totalPaise - order.refundedPaise, reason: `Return approved: ${rr.reason}`, returnRequestId: rr.id,
        method: order.paymentMethod === "COD" ? "MANUAL" : "GATEWAY", reference: order.paymentMethod === "COD" ? note ?? "Manual refund — return approved" : undefined,
      },
      actorOf(req),
    );
    await ref.update({ status: "COMPLETED", updatedAt: new Date() });
  }
  await audit(req, `return.${decision.toLowerCase()}`, "ReturnRequest", rr.id, { note });
  res.json({ ok: true });
});

// ── Payments & refunds ledgers ──
export const adminPaymentsRouter = Router();

async function orderRefs(ids: string[]) {
  return new Map((await getMany<Order>(C.orders, ids)).map((o) => [o.id, o]));
}

adminPaymentsRouter.get("/", requirePermission("payments.view"), async (req, res) => {
  const q = query(req, paginationSchema.extend({ status: z.string().optional(), method: z.enum(["ONLINE", "COD"]).optional() }));
  const recent = await getDocs<Payment>(db.collection(C.payments).orderBy("createdAt", "desc").limit(SCAN_LIMIT));
  const filtered = recent.filter((p) => (!q.status || p.status === q.status) && (!q.method || p.method === q.method));
  const pg = pageOf(filtered, q.page, q.pageSize);
  const ords = await orderRefs(pg.items.map((p) => p.orderId));
  const summary: { status: string; method: string; _sum: { amountPaise: number }; _count: number }[] = [];
  for (const status of ["CREATED", "AUTHORIZED", "CAPTURED", "FAILED", "REFUNDED"])
    for (const method of ["ONLINE", "COD"]) {
      const agg = await db.collection(C.payments).where("status", "==", status).where("method", "==", method)
        .aggregate({ total: AggregateField.sum("amountPaise"), n: AggregateField.count() }).get();
      const d = agg.data();
      if (d.n) summary.push({ status, method, _sum: { amountPaise: d.total ?? 0 }, _count: d.n });
    }
  res.json({
    items: pg.items.map(({ raw: _raw, ...p }) => ({ ...p, order: ords.get(p.orderId) ? { orderNumber: ords.get(p.orderId)!.orderNumber, customerName: ords.get(p.orderId)!.customerName } : null })),
    meta: pg.meta,
    summary,
  });
});

adminPaymentsRouter.get("/refunds", requireAnyPermission("refunds.manage", "payments.view"), async (req, res) => {
  const q = query(req, paginationSchema.extend({ status: z.string().optional() }));
  const recent = await getDocs<Refund>(db.collection(C.refunds).orderBy("createdAt", "desc").limit(SCAN_LIMIT));
  const pg = pageOf(recent.filter((r) => !q.status || r.status === q.status), q.page, q.pageSize);
  const [ords, staff] = await Promise.all([orderRefs(pg.items.map((r) => r.orderId)), getMany<User>(C.users, pg.items.map((r) => r.initiatedById ?? "").filter(Boolean))]);
  const staffById = new Map(staff.map((u) => [u.id, u]));
  res.json({
    items: pg.items.map((r: WithId<Refund>) => ({
      ...r,
      order: ords.get(r.orderId) ? { orderNumber: ords.get(r.orderId)!.orderNumber, customerName: ords.get(r.orderId)!.customerName } : null,
      initiatedBy: r.initiatedById && staffById.get(r.initiatedById) ? { name: staffById.get(r.initiatedById)!.name } : null,
    })),
    meta: pg.meta,
  });
});

adminPaymentsRouter.get("/returns", requireAnyPermission("refunds.manage", "orders.view"), async (req, res) => {
  const q = query(req, paginationSchema.extend({ status: z.string().optional() }));
  const recent = await getDocs<ReturnRequest>(db.collection(C.returns).orderBy("createdAt", "desc").limit(SCAN_LIMIT));
  const pg = pageOf(recent.filter((r) => !q.status || r.status === q.status), q.page, q.pageSize);
  const [ords, users] = await Promise.all([orderRefs(pg.items.map((r) => r.orderId)), getMany<User>(C.users, pg.items.map((r) => r.userId))]);
  const byUser = new Map(users.map((u) => [u.id, u]));
  res.json({
    items: pg.items.map((r) => {
      const o = ords.get(r.orderId);
      return { ...r, order: o ? { orderNumber: o.orderNumber, totalPaise: o.totalPaise, paymentMethod: o.paymentMethod } : null, user: byUser.get(r.userId) ? { name: byUser.get(r.userId)!.name } : null };
    }),
    meta: pg.meta,
  });
});
