import { Router } from "express";
import { z } from "zod";
import { prisma } from "@naamdev/db";
import { addressSchema, LOYALTY_TIERS, nextTier, paginationSchema, profileUpdateSchema, tierFor } from "@naamdev/shared";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { body, pageMeta, paginate, param, query } from "../../lib/http";
import { getSetting } from "../../lib/settings";
import { requireAuth } from "../../middleware/auth";
import { cardsByIds } from "../catalog/service";
import { currentUserPayload } from "../auth/service";
import { couponContextFor } from "../cart/service";
import { evaluateCoupon, describeCoupon } from "@naamdev/shared";

export const accountRouter = Router();
accountRouter.use(requireAuth);

accountRouter.patch("/profile", async (req, res) => {
  const input = body(req, profileUpdateSchema);
  const uid = req.auth!.user.id;
  const { name, email, preferredLanguage, ...profile } = input;
  if (email && email !== req.auth!.user.email) {
    const taken = await prisma.user.findFirst({ where: { email, id: { not: uid } } });
    if (taken) throw conflict("This email is already in use.");
  }
  await prisma.user.update({
    where: { id: uid },
    data: {
      name, preferredLanguage,
      ...(email && email !== req.auth!.user.email ? { email, emailVerifiedAt: null } : {}),
      profile: { upsert: { create: profile, update: profile } },
    },
  });
  res.json({ user: await currentUserPayload(uid) });
});

accountRouter.patch("/avatar", async (req, res) => {
  const { url } = body(req, z.object({ url: z.string().max(600).nullable() }));
  if (url && !url.startsWith("/uploads/") && !url.startsWith("https://res.cloudinary.com/")) throw badRequest("Upload the avatar first.");
  await prisma.user.update({ where: { id: req.auth!.user.id }, data: { avatarUrl: url } });
  res.json({ user: await currentUserPayload(req.auth!.user.id) });
});

// ── Addresses ──
accountRouter.get("/addresses", async (req, res) => {
  const addresses = await prisma.address.findMany({ where: { userId: req.auth!.user.id, deletedAt: null }, orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] });
  const zones = await prisma.deliveryZone.findMany({ where: { pincode: { in: addresses.map((a) => a.pincode) }, isActive: true } });
  const ok = new Set(zones.map((z) => z.pincode));
  const delivery = await getSetting("delivery");
  res.json({ addresses: addresses.map((a) => ({ ...a, serviceable: ok.has(a.pincode) || !delivery.restrictToZones })) });
});

accountRouter.post("/addresses", async (req, res) => {
  const input = body(req, addressSchema);
  const uid = req.auth!.user.id;
  const count = await prisma.address.count({ where: { userId: uid, deletedAt: null } });
  if (count >= 20) throw badRequest("You can save up to 20 addresses.");
  const makeDefault = input.isDefault || count === 0;
  const address = await prisma.$transaction(async (tx) => {
    if (makeDefault) await tx.address.updateMany({ where: { userId: uid }, data: { isDefault: false } });
    return tx.address.create({ data: { ...input, userId: uid, isDefault: makeDefault } });
  });
  res.status(201).json({ address });
});

accountRouter.patch("/addresses/:id", async (req, res) => {
  const input = body(req, addressSchema.partial());
  const uid = req.auth!.user.id;
  const existing = await prisma.address.findFirst({ where: { id: param(req, "id"), userId: uid, deletedAt: null } });
  if (!existing) throw notFound("Address");
  const address = await prisma.$transaction(async (tx) => {
    if (input.isDefault) await tx.address.updateMany({ where: { userId: uid }, data: { isDefault: false } });
    return tx.address.update({ where: { id: existing.id }, data: input });
  });
  res.json({ address });
});

