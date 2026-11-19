import { isOurUpload } from "../uploads/storage";
import { Router } from "express";
import { z } from "zod";
import {
  C, db, getDoc, getDocs, getMany, SUB,
  type Address, type Coupon, type DeliveryZone, type LoyaltyTransaction, type Notification, type Order, type Referral, type User,
} from "@naamdev/db";
import { createHash } from "node:crypto";
import { addressSchema, LOYALTY_TIERS, nextTier, paginationSchema, profileUpdateSchema, tierFor, normalizeIndianPhone } from "@naamdev/shared";
import { badRequest, notFound } from "../../lib/errors";
import { audit } from "../../lib/audit";
import { body, pageOf, pageQuery, param, query } from "../../lib/http";
import { getSetting } from "../../lib/settings";
import { requireAuth } from "../../middleware/auth";
import { catalog } from "../catalog/cache";
import { cardsByIds } from "../catalog/service";
import { currentUserPayload } from "../auth/service";
import { couponContextFor } from "../cart/service";
import { evaluateCoupon, describeCoupon } from "@naamdev/shared";

export const accountRouter = Router();
accountRouter.use(requireAuth);

const userRef = (uid: string) => db.collection(C.users).doc(uid);
const addressesOf = (uid: string) => userRef(uid).collection(SUB.addresses);

accountRouter.patch("/profile", async (req, res) => {
  const input = body(req, profileUpdateSchema);
  const uid = req.auth!.user.id;
  // Email is managed by Firebase Authentication (change it from Account → Security); it is synced on sign-in.
  const { name, email: _email, preferredLanguage, ...profile } = input;
  const current = req.auth!.user;
  const patch: Record<string, unknown> = { updatedAt: new Date(), profile: { ...current.profile, ...profile } };
  if (name) {
    patch.name = name;
    patch.searchText = [name, current.email ?? "", current.phone ?? ""].join(" ").toLowerCase();
  }
  if (preferredLanguage) patch.preferredLanguage = preferredLanguage;
  await userRef(uid).update(patch);
  res.json({ user: await currentUserPayload(uid) });
});

accountRouter.patch("/phone", async (req, res) => {
  const { phone } = body(req, z.object({ phone: z.string().trim().max(20) }));
  const p = normalizeIndianPhone(phone);
  if (!p) throw badRequest("Enter a valid 10-digit mobile number", { fields: { phone: "Enter a valid 10-digit mobile number" } }, "VALIDATION_ERROR");
  const u = req.auth!.user;
  await userRef(u.id).update({ phone: p, searchText: [u.name, u.email ?? "", p].join(" ").toLowerCase(), updatedAt: new Date() });
  res.json({ user: await currentUserPayload(u.id) });
});


accountRouter.patch("/avatar", async (req, res) => {
  const { url } = body(req, z.object({ url: z.string().max(800).nullable() }));
  if (url && !isOurUpload(url)) throw badRequest("Upload the avatar first.");
  await userRef(req.auth!.user.id).update({ avatarUrl: url, updatedAt: new Date() });
  res.json({ user: await currentUserPayload(req.auth!.user.id) });
});

// ── Addresses ──
const liveAddresses = async (uid: string) =>
  (await getDocs<Address>(addressesOf(uid))).filter((a) => !a.deletedAt).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || +b.updatedAt - +a.updatedAt);

accountRouter.get("/addresses", async (req, res) => {
  const addresses = await liveAddresses(req.auth!.user.id);
  const zones = await getMany<DeliveryZone>(C.zones, addresses.map((a) => a.pincode));
  const ok = new Set(zones.filter((z) => z.isActive).map((z) => z.pincode));
  const delivery = await getSetting("delivery");
  res.json({ addresses: addresses.map((a) => ({ ...a, serviceable: ok.has(a.pincode) || !delivery.restrictToZones })) });
});

accountRouter.post("/addresses", async (req, res) => {
  const input = body(req, addressSchema);
  const uid = req.auth!.user.id;
  const existing = await liveAddresses(uid);
  if (existing.length >= 20) throw badRequest("You can save up to 20 addresses.");
  const makeDefault = input.isDefault || existing.length === 0;
  const now = new Date();
  const ref = addressesOf(uid).doc();
  const address: Address = {
    userId: uid, type: input.type, label: input.label ?? null, fullName: input.fullName, phone: input.phone, line1: input.line1,
    line2: input.line2 ?? null, landmark: input.landmark ?? null, city: input.city, state: input.state, pincode: input.pincode,
    lat: input.lat ?? null, lng: input.lng ?? null, instructions: input.instructions ?? null, isDefault: makeDefault, deletedAt: null, createdAt: now, updatedAt: now,
  };
  const batch = db.batch();
  if (makeDefault) for (const a of existing.filter((x) => x.isDefault)) batch.update(addressesOf(uid).doc(a.id), { isDefault: false });
  batch.set(ref, address);
  await batch.commit();
  res.status(201).json({ address: { ...address, id: ref.id } });
});

