import { Router } from "express";
import { z } from "zod";
import {
  auth as firebaseAuth, C, countOf, createUserDoc, db, deleteQuery, getDoc, getDocs, getMany, runTx, SUB, syncClaims, whereIn,
  type Address, type DeliveryAssignment, type DeliveryPartner, type LoyaltyTransaction, type Order, type PartnerDocument, type PartnerEarning,
  type Review, type Role, type SupportTicket, type TicketMessage, type User, type WithId,
} from "@naamdev/db";
import {
  ALL_PERMISSIONS, PERMISSIONS, paginationSchema, passwordSchema, roleInputSchema, staffCreateSchema, staffUpdateSchema, ticketReplySchema, ticketUpdateSchema,
} from "@naamdev/shared";
import { audit } from "../../lib/audit";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors";
import { body, pageOf, param, query } from "../../lib/http";
import { clearPermissionCache, getRole, requireAnyPermission, requirePermission } from "../../middleware/auth";
import { revokeAllSessions } from "../auth/service";
import { catalog } from "../catalog/cache";
import { defaultStore } from "../catalog/service";
import { awardPointsNow } from "../loyalty/service";
import { notify } from "../notifications/service";
import { recomputeRating } from "../reviews/routes";
import { readPrivateDocument } from "../uploads/storage";

export const adminPeopleRouter = Router();
const users = () => db.collection(C.users);
const REVENUE = ["PAID", "COD_COLLECTED", "PARTIALLY_REFUNDED"];

// ── Customers ──
adminPeopleRouter.get("/customers", requirePermission("customers.view"), async (req, res) => {
  const q = query(req, paginationSchema.extend({ q: z.string().trim().max(60).optional(), status: z.string().optional() }));
  const term = q.q?.toLowerCase();
  const all = (await getDocs<User>(users().where("roleKey", "==", "CUSTOMER")))
    .filter((u) => (!q.status || u.status === q.status) && (!term || u.searchText.includes(term)))
    .sort((a, b) => +b.createdAt - +a.createdAt);
  const pg = pageOf(all, q.page, q.pageSize);
  const orders = await whereIn<Order>(C.orders, "userId", pg.items.map((u) => u.id));
  res.json({
    items: pg.items.map((u) => {
      const mine = orders.filter((o) => o.userId === u.id);
      return {
        id: u.id, name: u.name, email: u.email, phone: u.phone, status: u.status, loyaltyPoints: u.loyaltyPoints, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
        deletionRequestedAt: u.deletionRequestedAt, _count: { orders: mine.length },
        lifetimeSpendPaise: mine.filter((o) => REVENUE.includes(o.paymentStatus)).reduce((s, o) => s + o.totalPaise, 0),
      };
    }),
    meta: pg.meta,
  });
});

adminPeopleRouter.get("/customers/:id", requirePermission("customers.view"), async (req, res) => {
  const id = param(req, "id");
  const u = await getDoc<User>(users().doc(id));
  if (!u) throw notFound("Customer");
  const [addresses, orders, loyalty, tickets, reviews, snap] = await Promise.all([
    getDocs<Address>(users().doc(id).collection(SUB.addresses)),
    getDocs<Order>(db.collection(C.orders).where("userId", "==", id).orderBy("createdAt", "desc").limit(20)),
    getDocs<LoyaltyTransaction>(users().doc(id).collection(SUB.loyalty).orderBy("createdAt", "desc").limit(20)),
    getDocs<SupportTicket>(db.collection(C.tickets).where("userId", "==", id)),
    getDocs<Review>(db.collection(C.reviews).where("userId", "==", id)),
    catalog(),
  ]);
  res.json({
    customer: {
      ...u,
      addresses: addresses.filter((a) => !a.deletedAt),
      orders: orders.map((o) => ({ id: o.id, orderNumber: o.orderNumber, status: o.status, totalPaise: o.totalPaise, createdAt: o.createdAt, paymentMethod: o.paymentMethod })),
      loyaltyTransactions: loyalty,
      tickets: tickets.sort((a, b) => +b.createdAt - +a.createdAt).slice(0, 10).map((t) => ({ id: t.id, ticketNumber: t.ticketNumber, subject: t.subject, status: t.status, createdAt: t.createdAt })),
      reviews: reviews.sort((a, b) => +b.createdAt - +a.createdAt).slice(0, 10).map((r) => ({ ...r, product: { name: snap.byId.get(r.productId)?.name ?? "" } })),
    },
  });
});

