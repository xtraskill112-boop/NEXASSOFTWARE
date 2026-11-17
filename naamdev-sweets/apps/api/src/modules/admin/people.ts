import { Router } from "express";
import { z } from "zod";
import { prisma, type Prisma } from "@naamdev/db";
import {
  ALL_PERMISSIONS, PERMISSIONS, paginationSchema, passwordSchema, roleInputSchema, staffCreateSchema, staffUpdateSchema, ticketReplySchema, ticketUpdateSchema,
} from "@naamdev/shared";
import { audit } from "../../lib/audit";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors";
import { body, pageMeta, paginate, param, query } from "../../lib/http";
import { clearPermissionCache, requireAnyPermission, requirePermission } from "../../middleware/auth";
import { hashPassword, revokeAllSessions } from "../auth/service";
import { awardPoints } from "../loyalty/service";
import { notify } from "../notifications/service";
import { recomputeRating } from "../reviews/routes";
import { readPrivateDocument } from "../uploads/storage";
import { referralCode } from "../../lib/crypto";

export const adminPeopleRouter = Router();

// ── Customers ──
adminPeopleRouter.get("/customers", requirePermission("customers.view"), async (req, res) => {
  const q = query(req, paginationSchema.extend({ q: z.string().trim().max(60).optional(), status: z.string().optional() }));
  const where: Prisma.UserWhereInput = { role: { key: "CUSTOMER" }, ...(q.status ? { status: q.status as never } : {}) };
  if (q.q) where.OR = [{ name: { contains: q.q, mode: "insensitive" } }, { email: { contains: q.q, mode: "insensitive" } }, { phone: { contains: q.q } }];
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, ...paginate(q.page, q.pageSize), select: { id: true, name: true, email: true, phone: true, status: true, loyaltyPoints: true, createdAt: true, lastLoginAt: true, deletionRequestedAt: true, _count: { select: { orders: true } } } }),
  ]);
  const spend = await prisma.order.groupBy({ by: ["userId"], where: { userId: { in: users.map((u) => u.id) }, paymentStatus: { in: ["PAID", "COD_COLLECTED", "PARTIALLY_REFUNDED"] } }, _sum: { totalPaise: true } });
  res.json({ items: users.map((u) => ({ ...u, lifetimeSpendPaise: spend.find((s) => s.userId === u.id)?._sum.totalPaise ?? 0 })), meta: pageMeta(total, q.page, q.pageSize) });
});

adminPeopleRouter.get("/customers/:id", requirePermission("customers.view"), async (req, res) => {
  const u = await prisma.user.findUnique({
    where: { id: param(req, "id") },
    include: {
      profile: true,
      addresses: { where: { deletedAt: null } },
      orders: { orderBy: { createdAt: "desc" }, take: 20, select: { id: true, orderNumber: true, status: true, totalPaise: true, createdAt: true, paymentMethod: true } },
      loyaltyTransactions: { orderBy: { createdAt: "desc" }, take: 20 },
      tickets: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, ticketNumber: true, subject: true, status: true, createdAt: true } },
      reviews: { orderBy: { createdAt: "desc" }, take: 10, include: { product: { select: { name: true } } } },
    },
  });
  if (!u) throw notFound("Customer");
  const { passwordHash: _p, ...safe } = u;
  res.json({ customer: safe });
});

adminPeopleRouter.post("/customers/:id/status", requirePermission("customers.manage"), async (req, res) => {
  const { status, reason } = body(req, z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]), reason: z.string().trim().max(300).optional() }));
  const u = await prisma.user.update({ where: { id: param(req, "id") }, data: { status } });
  if (status === "SUSPENDED") await revokeAllSessions(u.id);
  await audit(req, `customer.${status.toLowerCase()}`, "User", u.id, { reason });
  res.json({ ok: true });
});