accountRouter.delete("/addresses/:id", async (req, res) => {
  const uid = req.auth!.user.id;
  const existing = await prisma.address.findFirst({ where: { id: param(req, "id"), userId: uid, deletedAt: null } });
  if (!existing) throw notFound("Address");
  // Soft delete: past orders keep their own address snapshot.
  await prisma.address.update({ where: { id: existing.id }, data: { deletedAt: new Date(), isDefault: false } });
  if (existing.isDefault) {
    const next = await prisma.address.findFirst({ where: { userId: uid, deletedAt: null }, orderBy: { updatedAt: "desc" } });
    if (next) await prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  res.json({ ok: true });
});

// ── Wishlist ──
accountRouter.get("/wishlist", async (req, res) => {
  const rows = await prisma.wishlistItem.findMany({ where: { userId: req.auth!.user.id }, orderBy: { createdAt: "desc" } });
  res.json({ items: await cardsByIds(rows.map((r) => r.productId)), productIds: rows.map((r) => r.productId) });
});

accountRouter.post("/wishlist/:productId", async (req, res) => {
  const productId = param(req, "productId");
  if (!(await prisma.product.findFirst({ where: { id: productId, deletedAt: null } }))) throw notFound("Product");
  await prisma.wishlistItem.upsert({ where: { userId_productId: { userId: req.auth!.user.id, productId } }, update: {}, create: { userId: req.auth!.user.id, productId } });
  res.status(201).json({ ok: true });
});

accountRouter.delete("/wishlist/:productId", async (req, res) => {
  await prisma.wishlistItem.deleteMany({ where: { userId: req.auth!.user.id, productId: param(req, "productId") } });
  res.json({ ok: true });
});

accountRouter.get("/recently-viewed", async (req, res) => {
  const rows = await prisma.productView.findMany({ where: { userId: req.auth!.user.id }, orderBy: { viewedAt: "desc" }, take: 20 });
  res.json({ items: await cardsByIds(rows.map((r) => r.productId)) });
});

// ── Notifications & devices ──
accountRouter.get("/notifications", async (req, res) => {
  const { page, pageSize } = query(req, paginationSchema);
  const where = { userId: req.auth!.user.id };
  const [total, unread, items] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { ...where, readAt: null } }),
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, ...paginate(page, pageSize) }),
  ]);
  res.json({ items, unread, meta: pageMeta(total, page, pageSize) });
});

accountRouter.post("/notifications/read", async (req, res) => {
  const { ids } = body(req, z.object({ ids: z.array(z.string()).max(200).optional() }));
  await prisma.notification.updateMany({ where: { userId: req.auth!.user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
  res.json({ ok: true });
});

accountRouter.post("/devices", async (req, res) => {
  const { token, platform } = body(req, z.object({ token: z.string().min(20).max(4096), platform: z.enum(["web", "android", "ios"]).default("web") }));
  await prisma.deviceToken.upsert({ where: { token }, update: { userId: req.auth!.user.id, lastUsedAt: new Date(), platform }, create: { token, platform, userId: req.auth!.user.id } });
  res.status(201).json({ ok: true });
});

accountRouter.delete("/devices", async (req, res) => {
  const { token } = body(req, z.object({ token: z.string().min(20).max(4096) }));
  await prisma.deviceToken.deleteMany({ where: { token, userId: req.auth!.user.id } });
  res.json({ ok: true });
});

// ── Loyalty & referrals ──
accountRouter.get("/loyalty", async (req, res) => {
  const { page, pageSize } = query(req, paginationSchema);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.user.id } });
  const settings = await getSetting("loyalty");
  const where = { userId: user.id };
  const [total, items] = await Promise.all([
    prisma.loyaltyTransaction.count({ where }),
    prisma.loyaltyTransaction.findMany({ where, orderBy: { createdAt: "desc" }, ...paginate(page, pageSize) }),
  ]);
  res.json({
    balance: user.loyaltyPoints,
    lifetimePoints: user.lifetimePoints,
    valuePaise: user.loyaltyPoints * settings.pointValuePaise,
    tier: tierFor(user.lifetimePoints),
    next: nextTier(user.lifetimePoints),
    tiers: LOYALTY_TIERS,
    settings: { pointsPer100: settings.pointsPer100, pointValuePaise: settings.pointValuePaise, maxRedeemPercent: settings.maxRedeemPercent, minRedeemPoints: settings.minRedeemPoints, enabled: settings.enabled },
    items,
    meta: pageMeta(total, page, pageSize),
  });
});