adminPeopleRouter.post("/customers/:id/status", requirePermission("customers.manage"), async (req, res) => {
  const { status, reason } = body(req, z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]), reason: z.string().trim().max(300).optional() }));
  const id = param(req, "id");
  if (!(await users().doc(id).get()).exists) throw notFound("Customer");
  await users().doc(id).update({ status, updatedAt: new Date() });
  await firebaseAuth.updateUser(id, { disabled: status === "SUSPENDED" }).catch(() => undefined);
  if (status === "SUSPENDED") await revokeAllSessions(id);
  await audit(req, `customer.${status.toLowerCase()}`, "User", id, { reason });
  res.json({ ok: true });
});

adminPeopleRouter.post("/customers/:id/points", requirePermission("customers.manage"), async (req, res) => {
  const { points, reason } = body(req, z.object({ points: z.number().int().min(-100000).max(100000).refine((v) => v !== 0), reason: z.string().trim().min(3).max(200) }));
  try {
    await awardPointsNow(param(req, "id"), points, "ADJUSTMENT", reason);
  } catch {
    throw badRequest("The customer doesn't have enough points for this deduction.");
  }
  await audit(req, "customer.points_adjust", "User", param(req, "id"), { points, reason });
  res.json({ ok: true });
});

/** Processes an account deletion request: anonymises PII while keeping order records for accounting. */
adminPeopleRouter.post("/customers/:id/anonymize", requirePermission("customers.manage"), async (req, res) => {
  const id = param(req, "id");
  const u = await getDoc<User>(users().doc(id));
  if (!u || u.roleKey !== "CUSTOMER") throw notFound("Customer");
  for (const sub of [SUB.addresses, SUB.devices, SUB.wishlist, SUB.views]) await deleteQuery(users().doc(id).collection(sub));
  await users().doc(id).update({
    name: "Deleted user", email: null, phone: null, avatarUrl: null, status: "DELETED", searchText: "deleted user", updatedAt: new Date(),
  });
  await db.collection(C.referralCodes).doc(u.referralCode).delete().catch(() => undefined);
  await db.collection(C.carts).doc(`u_${id}`).delete().catch(() => undefined);
  // Remove the sign-in account itself so the email can't be used to log in again.
  await firebaseAuth.deleteUser(id).catch(() => undefined);
  await audit(req, "customer.anonymize", "User", id);
  res.json({ ok: true });
});

// ── Staff ──
adminPeopleRouter.get("/staff", requirePermission("staff.manage"), async (_req, res) => {
  const staff = (await getDocs<User>(users().where("isStaff", "==", true))).filter((u) => u.status !== "DELETED").sort((a, b) => +a.createdAt - +b.createdAt);
  const roles = new Map((await getDocs<Role>(db.collection(C.roles))).map((r) => [r.id, r]));
  res.json({
    staff: staff.map((u) => ({
      id: u.id, name: u.name, email: u.email, phone: u.phone, status: u.status, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
      role: { id: u.roleKey, key: u.roleKey, name: roles.get(u.roleKey)?.name ?? u.roleKey },
      staffProfile: u.staff,
    })),
  });
});

async function staffRole(roleId: string, actorRole: string) {
  const role = await getRole(roleId);
  if (!role?.isStaff) throw badRequest("Choose a staff role.");
  if (role.key === "SUPER_ADMIN" && actorRole !== "SUPER_ADMIN") throw forbidden("Only a super admin can assign the super admin role.");
  return role;
}

