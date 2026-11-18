import { Router, type Request } from "express";
import { z } from "zod";
import {
  C, db, getDoc, getDocs, getMany,
  type Banner, type Collection, type ContentPage, type Coupon, type CouponUsage, type Faq, type HomeSection, type Order, type User,
} from "@naamdev/db";
import { bannerInputSchema, contentPageSchema, couponInputSchema, faqSchema, homeSectionInputSchema, promoNotificationSchema } from "@naamdev/shared";
import { audit } from "../../lib/audit";
import { clearCached } from "../../lib/cache";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { body, param } from "../../lib/http";
import { requirePermission } from "../../middleware/auth";
import { catalog } from "../catalog/cache";
import { notify } from "../notifications/service";

export const adminMarketingRouter = Router();
const touched = () => clearCached("home:");

// ── Coupons (document id = code) ──
adminMarketingRouter.get("/coupons", requirePermission("coupons.manage"), async (_req, res) => {
  const [coupons, usages, snap] = await Promise.all([getDocs<Coupon>(db.collection(C.coupons)), getDocs<CouponUsage>(db.collection(C.couponUsages)), catalog()]);
  res.json({
    coupons: coupons
      .sort((a, b) => +b.createdAt - +a.createdAt)
      .map((c) => {
        const used = usages.filter((u) => u.couponCode === c.code);
        return {
          ...c,
          products: c.productIds.map((id) => ({ id, name: snap.byId.get(id)?.name ?? "" })),
          categories: c.categoryIds.map((id) => ({ id, name: snap.categoryById.get(id)?.name ?? "" })),
          _count: { usages: used.length },
          totalDiscountPaise: used.reduce((s, u) => s + u.discountPaise, 0),
        };
      }),
  });
});

function couponFields(input: z.infer<typeof couponInputSchema>) {
  return {
    ...input,
    description: input.description ?? null,
    maxDiscountPaise: input.maxDiscountPaise ?? null,
    usageLimit: input.usageLimit ?? null,
    productIds: input.scope === "PRODUCT" ? input.productIds : [],
    categoryIds: input.scope === "CATEGORY" ? input.categoryIds : [],
  };
}

adminMarketingRouter.post("/coupons", requirePermission("coupons.manage"), async (req, res) => {
  const input = body(req, couponInputSchema);
  const ref = db.collection(C.coupons).doc(input.code);
  const now = new Date();
  const coupon: Coupon = { ...couponFields(input), usedCount: 0, createdAt: now, updatedAt: now };
  try {
    await ref.create(coupon);
  } catch (err) {
    if ((err as { code?: number }).code === 6) throw conflict("A coupon with this code already exists.", undefined, "DUPLICATE");
    throw err;
  }
  touched();
  await audit(req, "coupon.create", "Coupon", input.code, { code: input.code });
  res.status(201).json({ coupon: { ...coupon, id: ref.id } });
});

adminMarketingRouter.put("/coupons/:id", requirePermission("coupons.manage"), async (req, res) => {
  const ref = db.collection(C.coupons).doc(param(req, "id"));
  const existing = await getDoc<Coupon>(ref);
  if (!existing) throw notFound("Coupon");
  const input = body(req, couponInputSchema);
  if (input.code !== existing.code) throw badRequest("A coupon's code can't be changed. Create a new coupon instead.");
  const patch = { ...couponFields(input), updatedAt: new Date() };
  await ref.update(patch);
  touched();
  await audit(req, "coupon.update", "Coupon", existing.id, { code: existing.code });
  res.json({ coupon: { ...existing, ...patch } });
});

adminMarketingRouter.patch("/coupons/:id/active", requirePermission("coupons.manage"), async (req, res) => {
  const { isActive } = body(req, z.object({ isActive: z.boolean() }));
  const ref = db.collection(C.coupons).doc(param(req, "id"));
  const existing = await getDoc<Coupon>(ref);
  if (!existing) throw notFound("Coupon");
  await ref.update({ isActive, updatedAt: new Date() });
  touched();
  await audit(req, "coupon.toggle", "Coupon", existing.id, { isActive });
  res.json({ coupon: { ...existing, isActive } });
});