adminPeopleRouter.post("/customers/:id/points", requirePermission("customers.manage"), async (req, res) => {
  const { points, reason } = body(req, z.object({ points: z.number().int().min(-100000).max(100000).refine((v) => v !== 0), reason: z.string().trim().min(3).max(200) }));
  try {
    await awardPoints(prisma, param(req, "id"), points, "ADJUSTMENT", reason);
  } catch {
    throw badRequest("The customer doesn't have enough points for this deduction.");
  }
  await audit(req, "customer.points_adjust", "User", param(req, "id"), { points, reason });
  res.json({ ok: true });
});

/** Processes an account deletion request: anonymises PII while keeping order records for accounting. */
adminPeopleRouter.post("/customers/:id/anonymize", requirePermission("customers.manage"), async (req, res) => {
  const id = param(req, "id");
  const u = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!u || u.role.key !== "CUSTOMER") throw notFound("Customer");
  await prisma.$transaction([
    prisma.address.deleteMany({ where: { userId: id } }),
    prisma.deviceToken.deleteMany({ where: { userId: id } }),
    prisma.session.deleteMany({ where: { userId: id } }),
    prisma.wishlistItem.deleteMany({ where: { userId: id } }),
    prisma.productView.deleteMany({ where: { userId: id } }),
    prisma.user.update({ where: { id }, data: { name: "Deleted user", email: null, phone: null, passwordHash: null, avatarUrl: null, status: "DELETED", referralCode: `DEL${referralCode()}` } }),
  ]);
  await audit(req, "customer.anonymize", "User", id);
  res.json({ ok: true });
});

// ── Staff ──
adminPeopleRouter.get("/staff", requirePermission("staff.manage"), async (_req, res) => {
  const staff = await prisma.user.findMany({
    where: { role: { isStaff: true }, status: { not: "DELETED" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, phone: true, status: true, lastLoginAt: true, createdAt: true, role: { select: { id: true, key: true, name: true } }, staffProfile: true },
  });
  res.json({ staff });
});

adminPeopleRouter.post("/staff", requirePermission("staff.manage"), async (req, res) => {
  const input = body(req, staffCreateSchema);
  const role = await prisma.role.findUnique({ where: { id: input.roleId } });
  if (!role?.isStaff) throw badRequest("Choose a staff role.");
  if (role.key === "SUPER_ADMIN" && req.auth!.roleKey !== "SUPER_ADMIN") throw forbidden("Only a super admin can create another super admin.");
  if (await prisma.user.findFirst({ where: { OR: [{ email: input.email }, { phone: input.phone }] } })) throw conflict("A user with this email or phone already exists.");
  const count = await prisma.staffProfile.count();
  const user = await prisma.user.create({
    data: {
      name: input.name, email: input.email, phone: input.phone, passwordHash: await hashPassword(input.password), roleId: role.id,
      referralCode: referralCode(), emailVerifiedAt: new Date(), phoneVerifiedAt: new Date(), profile: { create: {} },
      staffProfile: { create: { designation: input.designation, employeeCode: input.employeeCode || `ND-${String(200 + count).padStart(3, "0")}`, storeId: (await prisma.store.findFirst({ where: { isDefault: true } }))?.id } },
    },
  });
  await audit(req, "staff.create", "User", user.id, { role: role.key });
  res.status(201).json({ id: user.id });
});

adminPeopleRouter.patch("/staff/:id", requirePermission("staff.manage"), async (req, res) => {
  const input = body(req, staffUpdateSchema);
  const id = param(req, "id");
  const target = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!target?.role.isStaff) throw notFound("Staff member");
  if (target.role.key === "SUPER_ADMIN" && req.auth!.roleKey !== "SUPER_ADMIN") throw forbidden("Only a super admin can modify a super admin.");
  if (id === req.auth!.user.id && (input.isActive === false || input.roleId)) throw badRequest("You can't change your own role or deactivate yourself.");
  if (input.roleId) {
    const role = await prisma.role.findUnique({ where: { id: input.roleId } });
    if (!role?.isStaff) throw badRequest("Choose a staff role.");
    if (role.key === "SUPER_ADMIN" && req.auth!.roleKey !== "SUPER_ADMIN") throw forbidden();
  }
  await prisma.user.update({
    where: { id },
    data: { name: input.name, roleId: input.roleId, staffProfile: { update: { designation: input.designation, isActive: input.isActive } } },
  });
  if (input.isActive === false || input.roleId) await revokeAllSessions(id);
  await audit(req, "staff.update", "User", id, input);
  res.json({ ok: true });
});