adminPeopleRouter.post("/staff", requirePermission("staff.manage"), async (req, res) => {
  const input = body(req, staffCreateSchema);
  const role = await staffRole(input.roleId, req.auth!.roleKey);
  let uid: string;
  try {
    uid = (await firebaseAuth.createUser({ email: input.email, password: input.password, displayName: input.name, emailVerified: true })).uid;
  } catch (err) {
    if ((err as { code?: string }).code === "auth/email-already-exists") throw conflict("A user with this email already exists.");
    throw err;
  }
  const count = await countOf(users().where("isStaff", "==", true));
  const store = await defaultStore();
  try {
    await runTx((tx) =>
      createUserDoc(tx, uid, {
        name: input.name, email: input.email, phone: input.phone, roleKey: role.key, isStaff: true, emailVerified: true,
        staff: { employeeCode: input.employeeCode || `ND-${String(200 + count).padStart(3, "0")}`, designation: input.designation, storeId: store?.id ?? null, isActive: true, joinedAt: new Date(), notes: null },
      }),
    );
  } catch (err) {
    await firebaseAuth.deleteUser(uid).catch(() => undefined);
    throw err;
  }
  await syncClaims(uid, role.key, true);
  await audit(req, "staff.create", "User", uid, { role: role.key });
  res.status(201).json({ id: uid });
});

async function staffTarget(id: string, actorRole: string) {
  const target = await getDoc<User>(users().doc(id));
  if (!target?.isStaff) throw notFound("Staff member");
  if (target.roleKey === "SUPER_ADMIN" && actorRole !== "SUPER_ADMIN") throw forbidden("Only a super admin can modify a super admin.");
  return target;
}

adminPeopleRouter.patch("/staff/:id", requirePermission("staff.manage"), async (req, res) => {
  const input = body(req, staffUpdateSchema);
  const id = param(req, "id");
  const target = await staffTarget(id, req.auth!.roleKey);
  if (id === req.auth!.user.id && (input.isActive === false || input.roleId)) throw badRequest("You can't change your own role or deactivate yourself.");
  const role = input.roleId ? await staffRole(input.roleId, req.auth!.roleKey) : null;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name) {
    patch.name = input.name;
    patch.searchText = [input.name, target.email ?? "", target.phone ?? ""].join(" ").toLowerCase();
  }
  if (role) patch.roleKey = role.key;
  if (target.staff && (input.designation || input.isActive !== undefined))
    patch.staff = { ...target.staff, ...(input.designation ? { designation: input.designation } : {}), ...(input.isActive !== undefined ? { isActive: input.isActive } : {}) };
  await users().doc(id).update(patch);
  if (role) await syncClaims(id, role.key, true);
  if (input.isActive !== undefined) await firebaseAuth.updateUser(id, { disabled: !input.isActive }).catch(() => undefined);
  if (input.isActive === false || role) await revokeAllSessions(id);
  await audit(req, "staff.update", "User", id, input);
  res.json({ ok: true });
});

adminPeopleRouter.post("/staff/:id/password", requirePermission("staff.manage"), async (req, res) => {
  const { password } = body(req, z.object({ password: passwordSchema }));
  const id = param(req, "id");
  await staffTarget(id, req.auth!.roleKey);
  await firebaseAuth.updateUser(id, { password });
  await revokeAllSessions(id);
  await audit(req, "staff.password_reset", "User", id);
  res.json({ ok: true });
});

// ── Roles (document id = role key) ──
adminPeopleRouter.get("/roles", requireAnyPermission("staff.manage", "roles.manage"), async (_req, res) => {
  const roles = (await getDocs<Role>(db.collection(C.roles))).sort((a, b) => +a.createdAt - +b.createdAt);
  const counts = await Promise.all(roles.map((r) => countOf(users().where("roleKey", "==", r.key))));
  res.json({
    roles: roles.map((r, i) => ({ id: r.id, key: r.key, name: r.name, description: r.description, isSystem: r.isSystem, isStaff: r.isStaff, userCount: counts[i], permissions: r.permissions })),
    permissions: Object.entries(PERMISSIONS).map(([key, v]) => ({ key, ...v })),
  });
});

const validPermissions = (keys: string[]) => keys.filter((k) => (ALL_PERMISSIONS as string[]).includes(k));

adminPeopleRouter.post("/roles", requirePermission("roles.manage"), async (req, res) => {
  const input = body(req, roleInputSchema);
  const key = input.key ?? input.name.toUpperCase().replace(/[^A-Z]+/g, "_").slice(0, 40);
  const ref = db.collection(C.roles).doc(key);
  const now = new Date();
  const role: Role = { key, name: input.name, description: input.description ?? null, isSystem: false, isStaff: true, permissions: validPermissions(input.permissions), createdAt: now, updatedAt: now };
  try {
    await ref.create(role);
  } catch (err) {
    if ((err as { code?: number }).code === 6) throw conflict("A role with this key already exists.");
    throw err;
  }
  clearPermissionCache();
  await audit(req, "role.create", "Role", key, { key, permissions: input.permissions });
  res.status(201).json({ role: { ...role, id: key } });
});