adminMarketingRouter.get("/coupons/:id/usage", requirePermission("coupons.manage"), async (req, res) => {
  const usages = (await getDocs<CouponUsage>(db.collection(C.couponUsages).where("couponCode", "==", param(req, "id"))))
    .sort((a, b) => +b.createdAt - +a.createdAt)
    .slice(0, 200);
  const [users, orders] = await Promise.all([getMany<User>(C.users, usages.map((u) => u.userId)), getMany<Order>(C.orders, usages.map((u) => u.orderId))]);
  const byUser = new Map(users.map((u) => [u.id, u]));
  const byOrder = new Map(orders.map((o) => [o.id, o]));
  res.json({
    usages: usages.map((u) => ({
      ...u,
      user: byUser.get(u.userId) ? { name: byUser.get(u.userId)!.name } : null,
      order: byOrder.get(u.orderId) ? { orderNumber: byOrder.get(u.orderId)!.orderNumber, totalPaise: byOrder.get(u.orderId)!.totalPaise, status: byOrder.get(u.orderId)!.status } : null,
    })),
  });
});

/** Simple CRUD for small content collections. */
function crud<T extends object>(opts: {
  path: string;
  collection: string;
  key: string;
  schema: z.ZodType<T>;
  entity: string;
  audit: string;
  sort: (a: T & { id: string }, b: T & { id: string }) => number;
  normalize?: (input: T) => Record<string, unknown>;
  decorate?: (rows: (T & { id: string })[]) => Promise<unknown[]>;
}) {
  const col = () => db.collection(opts.collection);
  const norm = (req: Request) => (opts.normalize ?? ((x: T) => x as Record<string, unknown>))(body(req, opts.schema));
  adminMarketingRouter.get(`/${opts.path}`, requirePermission("content.manage"), async (_req, res) => {
    const rows = (await getDocs<T>(col())).sort(opts.sort);
    res.json({ [opts.key]: opts.decorate ? await opts.decorate(rows) : rows });
  });
  adminMarketingRouter.post(`/${opts.path}`, requirePermission("content.manage"), async (req, res) => {
    const now = new Date();
    const data = { ...norm(req), createdAt: now, updatedAt: now };
    const ref = await col().add(data);
    touched();
    await audit(req, `${opts.audit}.create`, opts.entity, ref.id);
    res.status(201).json({ [opts.key.replace(/s$/, "")]: { ...data, id: ref.id } });
  });
  adminMarketingRouter.put(`/${opts.path}/:id`, requirePermission("content.manage"), async (req, res) => {
    const ref = col().doc(param(req, "id"));
    const existing = await getDoc<T>(ref);
    if (!existing) throw notFound(opts.entity);
    const patch = { ...norm(req), updatedAt: new Date() };
    await ref.update(patch);
    touched();
    await audit(req, `${opts.audit}.update`, opts.entity, ref.id);
    res.json({ [opts.key.replace(/s$/, "")]: { ...existing, ...patch } });
  });
  adminMarketingRouter.delete(`/${opts.path}/:id`, requirePermission("content.manage"), async (req, res) => {
    const ref = col().doc(param(req, "id"));
    const existing = await getDoc<Record<string, unknown>>(ref);
    if (!existing) throw notFound(opts.entity);
    await ref.delete();
    touched();
    await audit(req, `${opts.audit}.delete`, opts.entity, ref.id, existing.question ? { question: existing.question } : existing.title ? { title: existing.title } : undefined);
    res.json({ ok: true });
  });
}

const nullable = (o: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) if (o[k] === undefined) o[k] = null;
  return o;
};