adminPeopleRouter.post("/staff/:id/password", requirePermission("staff.manage"), async (req, res) => {
  const { password } = body(req, z.object({ password: passwordSchema }));
  const id = param(req, "id");
  const target = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!target?.role.isStaff) throw notFound("Staff member");
  if (target.role.key === "SUPER_ADMIN" && req.auth!.roleKey !== "SUPER_ADMIN") throw forbidden();
  await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password) } });
  await revokeAllSessions(id);
  await audit(req, "staff.password_reset", "User", id);
  res.json({ ok: true });
});

// ── Roles ──
adminPeopleRouter.get("/roles", requireAnyPermission("staff.manage", "roles.manage"), async (_req, res) => {
  const roles = await prisma.role.findMany({ orderBy: { createdAt: "asc" }, include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } } });
  res.json({
    roles: roles.map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description, isSystem: r.isSystem, isStaff: r.isStaff, userCount: r._count.users, permissions: r.permissions.map((p) => p.permission.key) })),
    permissions: Object.entries(PERMISSIONS).map(([key, v]) => ({ key, ...v })),
  });
});

async function setRolePermissions(roleId: string, keys: string[]) {
  const valid = keys.filter((k) => (ALL_PERMISSIONS as string[]).includes(k));
  const perms = await prisma.permission.findMany({ where: { key: { in: valid } } });
  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId, permissionId: p.id })) }),
  ]);
  clearPermissionCache();
}

adminPeopleRouter.post("/roles", requirePermission("roles.manage"), async (req, res) => {
  const input = body(req, roleInputSchema);
  const key = input.key ?? input.name.toUpperCase().replace(/[^A-Z]+/g, "_").slice(0, 40);
  if (await prisma.role.findUnique({ where: { key } })) throw conflict("A role with this key already exists.");
  const role = await prisma.role.create({ data: { key, name: input.name, description: input.description, isStaff: true } });
  await setRolePermissions(role.id, input.permissions);
  await audit(req, "role.create", "Role", role.id, { key, permissions: input.permissions });
  res.status(201).json({ role });
});

adminPeopleRouter.put("/roles/:id", requirePermission("roles.manage"), async (req, res) => {
  const input = body(req, roleInputSchema);
  const role = await prisma.role.findUnique({ where: { id: param(req, "id") } });
  if (!role) throw notFound("Role");
  if (role.key === "SUPER_ADMIN") throw badRequest("The Super Admin role always has every permission.");
  if (!role.isStaff) throw badRequest("Customer and partner roles have no console permissions.");
  await prisma.role.update({ where: { id: role.id }, data: { name: input.name, description: input.description } });
  await setRolePermissions(role.id, input.permissions);
  await audit(req, "role.update", "Role", role.id, { permissions: input.permissions });
  res.json({ ok: true });
});

adminPeopleRouter.delete("/roles/:id", requirePermission("roles.manage"), async (req, res) => {
  const role = await prisma.role.findUnique({ where: { id: param(req, "id") }, include: { _count: { select: { users: true } } } });
  if (!role) throw notFound("Role");
  if (role.isSystem) throw badRequest("System roles can't be deleted.");
  if (role._count.users) throw conflict("Reassign staff using this role before deleting it.");
  await prisma.role.delete({ where: { id: role.id } });
  await audit(req, "role.delete", "Role", role.id);
  res.json({ ok: true });
});