adminPeopleRouter.put("/roles/:id", requirePermission("roles.manage"), async (req, res) => {
  const input = body(req, roleInputSchema);
  const role = await getDoc<Role>(db.collection(C.roles).doc(param(req, "id")));
  if (!role) throw notFound("Role");
  if (role.key === "SUPER_ADMIN") throw badRequest("The Super Admin role always has every permission.");
  if (!role.isStaff) throw badRequest("Customer and partner roles have no console permissions.");
  await db.collection(C.roles).doc(role.id).update({ name: input.name, description: input.description ?? null, permissions: validPermissions(input.permissions), updatedAt: new Date() });
  clearPermissionCache();
  await audit(req, "role.update", "Role", role.id, { permissions: input.permissions });
  res.json({ ok: true });
});

adminPeopleRouter.delete("/roles/:id", requirePermission("roles.manage"), async (req, res) => {
  const role = await getDoc<Role>(db.collection(C.roles).doc(param(req, "id")));
  if (!role) throw notFound("Role");
  if (role.isSystem) throw badRequest("System roles can't be deleted.");
  if (await countOf(users().where("roleKey", "==", role.key))) throw conflict("Reassign staff using this role before deleting it.");
  await db.collection(C.roles).doc(role.id).delete();
  clearPermissionCache();
  await audit(req, "role.delete", "Role", role.id);
  res.json({ ok: true });
});

// ── Delivery partners (document id = the rider's uid) ──
const partners = () => db.collection(C.partners);
const ACTIVE = ["ACCEPTED", "AT_STORE", "PICKED_UP", "OUT_FOR_DELIVERY"];
const safePartner = ({ bankAccountEncrypted: _b, ...p }: WithId<DeliveryPartner>) => p;

adminPeopleRouter.get("/partners", requireAnyPermission("partners.manage", "delivery.manage"), async (req, res) => {
  const q = query(req, paginationSchema.extend({ status: z.string().optional(), q: z.string().trim().max(60).optional() }));
  const term = q.q?.toLowerCase();
  const all = (await getDocs<DeliveryPartner>(partners()))
    .filter((p) => (!q.status || p.status === q.status) && (!term || p.name.toLowerCase().includes(term) || (p.phone ?? "").includes(term)))
    .sort((a, b) => +b.createdAt - +a.createdAt);
  const pg = pageOf(all, q.page, q.pageSize);
  const [busy, docs] = await Promise.all([
    getDocs<DeliveryAssignment>(db.collection(C.assignments).where("status", "in", ACTIVE)),
    Promise.all(pg.items.map((p) => getDocs<PartnerDocument>(partners().doc(p.id).collection(SUB.documents)))),
  ]);
  res.json({
    items: pg.items.map((p, i) => ({
      ...safePartner(p),
      user: { name: p.name, phone: p.phone, email: p.email },
      documents: docs[i]!.map((d) => ({ type: d.type, status: d.status })),
      activeDeliveries: busy.filter((a) => a.partnerId === p.id).length,
    })),
    meta: pg.meta,
  });
});

adminPeopleRouter.get("/partners/live", requirePermission("delivery.manage"), async (_req, res) => {
  const [online, open, store] = await Promise.all([
    getDocs<DeliveryPartner>(partners().where("status", "==", "APPROVED").where("isOnline", "==", true)),
    getDocs<DeliveryAssignment>(db.collection(C.assignments).where("status", "in", ["OFFERED", ...ACTIVE])),
    defaultStore(),
  ]);
  res.json({
    partners: online.map((p) => ({
      id: p.id, name: p.name, phone: p.phone, lat: p.currentLat, lng: p.currentLng, lastLocationAt: p.lastLocationAt, vehicleType: p.vehicleType,
      assignments: open.filter((a) => a.partnerId === p.id).map((a) => ({ id: a.id, status: a.status, orderId: a.orderId, orderNumber: a.orderNumber })),
    })),
    store: store ? { lat: store.lat, lng: store.lng, name: store.name } : null,
  });
});

