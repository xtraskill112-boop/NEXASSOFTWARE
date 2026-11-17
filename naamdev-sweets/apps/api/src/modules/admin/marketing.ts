import { Router } from "express";
import { prisma } from "@naamdev/db";
import { bannerInputSchema, contentPageSchema, couponInputSchema, faqSchema, homeSectionInputSchema, promoNotificationSchema } from "@naamdev/shared";
import { z } from "zod";
import { audit } from "../../lib/audit";
import { notFound } from "../../lib/errors";
import { body, param } from "../../lib/http";
import { requirePermission } from "../../middleware/auth";
import { notify } from "../notifications/service";

export const adminMarketingRouter = Router();

// ── Coupons ──
adminMarketingRouter.get("/coupons", requirePermission("coupons.manage"), async (_req, res) => {
  const coupons = await prisma.coupon.findMany({
    orderBy: { createdAt: "desc" },
    include: { products: { select: { id: true, name: true } }, categories: { select: { id: true, name: true } }, _count: { select: { usages: true } } },
  });
  const totals = await prisma.couponUsage.groupBy({ by: ["couponId"], _sum: { discountPaise: true } });
  res.json({ coupons: coupons.map((c) => ({ ...c, totalDiscountPaise: totals.find((t) => t.couponId === c.id)?._sum.discountPaise ?? 0 })) });
});

function couponData(input: z.infer<typeof couponInputSchema>) {
  const { productIds, categoryIds, ...rest } = input;
  return {
    ...rest,
    products: { set: input.scope === "PRODUCT" ? productIds.map((id) => ({ id })) : [] },
    categories: { set: input.scope === "CATEGORY" ? categoryIds.map((id) => ({ id })) : [] },
  };
}

adminMarketingRouter.post("/coupons", requirePermission("coupons.manage"), async (req, res) => {
  const input = body(req, couponInputSchema);
  const { products, categories, ...data } = couponData(input);
  const c = await prisma.coupon.create({ data: { ...data, products: { connect: products.set }, categories: { connect: categories.set } } });
  await audit(req, "coupon.create", "Coupon", c.id, { code: c.code });
  res.status(201).json({ coupon: c });
});

adminMarketingRouter.put("/coupons/:id", requirePermission("coupons.manage"), async (req, res) => {
  const c = await prisma.coupon.update({ where: { id: param(req, "id") }, data: couponData(body(req, couponInputSchema)) });
  await audit(req, "coupon.update", "Coupon", c.id, { code: c.code });
  res.json({ coupon: c });
});

adminMarketingRouter.patch("/coupons/:id/active", requirePermission("coupons.manage"), async (req, res) => {
  const { isActive } = body(req, z.object({ isActive: z.boolean() }));
  const c = await prisma.coupon.update({ where: { id: param(req, "id") }, data: { isActive } });
  await audit(req, "coupon.toggle", "Coupon", c.id, { isActive });
  res.json({ coupon: c });
});

adminMarketingRouter.get("/coupons/:id/usage", requirePermission("coupons.manage"), async (req, res) => {
  const usages = await prisma.couponUsage.findMany({ where: { couponId: param(req, "id") }, orderBy: { createdAt: "desc" }, take: 200, include: { user: { select: { name: true } }, order: { select: { orderNumber: true, totalPaise: true, status: true } } } });
  res.json({ usages });
});

// ── Banners ──
adminMarketingRouter.get("/banners", requirePermission("content.manage"), async (_req, res) => {
  res.json({ banners: await prisma.banner.findMany({ orderBy: [{ placement: "asc" }, { sortOrder: "asc" }] }) });
});
adminMarketingRouter.post("/banners", requirePermission("content.manage"), async (req, res) => {
  const b = await prisma.banner.create({ data: body(req, bannerInputSchema) });
  await audit(req, "banner.create", "Banner", b.id);
  res.status(201).json({ banner: b });
});
adminMarketingRouter.put("/banners/:id", requirePermission("content.manage"), async (req, res) => {
  const b = await prisma.banner.update({ where: { id: param(req, "id") }, data: body(req, bannerInputSchema) });
  await audit(req, "banner.update", "Banner", b.id);
  res.json({ banner: b });
});
adminMarketingRouter.delete("/banners/:id", requirePermission("content.manage"), async (req, res) => {
  await prisma.banner.delete({ where: { id: param(req, "id") } });
  await audit(req, "banner.delete", "Banner", param(req, "id"));
  res.json({ ok: true });
});