// ── Delivery partners ──
adminPeopleRouter.get("/partners", requireAnyPermission("partners.manage", "delivery.manage"), async (req, res) => {
  const q = query(req, paginationSchema.extend({ status: z.string().optional(), q: z.string().trim().max(60).optional() }));
  const where: Prisma.DeliveryPartnerWhereInput = { ...(q.status ? { status: q.status as never } : {}) };
  if (q.q) where.user = { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { phone: { contains: q.q } }] };
  const [total, items] = await Promise.all([
    prisma.deliveryPartner.count({ where }),
    prisma.deliveryPartner.findMany({
      where, orderBy: { createdAt: "desc" }, ...paginate(q.page, q.pageSize),
      include: { user: { select: { name: true, phone: true, email: true } }, documents: { select: { type: true, status: true } }, _count: { select: { assignments: { where: { status: { in: ["ACCEPTED", "AT_STORE", "PICKED_UP", "OUT_FOR_DELIVERY"] } } } } } },
    }),
  ]);
  res.json({ items: items.map(({ bankAccountEncrypted: _b, ...p }) => ({ ...p, activeDeliveries: p._count.assignments })), meta: pageMeta(total, q.page, q.pageSize) });
});

adminPeopleRouter.get("/partners/live", requirePermission("delivery.manage"), async (_req, res) => {
  const partners = await prisma.deliveryPartner.findMany({
    where: { status: "APPROVED", isOnline: true },
    include: { user: { select: { name: true, phone: true } }, assignments: { where: { status: { in: ["OFFERED", "ACCEPTED", "AT_STORE", "PICKED_UP", "OUT_FOR_DELIVERY"] } }, include: { order: { select: { orderNumber: true, id: true } } } } },
  });
  res.json({
    partners: partners.map((p) => ({ id: p.id, name: p.user.name, phone: p.user.phone, lat: p.currentLat, lng: p.currentLng, lastLocationAt: p.lastLocationAt, vehicleType: p.vehicleType, assignments: p.assignments.map((a) => ({ id: a.id, status: a.status, orderId: a.order.id, orderNumber: a.order.orderNumber })) })),
    store: await prisma.store.findFirst({ where: { isDefault: true }, select: { lat: true, lng: true, name: true } }),
  });
});

adminPeopleRouter.get("/partners/:id", requireAnyPermission("partners.manage", "delivery.manage"), async (req, res) => {
  const p = await prisma.deliveryPartner.findUnique({
    where: { id: param(req, "id") },
    include: {
      user: { select: { name: true, phone: true, email: true, createdAt: true, status: true } },
      documents: true,
      assignments: { orderBy: { createdAt: "desc" }, take: 25, include: { order: { select: { orderNumber: true, totalPaise: true } } } },
      earnings: { orderBy: { createdAt: "desc" }, take: 25 },
    },
  });
  if (!p) throw notFound("Partner");
  const unsettled = await prisma.partnerEarning.aggregate({ where: { partnerId: p.id, isSettled: false }, _sum: { amountPaise: true } });
  const { bankAccountEncrypted: _b, ...safe } = p;
  res.json({ partner: { ...safe, documents: p.documents.map(({ storageKey: _s, ...d }) => d) }, unsettledPaise: unsettled._sum.amountPaise ?? 0 });
});

adminPeopleRouter.post("/partners/:id/status", requirePermission("partners.manage"), async (req, res) => {
  const { status, reason } = body(req, z.object({ status: z.enum(["APPROVED", "REJECTED", "SUSPENDED", "PENDING"]), reason: z.string().trim().max(300).optional() }));
  const id = param(req, "id");
  const p = await prisma.deliveryPartner.update({
    where: { id },
    data: { status, statusReason: reason ?? null, ...(status === "APPROVED" ? { approvedAt: new Date(), approvedById: req.auth!.user.id } : { isOnline: false }) },
  });
  notify({
    userId: p.userId, type: "ACCOUNT",
    title: status === "APPROVED" ? "You're verified! 🎉" : status === "SUSPENDED" ? "Account suspended" : status === "REJECTED" ? "Verification unsuccessful" : "Verification pending",
    body: status === "APPROVED" ? "Your NAAMDEV partner account is approved. Go online to start receiving deliveries." : reason ?? "Please contact partner support for details.",
    template: `partner.${status.toLowerCase()}`, channels: ["IN_APP", "SMS", "PUSH"],
  });
  await audit(req, `partner.${status.toLowerCase()}`, "DeliveryPartner", id, { reason });
  res.json({ partner: p });
});