adminPeopleRouter.get("/partners/:id", requireAnyPermission("partners.manage", "delivery.manage"), async (req, res) => {
  const id = param(req, "id");
  const p = await getDoc<DeliveryPartner>(partners().doc(id));
  if (!p) throw notFound("Partner");
  const [user, docs, assignments, earnings, unsettled] = await Promise.all([
    getDoc<User>(users().doc(id)),
    getDocs<PartnerDocument>(partners().doc(id).collection(SUB.documents)),
    getDocs<DeliveryAssignment>(db.collection(C.assignments).where("partnerId", "==", id)),
    getDocs<PartnerEarning>(db.collection(C.earnings).where("partnerId", "==", id).orderBy("createdAt", "desc").limit(25)),
    getDocs<PartnerEarning>(db.collection(C.earnings).where("partnerId", "==", id).where("isSettled", "==", false)),
  ]);
  const recent = assignments.sort((a, b) => +b.createdAt - +a.createdAt).slice(0, 25);
  const orders = new Map((await getMany<Order>(C.orders, recent.map((a) => a.orderId))).map((o) => [o.id, o]));
  res.json({
    partner: {
      ...safePartner(p),
      user: { name: p.name, phone: p.phone, email: p.email, createdAt: user?.createdAt ?? p.createdAt, status: user?.status ?? "ACTIVE" },
      documents: docs.map(({ storageKey: _s, ...d }) => d),
      assignments: recent.map((a) => ({ ...a, order: { orderNumber: a.orderNumber, totalPaise: orders.get(a.orderId)?.totalPaise ?? 0 } })),
      earnings,
    },
    unsettledPaise: unsettled.reduce((s, e) => s + e.amountPaise, 0),
  });
});

adminPeopleRouter.post("/partners/:id/status", requirePermission("partners.manage"), async (req, res) => {
  const { status, reason } = body(req, z.object({ status: z.enum(["APPROVED", "REJECTED", "SUSPENDED", "PENDING"]), reason: z.string().trim().max(300).optional() }));
  const id = param(req, "id");
  const ref = partners().doc(id);
  if (!(await ref.get()).exists) throw notFound("Partner");
  await ref.update({ status, statusReason: reason ?? null, updatedAt: new Date(), ...(status === "APPROVED" ? { approvedAt: new Date(), approvedById: req.auth!.user.id } : { isOnline: false }) });
  notify({
    userId: id, type: "ACCOUNT",
    title: status === "APPROVED" ? "You're verified! 🎉" : status === "SUSPENDED" ? "Account suspended" : status === "REJECTED" ? "Verification unsuccessful" : "Verification pending",
    body: status === "APPROVED" ? "Your NAAMDEV partner account is approved. Go online to start receiving deliveries." : reason ?? "Please contact partner support for details.",
    template: `partner.${status.toLowerCase()}`, channels: ["IN_APP", "SMS", "PUSH"],
  });
  await audit(req, `partner.${status.toLowerCase()}`, "DeliveryPartner", id, { reason });
  res.json({ partner: safePartner((await getDoc<DeliveryPartner>(ref))!) });
});

const docRef = (partnerId: string, docId: string) => partners().doc(partnerId).collection(SUB.documents).doc(docId);

adminPeopleRouter.post("/partners/:id/documents/:docId/review", requirePermission("partners.manage"), async (req, res) => {
  const { status, reason } = body(req, z.object({ status: z.enum(["VERIFIED", "REJECTED"]), reason: z.string().trim().max(300).optional() }));
  const ref = docRef(param(req, "id"), param(req, "docId"));
  const doc = await getDoc<PartnerDocument>(ref);
  if (!doc) throw notFound("Document");
  await ref.update({ status, rejectionReason: status === "REJECTED" ? reason ?? "Please re-upload a clear copy" : null, reviewedAt: new Date() });
  await audit(req, `partner.document_${status.toLowerCase()}`, "PartnerDocument", doc.id, { type: doc.type });
  res.json({ ok: true });
});