// ── Home sections ──
adminMarketingRouter.get("/home-sections", requirePermission("content.manage"), async (_req, res) => {
  res.json({ sections: await prisma.homeSection.findMany({ orderBy: { sortOrder: "asc" }, include: { collection: { select: { name: true } }, category: { select: { name: true } } } }) });
});
adminMarketingRouter.post("/home-sections", requirePermission("content.manage"), async (req, res) => {
  const s = await prisma.homeSection.create({ data: body(req, homeSectionInputSchema) });
  await audit(req, "home_section.create", "HomeSection", s.id);
  res.status(201).json({ section: s });
});
adminMarketingRouter.put("/home-sections/:id", requirePermission("content.manage"), async (req, res) => {
  const s = await prisma.homeSection.update({ where: { id: param(req, "id") }, data: body(req, homeSectionInputSchema) });
  await audit(req, "home_section.update", "HomeSection", s.id);
  res.json({ section: s });
});
adminMarketingRouter.post("/home-sections/reorder", requirePermission("content.manage"), async (req, res) => {
  const { ids } = body(req, z.object({ ids: z.array(z.string()).max(50) }));
  await prisma.$transaction(ids.map((id, i) => prisma.homeSection.update({ where: { id }, data: { sortOrder: i } })));
  res.json({ ok: true });
});
adminMarketingRouter.delete("/home-sections/:id", requirePermission("content.manage"), async (req, res) => {
  await prisma.homeSection.delete({ where: { id: param(req, "id") } });
  res.json({ ok: true });
});

// ── Pages & FAQs ──
adminMarketingRouter.get("/pages", requirePermission("content.manage"), async (_req, res) => {
  res.json({ pages: await prisma.contentPage.findMany({ orderBy: { slug: "asc" } }) });
});
adminMarketingRouter.put("/pages/:slug", requirePermission("content.manage"), async (req, res) => {
  const input = body(req, contentPageSchema);
  const slug = param(req, "slug");
  const page = await prisma.contentPage.upsert({ where: { slug }, update: { ...input, updatedById: req.auth!.user.id }, create: { ...input, slug, updatedById: req.auth!.user.id } });
  await audit(req, "page.update", "ContentPage", page.id, { slug });
  res.json({ page });
});
adminMarketingRouter.get("/faqs", requirePermission("content.manage"), async (_req, res) => {
  res.json({ faqs: await prisma.faq.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }] }) });
});
adminMarketingRouter.post("/faqs", requirePermission("content.manage"), async (req, res) => {
  res.status(201).json({ faq: await prisma.faq.create({ data: body(req, faqSchema) }) });
});
adminMarketingRouter.put("/faqs/:id", requirePermission("content.manage"), async (req, res) => {
  res.json({ faq: await prisma.faq.update({ where: { id: param(req, "id") }, data: body(req, faqSchema) }) });
});
adminMarketingRouter.delete("/faqs/:id", requirePermission("content.manage"), async (req, res) => {
  const f = await prisma.faq.findUnique({ where: { id: param(req, "id") } });
  if (!f) throw notFound("FAQ");
  await prisma.faq.delete({ where: { id: f.id } });
  res.json({ ok: true });
});

// ── Promotional notifications ──
adminMarketingRouter.post("/notifications/broadcast", requirePermission("notifications.send"), async (req, res) => {
  const input = body(req, promoNotificationSchema);
  const users = await prisma.user.findMany({
    where: { status: "ACTIVE", role: { key: "CUSTOMER" }, ...(input.audience === "MARKETING_OPT_IN" ? { profile: { marketingOptIn: true } } : {}) },
    select: { id: true },
  });
  for (const u of users)
    notify({ userId: u.id, type: "PROMOTION", title: input.title, body: input.body, link: input.link, channels: input.channels, template: "promo.broadcast", promotional: true });
  await audit(req, "notification.broadcast", "Notification", null, { ...input, recipients: users.length });
  res.json({ queued: users.length });
});