accountRouter.get("/referrals", async (req, res) => {
  const [settings, referrals] = await Promise.all([
    getSetting("loyalty"),
    prisma.referral.findMany({ where: { referrerId: req.auth!.user.id }, include: { referee: { select: { name: true, createdAt: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  res.json({
    code: req.auth!.user.referralCode,
    referrerBonus: settings.referrerBonus,
    refereeBonus: settings.refereeBonus,
    referrals: referrals.map((r) => ({ id: r.id, name: r.referee.name.split(" ")[0], status: r.status, rewardPoints: r.rewardPoints, joinedAt: r.referee.createdAt, completedAt: r.completedAt })),
    totalEarned: referrals.filter((r) => r.status === "COMPLETED").reduce((s, r) => s + r.rewardPoints, 0),
  });
});

// ── Coupons available to this customer ──
accountRouter.get("/coupons", async (req, res) => {
  const now = new Date();
  const coupons = await prisma.coupon.findMany({ where: { isActive: true, isPublic: true, startsAt: { lte: now }, endsAt: { gte: now } }, include: { categories: true, products: { select: { id: true } } } });
  const out = [];
  for (const c of coupons) {
    const ctx = await couponContextFor(req.auth!.user.id, c.id);
    const ev = evaluateCoupon(
      { ...c, productIds: c.products.map((p) => p.id), categoryIds: c.categories.map((x) => x.id) },
      { ...ctx, lines: [{ productId: "_", categoryId: c.categories[0]?.id ?? "_", lineTotalPaise: Math.max(c.minOrderPaise, 1) }], subtotalPaise: Math.max(c.minOrderPaise, 1) },
    );
    const status = !ev.valid && ["PER_USER_LIMIT_REACHED", "FIRST_ORDER_ONLY", "USAGE_LIMIT_REACHED"].includes(ev.reason) ? ev.reason : "AVAILABLE";
    out.push({ code: c.code, title: c.title, description: c.description, summary: describeCoupon(c), endsAt: c.endsAt, isFestival: c.isFestival, categories: c.categories.map((x) => x.name), status, used: ctx.customerUsageCount });
  }
  res.json({ coupons: out });
});

// ── Account deletion ──
accountRouter.post("/deletion-request", async (req, res) => {
  const { reason } = body(req, z.object({ reason: z.string().trim().max(500).optional() }));
  const active = await prisma.order.count({ where: { userId: req.auth!.user.id, status: { in: ["PENDING", "CONFIRMED", "PROCESSING", "PREPARING", "PACKED", "READY_FOR_PICKUP", "DISPATCHED", "OUT_FOR_DELIVERY"] } } });
  if (active) throw badRequest("You have orders in progress. Please request deletion after they are delivered.");
  await prisma.user.update({ where: { id: req.auth!.user.id }, data: { status: "DELETION_REQUESTED", deletionRequestedAt: new Date() } });
  await prisma.auditLog.create({ data: { actorId: req.auth!.user.id, action: "account.deletion_requested", entity: "User", entityId: req.auth!.user.id, metadata: { reason } } });
  res.json({ user: await currentUserPayload(req.auth!.user.id) });
});

accountRouter.delete("/deletion-request", async (req, res) => {
  await prisma.user.updateMany({ where: { id: req.auth!.user.id, status: "DELETION_REQUESTED" }, data: { status: "ACTIVE", deletionRequestedAt: null } });
  res.json({ user: await currentUserPayload(req.auth!.user.id) });
});