adminPeopleRouter.get("/partners/:id/documents/:docId/file", requirePermission("partners.manage"), async (req, res) => {
  const doc = await getDoc<PartnerDocument>(docRef(param(req, "id"), param(req, "docId")));
  if (!doc) throw notFound("Document");
  await audit(req, "partner.document_view", "PartnerDocument", doc.id);
  res.set({ "Content-Type": doc.mimeType, "Cache-Control": "private, no-store", "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff" });
  res.send(await readPrivateDocument(doc.storageKey));
});

adminPeopleRouter.post("/partners/:id/settle", requirePermission("partners.manage"), async (req, res) => {
  const { reference } = body(req, z.object({ reference: z.string().trim().min(3).max(120) }));
  const id = param(req, "id");
  const open = await db.collection(C.earnings).where("partnerId", "==", id).where("isSettled", "==", false).get();
  const now = new Date();
  for (let i = 0; i < open.docs.length; i += 400) {
    const batch = db.batch();
    open.docs.slice(i, i + 400).forEach((d) => batch.update(d.ref, { isSettled: true, settledAt: now }));
    await batch.commit();
  }
  await audit(req, "partner.payout_settled", "DeliveryPartner", id, { reference, entries: open.size });
  res.json({ settled: open.size });
});

// ── Reviews ──
adminPeopleRouter.get("/reviews", requirePermission("reviews.moderate"), async (req, res) => {
  const q = query(req, paginationSchema.extend({ status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional() }));
  const ref = q.status ? db.collection(C.reviews).where("status", "==", q.status) : db.collection(C.reviews);
  const all = (await getDocs<Review>(ref)).sort((a, b) => +b.createdAt - +a.createdAt);
  const pg = pageOf(all, q.page, q.pageSize);
  const snap = await catalog();
  res.json({
    items: pg.items.map((r) => ({ ...r, user: { name: r.userName }, product: { name: snap.byId.get(r.productId)?.name ?? "", slug: snap.byId.get(r.productId)?.slug ?? "" } })),
    meta: pg.meta,
  });
});

adminPeopleRouter.post("/reviews/:id/moderate", requirePermission("reviews.moderate"), async (req, res) => {
  const { status, reason } = body(req, z.object({ status: z.enum(["APPROVED", "REJECTED"]), reason: z.string().trim().max(300).optional() }));
  const ref = db.collection(C.reviews).doc(param(req, "id"));
  const existing = await getDoc<Review>(ref);
  if (!existing) throw notFound("Review");
  const patch = { status, rejectionReason: status === "REJECTED" ? reason ?? null : null, moderatedById: req.auth!.user.id, moderatedAt: new Date(), updatedAt: new Date() };
  await ref.update(patch);
  await recomputeRating(existing.productId);
  await audit(req, `review.${status.toLowerCase()}`, "Review", existing.id);
  res.json({ review: { ...existing, ...patch } });
});

// ── Support tickets ──
const tickets = () => db.collection(C.tickets);

adminPeopleRouter.get("/tickets", requirePermission("support.view"), async (req, res) => {
  const q = query(req, paginationSchema.extend({ status: z.string().optional(), priority: z.string().optional(), mine: z.coerce.boolean().optional(), q: z.string().trim().max(60).optional() }));
  const all = await getDocs<SupportTicket>(tickets().orderBy("lastActivityAt", "desc").limit(2000));
  const statuses = q.status?.split(",");
  const term = q.q?.toLowerCase();
  const filtered = all.filter(
    (t) =>
      (!statuses || statuses.includes(t.status)) && (!q.priority || t.priority === q.priority) && (!q.mine || t.assignedToId === req.auth!.user.id) &&
      (!term || t.ticketNumber.toLowerCase().includes(term) || t.subject.toLowerCase().includes(term)),
  );
  const counts: Record<string, number> = {};
  for (const t of all) counts[t.status] = (counts[t.status] ?? 0) + 1;
  const pg = pageOf(filtered, q.page, q.pageSize);
  const customers = new Map((await getMany<User>(C.users, pg.items.map((t) => t.userId ?? "").filter(Boolean))).map((u) => [u.id, u]));
  res.json({
    items: pg.items.map((t) => ({
      ...t,
      user: t.userId && customers.get(t.userId) ? { name: customers.get(t.userId)!.name, phone: customers.get(t.userId)!.phone } : null,
      assignedTo: t.assignedToId ? { name: t.assignedToName } : null,
      order: t.orderId ? { orderNumber: t.orderNumber } : null,
    })),
    meta: pg.meta,
    statusCounts: counts,
  });
});