adminPeopleRouter.post("/partners/:id/documents/:docId/review", requirePermission("partners.manage"), async (req, res) => {
  const { status, reason } = body(req, z.object({ status: z.enum(["VERIFIED", "REJECTED"]), reason: z.string().trim().max(300).optional() }));
  const doc = await prisma.partnerDocument.findFirst({ where: { id: param(req, "docId"), partnerId: param(req, "id") } });
  if (!doc) throw notFound("Document");
  await prisma.partnerDocument.update({ where: { id: doc.id }, data: { status, rejectionReason: status === "REJECTED" ? reason ?? "Please re-upload a clear copy" : null, reviewedAt: new Date() } });
  await audit(req, `partner.document_${status.toLowerCase()}`, "PartnerDocument", doc.id, { type: doc.type });
  res.json({ ok: true });
});

adminPeopleRouter.get("/partners/:id/documents/:docId/file", requirePermission("partners.manage"), async (req, res) => {
  const doc = await prisma.partnerDocument.findFirst({ where: { id: param(req, "docId"), partnerId: param(req, "id") } });
  if (!doc) throw notFound("Document");
  await audit(req, "partner.document_view", "PartnerDocument", doc.id);
  res.set({ "Content-Type": doc.mimeType, "Cache-Control": "private, no-store", "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff" });
  res.send(await readPrivateDocument(doc.storageKey));
});

adminPeopleRouter.post("/partners/:id/settle", requirePermission("partners.manage"), async (req, res) => {
  const { reference } = body(req, z.object({ reference: z.string().trim().min(3).max(120) }));
  const id = param(req, "id");
  const r = await prisma.partnerEarning.updateMany({ where: { partnerId: id, isSettled: false }, data: { isSettled: true, settledAt: new Date() } });
  await audit(req, "partner.payout_settled", "DeliveryPartner", id, { reference, entries: r.count });
  res.json({ settled: r.count });
});

// ── Reviews ──
adminPeopleRouter.get("/reviews", requirePermission("reviews.moderate"), async (req, res) => {
  const q = query(req, paginationSchema.extend({ status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional() }));
  const where = q.status ? { status: q.status } : {};
  const [total, items] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({ where, orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } }, product: { select: { name: true, slug: true } } }, ...paginate(q.page, q.pageSize) }),
  ]);
  res.json({ items, meta: pageMeta(total, q.page, q.pageSize) });
});

adminPeopleRouter.post("/reviews/:id/moderate", requirePermission("reviews.moderate"), async (req, res) => {
  const { status, reason } = body(req, z.object({ status: z.enum(["APPROVED", "REJECTED"]), reason: z.string().trim().max(300).optional() }));
  const r = await prisma.review.update({ where: { id: param(req, "id") }, data: { status, rejectionReason: status === "REJECTED" ? reason : null, moderatedById: req.auth!.user.id, moderatedAt: new Date() } });
  await recomputeRating(r.productId);
  await audit(req, `review.${status.toLowerCase()}`, "Review", r.id);
  res.json({ review: r });
});