accountRouter.patch("/addresses/:id", async (req, res) => {
  const input = body(req, addressSchema.partial());
  const uid = req.auth!.user.id;
  const existing = await getDoc<Address>(addressesOf(uid).doc(param(req, "id")));
  if (!existing || existing.deletedAt) throw notFound("Address");
  const batch = db.batch();
  if (input.isDefault) for (const a of (await liveAddresses(uid)).filter((x) => x.isDefault && x.id !== existing.id)) batch.update(addressesOf(uid).doc(a.id), { isDefault: false });
  const patch = { ...input, updatedAt: new Date() };
  batch.update(addressesOf(uid).doc(existing.id), patch);
  await batch.commit();
  res.json({ address: { ...existing, ...patch } });
});

accountRouter.delete("/addresses/:id", async (req, res) => {
  const uid = req.auth!.user.id;
  const existing = await getDoc<Address>(addressesOf(uid).doc(param(req, "id")));
  if (!existing || existing.deletedAt) throw notFound("Address");
  // Soft delete: past orders keep their own address snapshot.
  await addressesOf(uid).doc(existing.id).update({ deletedAt: new Date(), isDefault: false, updatedAt: new Date() });
  if (existing.isDefault) {
    const next = (await liveAddresses(uid))[0];
    if (next) await addressesOf(uid).doc(next.id).update({ isDefault: true });
  }
  res.json({ ok: true });
});

// ── Wishlist ──
accountRouter.get("/wishlist", async (req, res) => {
  const rows = (await userRef(req.auth!.user.id).collection(SUB.wishlist).orderBy("createdAt", "desc").get()).docs.map((d) => d.id);
  res.json({ items: await cardsByIds(rows), productIds: rows });
});

accountRouter.post("/wishlist/:productId", async (req, res) => {
  const productId = param(req, "productId");
  const p = (await catalog()).byId.get(productId);
  if (!p || p.deletedAt) throw notFound("Product");
  await userRef(req.auth!.user.id).collection(SUB.wishlist).doc(productId).set({ productId, createdAt: new Date() }, { merge: true });
  res.status(201).json({ ok: true });
});

accountRouter.delete("/wishlist/:productId", async (req, res) => {
  await userRef(req.auth!.user.id).collection(SUB.wishlist).doc(param(req, "productId")).delete();
  res.json({ ok: true });
});

accountRouter.get("/recently-viewed", async (req, res) => {
  const rows = (await userRef(req.auth!.user.id).collection(SUB.views).orderBy("viewedAt", "desc").limit(20).get()).docs.map((d) => d.id);
  res.json({ items: await cardsByIds(rows) });
});

// ── Notifications & devices ──
accountRouter.get("/notifications", async (req, res) => {
  const { page, pageSize } = query(req, paginationSchema);
  const col = userRef(req.auth!.user.id).collection(SUB.notifications);
  const [pg, unread] = await Promise.all([
    pageQuery<Notification>(col.orderBy("createdAt", "desc"), page, pageSize),
    col.where("readAt", "==", null).count().get(),
  ]);
  res.json({ items: pg.items, unread: unread.data().count, meta: pg.meta });
});

accountRouter.post("/notifications/read", async (req, res) => {
  const { ids } = body(req, z.object({ ids: z.array(z.string()).max(200).optional() }));
  const col = userRef(req.auth!.user.id).collection(SUB.notifications);
  const unread = await col.where("readAt", "==", null).limit(500).get();
  const batch = db.batch();
  const now = new Date();
  for (const d of unread.docs) if (!ids || ids.includes(d.id)) batch.update(d.ref, { readAt: now });
  await batch.commit();
  res.json({ ok: true });
});

const tokenId = (token: string) => createHash("sha256").update(token).digest("hex");

accountRouter.post("/devices", async (req, res) => {
  const { token, platform } = body(req, z.object({ token: z.string().min(20).max(4096), platform: z.enum(["web", "android", "ios"]).default("web") }));
  const now = new Date();
  await userRef(req.auth!.user.id).collection(SUB.devices).doc(tokenId(token)).set({ userId: req.auth!.user.id, token, platform, createdAt: now, lastUsedAt: now }, { merge: true });
  res.status(201).json({ ok: true });
});

accountRouter.delete("/devices", async (req, res) => {
  const { token } = body(req, z.object({ token: z.string().min(20).max(4096) }));
  await userRef(req.auth!.user.id).collection(SUB.devices).doc(tokenId(token)).delete();
  res.json({ ok: true });
});

