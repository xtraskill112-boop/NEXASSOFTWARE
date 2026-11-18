import { Router } from "express";
import { z } from "zod";
import { C, db, getDoc, getDocs, type Collection, type ContentPage, type Coupon, type Faq, type Product } from "@naamdev/db";
import { pincodeSchema, productListQuerySchema, PUBLIC_SETTING_KEYS, describeCoupon } from "@naamdev/shared";
import { env, integrations } from "../../config/env";
import { notFound } from "../../lib/errors";
import { param, query } from "../../lib/http";
import { getSetting } from "../../lib/settings";
import { catalog } from "./cache";
import { cardsByIds, defaultStore, deliveryEstimate, homeFeed, listProducts, productDetail, suggest } from "./service";
import { trendingSearches } from "./search";

export const catalogRouter = Router();

catalogRouter.get("/home", async (req, res) => {
  res.set("Cache-Control", req.auth ? "private, no-store" : "public, max-age=30");
  res.json(await homeFeed(req.auth?.user.id ?? null));
});

catalogRouter.get("/categories", async (_req, res) => {
  const snap = await catalog();
  const counts = new Map<string, number>();
  for (const p of snap.products) if (p.isActive && !p.deletedAt) counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1);
  res.set("Cache-Control", "public, max-age=60");
  res.json({
    categories: snap.categories
      .filter((c) => c.isActive)
      .map((c) => ({
        id: c.id, slug: c.slug, name: c.name, nameHi: c.nameHi, description: c.description, imageUrl: c.imageUrl,
        accentColor: c.accentColor, parentId: c.parentId, productCount: counts.get(c.id) ?? 0,
      })),
  });
});

catalogRouter.get("/categories/:slug", async (req, res) => {
  const snap = await catalog();
  const c = snap.categoryBySlug.get(param(req, "slug"));
  if (!c || !c.isActive) throw notFound("Category");
  res.json({ category: { ...c, children: snap.categories.filter((x) => x.parentId === c.id && x.isActive) } });
});

catalogRouter.get("/products", async (req, res) => {
  res.json(await listProducts(query(req, productListQuerySchema)));
});

catalogRouter.get("/products/by-ids", async (req, res) => {
  const { ids } = query(req, z.object({ ids: z.string().max(2000) }));
  res.json({ items: await cardsByIds(ids.split(",").filter(Boolean).slice(0, 50)) });
});

catalogRouter.get("/products/:slug", async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  res.json({ product: await productDetail(param(req, "slug"), req.auth?.user.id ?? null) });
});

catalogRouter.get("/search/suggest", async (req, res) => {
  const { q } = query(req, z.object({ q: z.string().trim().min(1).max(60) }));
  res.json(await suggest(q));
});

catalogRouter.get("/search/trending", async (_req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json({ terms: await trendingSearches() });
});

catalogRouter.get("/collections/:slug", async (req, res) => {
  const c = (await getDocs<Collection>(db.collection(C.collections).where("slug", "==", param(req, "slug")).limit(1)))[0];
  if (!c || !c.isActive) throw notFound("Collection");
  const { products, ...collection } = c;
  res.json({ collection, products: await cardsByIds([...products].sort((a, b) => a.sortOrder - b.sortOrder).map((p) => p.productId)) });
});

catalogRouter.get("/delivery-estimate", async (req, res) => {
  const { pincode } = query(req, z.object({ pincode: pincodeSchema }));
  res.json(await deliveryEstimate(pincode));
});

// ── Public content ──
export const publicRouter = Router();

publicRouter.get("/settings", async (_req, res) => {
  const entries = await Promise.all(PUBLIC_SETTING_KEYS.map(async (k) => [k, await getSetting(k)] as const));
  const s = await defaultStore();
  const store = s ? { name: s.name, city: s.city, lat: s.lat, lng: s.lng, openingTime: s.openingTime, closingTime: s.closingTime } : null;
  res.set("Cache-Control", "public, max-age=60");
  res.json({
    ...Object.fromEntries(entries),
    store,
    payments: {
      razorpayEnabled: integrations.razorpay,
      razorpayKeyId: integrations.razorpay ? env.RAZORPAY_KEY_ID : null,
    },
    integrations: { push: integrations.push, sms: integrations.sms, email: integrations.email },
  });
});

publicRouter.get("/pages/:slug", async (req, res) => {
  const page = await getDoc<ContentPage>(db.collection(C.pages).doc(param(req, "slug")));
  if (!page) throw notFound("Page");
  res.set("Cache-Control", "public, max-age=120");
  res.json({ page });
});

publicRouter.get("/faqs", async (_req, res) => {
  const faqs = (await getDocs<Faq>(db.collection(C.faqs).where("isActive", "==", true))).sort(
    (a, b) => a.category.localeCompare(b.category) || a.sortOrder - b.sortOrder,
  );
  res.set("Cache-Control", "public, max-age=120");
  res.json({ faqs });
});

publicRouter.get("/coupons", async (_req, res) => {
  const now = new Date();
  const snap = await catalog();
  const coupons = (await getDocs<Coupon>(db.collection(C.coupons).where("isActive", "==", true)))
    .filter((c) => c.isPublic && c.startsAt <= now && c.endsAt >= now)
    .sort((a, b) => +a.createdAt - +b.createdAt)
    .map((c) => ({
      ...c,
      categories: c.categoryIds.map((id) => snap.categoryById.get(id)).filter(Boolean).map((x) => ({ slug: x!.slug, name: x!.name })),
    }));
  res.json({
    coupons: coupons
      .filter((c) => c.usageLimit == null || c.usedCount < c.usageLimit)
      .map((c) => ({
        code: c.code, title: c.title, description: c.description, type: c.type, scope: c.scope, value: c.value,
        maxDiscountPaise: c.maxDiscountPaise, minOrderPaise: c.minOrderPaise, endsAt: c.endsAt, firstOrderOnly: c.firstOrderOnly,
        isFestival: c.isFestival, categories: c.categories, summary: describeCoupon(c),
      })),
  });
});

publicRouter.get("/sitemap-data", async (_req, res) => {
  const snap = await catalog();
  const [collections, pages] = await Promise.all([
    getDocs<Collection>(db.collection(C.collections).where("isActive", "==", true)),
    getDocs<ContentPage>(db.collection(C.pages)),
  ]);
  const pick = (x: { slug: string; updatedAt: Date }) => ({ slug: x.slug, updatedAt: x.updatedAt });
  const products = snap.products.filter((p: Product) => p.isActive && !p.deletedAt).map(pick);
  const categories = snap.categories.filter((c) => c.isActive).map(pick);
  res.set("Cache-Control", "public, max-age=600");
  res.json({ products, categories, collections: collections.map(pick), pages: pages.map((p) => ({ slug: p.id, updatedAt: p.updatedAt })) });
});