// ── Support tickets ──
adminPeopleRouter.get("/tickets", requirePermission("support.view"), async (req, res) => {
  const q = query(req, paginationSchema.extend({ status: z.string().optional(), priority: z.string().optional(), mine: z.coerce.boolean().optional(), q: z.string().trim().max(60).optional() }));
  const where: Prisma.SupportTicketWhereInput = {
    ...(q.status ? { status: { in: q.status.split(",") as never } } : {}),
    ...(q.priority ? { priority: q.priority as never } : {}),
    ...(q.mine ? { assignedToId: req.auth!.user.id } : {}),
    ...(q.q ? { OR: [{ ticketNumber: { contains: q.q, mode: "insensitive" } }, { subject: { contains: q.q, mode: "insensitive" } }] } : {}),
  };
  const [total, items, counts] = await Promise.all([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({ where, orderBy: [{ lastActivityAt: "desc" }], include: { user: { select: { name: true, phone: true } }, assignedTo: { select: { name: true } }, order: { select: { orderNumber: true } } }, ...paginate(q.page, q.pageSize) }),
    prisma.supportTicket.groupBy({ by: ["status"], _count: true }),
  ]);
  res.json({ items, meta: pageMeta(total, q.page, q.pageSize), statusCounts: Object.fromEntries(counts.map((c) => [c.status, c._count])) });
});

adminPeopleRouter.get("/tickets/:id", requirePermission("support.view"), async (req, res) => {
  const t = await prisma.supportTicket.findUnique({
    where: { id: param(req, "id") },
    include: { messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } }, user: { select: { id: true, name: true, email: true, phone: true } }, assignedTo: { select: { id: true, name: true } }, order: { select: { id: true, orderNumber: true, status: true, totalPaise: true } } },
  });
  if (!t) throw notFound("Ticket");
  const agents = await prisma.user.findMany({ where: { role: { permissions: { some: { permission: { key: "support.manage" } } } }, staffProfile: { isActive: true } }, select: { id: true, name: true } });
  res.json({ ticket: t, agents });
});

adminPeopleRouter.post("/tickets/:id/messages", requirePermission("support.manage"), async (req, res) => {
  const { body: text, isInternal } = body(req, ticketReplySchema);
  const t = await prisma.supportTicket.findUnique({ where: { id: param(req, "id") } });
  if (!t) throw notFound("Ticket");
  const msg = await prisma.ticketMessage.create({ data: { ticketId: t.id, authorId: req.auth!.user.id, authorType: "STAFF", body: text, isInternal: !!isInternal } });
  await prisma.supportTicket.update({ where: { id: t.id }, data: { lastActivityAt: new Date(), ...(isInternal ? {} : { status: t.status === "OPEN" ? "AWAITING_CUSTOMER" : t.status }), assignedToId: t.assignedToId ?? req.auth!.user.id } });
  if (!isInternal && t.userId)
    notify({ userId: t.userId, type: "SUPPORT", title: `Reply on ${t.ticketNumber}`, body: text.slice(0, 160), link: `/account/support/${t.id}`, template: "ticket.reply", channels: ["IN_APP", "EMAIL", "PUSH"] });
  res.status(201).json({ message: msg });
});

adminPeopleRouter.patch("/tickets/:id", requirePermission("support.manage"), async (req, res) => {
  const input = body(req, ticketUpdateSchema);
  const t = await prisma.supportTicket.update({
    where: { id: param(req, "id") },
    data: { ...input, ...(input.status === "RESOLVED" ? { resolvedAt: new Date() } : {}), ...(input.status === "CLOSED" ? { closedAt: new Date() } : {}), lastActivityAt: new Date() },
  });
  if (input.status && t.userId && ["RESOLVED", "CLOSED"].includes(input.status))
    notify({ userId: t.userId, type: "SUPPORT", title: `Ticket ${t.ticketNumber} ${input.status.toLowerCase()}`, body: "Thanks for reaching out. Reply if you still need help.", link: `/account/support/${t.id}`, template: "ticket.status", channels: ["IN_APP"] });
  await audit(req, "ticket.update", "SupportTicket", t.id, input);
  res.json({ ticket: t });
});