adminPeopleRouter.get("/tickets/:id", requirePermission("support.view"), async (req, res) => {
  const t = await getDoc<SupportTicket>(tickets().doc(param(req, "id")));
  if (!t) throw notFound("Ticket");
  const [messages, customer, order, staff] = await Promise.all([
    getDocs<TicketMessage>(tickets().doc(t.id).collection(SUB.messages).orderBy("createdAt", "asc")),
    t.userId ? getDoc<User>(users().doc(t.userId)) : null,
    t.orderId ? getDoc<Order>(db.collection(C.orders).doc(t.orderId)) : null,
    getDocs<User>(users().where("isStaff", "==", true)),
  ]);
  const agents = [];
  for (const u of staff) if (u.staff?.isActive && (await getRole(u.roleKey))?.permissions.includes("support.manage")) agents.push({ id: u.id, name: u.name });
  res.json({
    ticket: {
      ...t,
      messages: messages.map((m) => ({ ...m, author: m.authorName ? { name: m.authorName } : null })),
      user: customer ? { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone } : null,
      assignedTo: t.assignedToId ? { id: t.assignedToId, name: t.assignedToName } : null,
      order: order ? { id: order.id, orderNumber: order.orderNumber, status: order.status, totalPaise: order.totalPaise } : null,
    },
    agents,
  });
});

adminPeopleRouter.post("/tickets/:id/messages", requirePermission("support.manage"), async (req, res) => {
  const { body: text, isInternal } = body(req, ticketReplySchema);
  const t = await getDoc<SupportTicket>(tickets().doc(param(req, "id")));
  if (!t) throw notFound("Ticket");
  const now = new Date();
  const msg: TicketMessage = { authorId: req.auth!.user.id, authorName: req.auth!.user.name, authorType: "STAFF", body: text, isInternal: !!isInternal, createdAt: now };
  const ref = await tickets().doc(t.id).collection(SUB.messages).add(msg);
  await tickets().doc(t.id).update({
    lastActivityAt: now, updatedAt: now,
    ...(isInternal ? {} : { status: t.status === "OPEN" ? "AWAITING_CUSTOMER" : t.status }),
    ...(t.assignedToId ? {} : { assignedToId: req.auth!.user.id, assignedToName: req.auth!.user.name }),
  });
  if (!isInternal && t.userId)
    notify({ userId: t.userId, type: "SUPPORT", title: `Reply on ${t.ticketNumber}`, body: text.slice(0, 160), link: `/account/support/${t.id}`, template: "ticket.reply", channels: ["IN_APP", "EMAIL", "PUSH"] });
  res.status(201).json({ message: { ...msg, id: ref.id } });
});

adminPeopleRouter.patch("/tickets/:id", requirePermission("support.manage"), async (req, res) => {
  const input = body(req, ticketUpdateSchema);
  const ref = tickets().doc(param(req, "id"));
  const t = await getDoc<SupportTicket>(ref);
  if (!t) throw notFound("Ticket");
  const now = new Date();
  const patch: Record<string, unknown> = { lastActivityAt: now, updatedAt: now };
  if (input.status) patch.status = input.status;
  if (input.priority) patch.priority = input.priority;
  if (input.assignedToId !== undefined) {
    patch.assignedToId = input.assignedToId;
    patch.assignedToName = input.assignedToId ? ((await getDoc<User>(users().doc(input.assignedToId)))?.name ?? null) : null;
  }
  if (input.status === "RESOLVED") patch.resolvedAt = now;
  if (input.status === "CLOSED") patch.closedAt = now;
  await ref.update(patch);
  if (input.status && t.userId && ["RESOLVED", "CLOSED"].includes(input.status))
    notify({ userId: t.userId, type: "SUPPORT", title: `Ticket ${t.ticketNumber} ${input.status.toLowerCase()}`, body: "Thanks for reaching out. Reply if you still need help.", link: `/account/support/${t.id}`, template: "ticket.status", channels: ["IN_APP"] });
  await audit(req, "ticket.update", "SupportTicket", t.id, input);
  res.json({ ticket: { ...t, ...patch } });
});