// ── Banners ──
crud<Banner>({
  path: "banners", collection: C.banners, key: "banners", schema: bannerInputSchema as unknown as z.ZodType<Banner>, entity: "Banner", audit: "banner",
  sort: (a, b) => a.placement.localeCompare(b.placement) || a.sortOrder - b.sortOrder,
  normalize: (x) => nullable({ ...x }, ["titleHi", "subtitle", "eyebrow", "imageUrl", "ctaLabel", "ctaLink", "startsAt", "endsAt"]),
});

// ── Home sections ──
adminMarketingRouter.post("/home-sections/reorder", requirePermission("content.manage"), async (req, res) => {
  const { ids } = body(req, z.object({ ids: z.array(z.string()).max(50) }));
  const batch = db.batch();
  ids.forEach((id, i) => batch.update(db.collection(C.homeSections).doc(id), { sortOrder: i, updatedAt: new Date() }));
  await batch.commit();
  touched();
  await audit(req, "home_section.reorder", "HomeSection", null, { ids });
  res.json({ ok: true });
});

crud<HomeSection>({
  path: "home-sections", collection: C.homeSections, key: "sections", schema: homeSectionInputSchema as unknown as z.ZodType<HomeSection>, entity: "HomeSection", audit: "home_section",
  sort: (a, b) => a.sortOrder - b.sortOrder,
  normalize: (x) => nullable({ ...x }, ["titleHi", "subtitle", "collectionId", "categoryId"]),
  decorate: async (rows) => {
    const [snap, cols] = await Promise.all([catalog(), getDocs<Collection>(db.collection(C.collections))]);
    const colName = new Map(cols.map((c) => [c.id, c.name]));
    return rows.map((s) => ({
      ...s,
      collection: s.collectionId ? { name: colName.get(s.collectionId) ?? "" } : null,
      category: s.categoryId ? { name: snap.categoryById.get(s.categoryId)?.name ?? "" } : null,
    }));
  },
});

// ── Pages & FAQs ──
adminMarketingRouter.get("/pages", requirePermission("content.manage"), async (_req, res) => {
  const pages = (await getDocs<ContentPage>(db.collection(C.pages))).sort((a, b) => a.id.localeCompare(b.id));
  res.json({ pages });
});

adminMarketingRouter.put("/pages/:slug", requirePermission("content.manage"), async (req, res) => {
  const input = body(req, contentPageSchema);
  const slug = param(req, "slug");
  const ref = db.collection(C.pages).doc(slug);
  const existing = await getDoc<ContentPage>(ref);
  const now = new Date();
  const page = {
    slug, title: input.title, titleHi: input.titleHi ?? null, body: input.body, bodyHi: input.bodyHi ?? null, seoDescription: input.seoDescription ?? null,
    updatedById: req.auth!.user.id, createdAt: existing?.createdAt ?? now, updatedAt: now,
  };
  await ref.set(page);
  await audit(req, "page.update", "ContentPage", slug, { slug });
  res.json({ page: { ...page, id: slug } });
});

crud<Faq>({
  path: "faqs", collection: C.faqs, key: "faqs", schema: faqSchema as unknown as z.ZodType<Faq>, entity: "FAQ", audit: "faq",
  sort: (a, b) => a.category.localeCompare(b.category) || a.sortOrder - b.sortOrder,
  normalize: (x) => nullable({ ...x }, ["questionHi", "answerHi"]),
});

// ── Promotional notifications ──
adminMarketingRouter.post("/notifications/broadcast", requirePermission("notifications.send"), async (req, res) => {
  const input = body(req, promoNotificationSchema);
  const users = (await getDocs<User>(db.collection(C.users).where("roleKey", "==", "CUSTOMER").where("status", "==", "ACTIVE"))).filter(
    (u) => input.audience !== "MARKETING_OPT_IN" || u.profile.marketingOptIn,
  );
  for (const u of users)
    notify({ userId: u.id, type: "PROMOTION", title: input.title, body: input.body, link: input.link, channels: input.channels, template: "promo.broadcast", promotional: true });
  await audit(req, "notification.broadcast", "Notification", null, { ...input, recipients: users.length });
  res.json({ queued: users.length });
});