// ── Loyalty & referrals ──
accountRouter.get("/loyalty", async (req, res) => {
  const { page, pageSize } = query(req, paginationSchema);
  const user = (await getDoc<User>(userRef(req.auth!.user.id)))!;
  const settings = await getSetting("loyalty");
  const { items, meta } = await pageQuery<LoyaltyTransaction>(userRef(user.id).collection(SUB.loyalty).orderBy("createdAt", "desc"), page, pageSize);
  res.json({
    balance: user.loyaltyPoints,
    lifetimePoints: user.lifetimePoints,
    valuePaise: user.loyaltyPoints * settings.pointValuePaise,
    tier: tierFor(user.lifetimePoints),
    next: nextTier(user.lifetimePoints),
    tiers: LOYALTY_TIERS,
    settings: { pointsPer100: settings.pointsPer100, pointValuePaise: settings.pointValuePaise, maxRedeemPercent: settings.maxRedeemPercent, minRedeemPoints: settings.minRedeemPoints, enabled: settings.enabled },
    items,
    meta,
  });
});

accountRouter.get("/referrals", async (req, res) => {
  const [settings, referrals] = await Promise.all([
    getSetting("loyalty"),
    getDocs<Referral>(db.collection(C.referrals).where("referrerId", "==", req.auth!.user.id)).then((r) => r.sort((a, b) => +b.createdAt - +a.createdAt)),
  ]);
  res.json({
    code: req.auth!.user.referralCode,
    referrerBonus: settings.referrerBonus,
    refereeBonus: settings.refereeBonus,
    referrals: referrals.map((r) => ({ id: r.id, name: r.refereeName.split(" ")[0], status: r.status, rewardPoints: r.rewardPoints, joinedAt: r.createdAt, completedAt: r.completedAt })),
    totalEarned: referrals.filter((r) => r.status === "COMPLETED").reduce((s, r) => s + r.rewardPoints, 0),
  });
});

// ── Coupons available to this customer ──
accountRouter.get("/coupons", async (req, res) => {
  const now = new Date();
  const snap = await catalog();
  const coupons = (await getDocs<Coupon>(db.collection(C.coupons).where("isActive", "==", true))).filter((c) => c.isPublic && c.startsAt <= now && c.endsAt >= now);
  const out = [];
  for (const c of coupons) {
    const ctx = await couponContextFor(req.auth!.user.id, c.code);
    const ev = evaluateCoupon(c, {
      ...ctx,
      lines: [{ productId: "_", categoryId: c.categoryIds[0] ?? "_", lineTotalPaise: Math.max(c.minOrderPaise, 1) }],
      subtotalPaise: Math.max(c.minOrderPaise, 1),
    });
    const status = !ev.valid && ["PER_USER_LIMIT_REACHED", "FIRST_ORDER_ONLY", "USAGE_LIMIT_REACHED"].includes(ev.reason) ? ev.reason : "AVAILABLE";
    const categories = c.categoryIds.map((id) => snap.categoryById.get(id)?.name).filter(Boolean);
    out.push({ code: c.code, title: c.title, description: c.description, summary: describeCoupon(c), endsAt: c.endsAt, isFestival: c.isFestival, categories, status, used: ctx.customerUsageCount });
  }
  res.json({ coupons: out });
});

// ── Account deletion ──
accountRouter.post("/deletion-request", async (req, res) => {
  const { reason } = body(req, z.object({ reason: z.string().trim().max(500).optional() }));
  const ACTIVE = ["PENDING", "CONFIRMED", "PROCESSING", "PREPARING", "PACKED", "READY_FOR_PICKUP", "DISPATCHED", "OUT_FOR_DELIVERY"];
  const orders = await getDocs<Order>(db.collection(C.orders).where("userId", "==", req.auth!.user.id).select("status").limit(200));
  if (orders.some((o) => ACTIVE.includes(o.status))) throw badRequest("You have orders in progress. Please request deletion after they are delivered.");
  await userRef(req.auth!.user.id).update({ status: "DELETION_REQUESTED", deletionRequestedAt: new Date(), updatedAt: new Date() });
  await audit(req, "account.deletion_requested", "User", req.auth!.user.id, { reason });
  res.json({ user: await currentUserPayload(req.auth!.user.id) });
});

accountRouter.delete("/deletion-request", async (req, res) => {
  if (req.auth!.user.status === "DELETION_REQUESTED") await userRef(req.auth!.user.id).update({ status: "ACTIVE", deletionRequestedAt: null, updatedAt: new Date() });
  res.json({ user: await currentUserPayload(req.auth!.user.id) });
});
