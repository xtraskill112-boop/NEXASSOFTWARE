import {
  C, db, FieldValue, getDoc, getDocs, SUB,
  type Banner, type Coupon, type Collection, type DeliveryZone, type HomeSection, type Order, type Product, type Review, type Store, type WithId,
} from "@naamdev/db";
import { sellingPrice, type ProductListQuery } from "@naamdev/shared";
import { cached } from "../../lib/cache";
import { notFound } from "../../lib/errors";
import { getSetting } from "../../lib/settings";
import { catalog, type CatalogSnapshot } from "./cache";
import { activeVariants, categoryRef, sortedImages, toCard, toVariant, type ProductCard } from "./serializers";
import { didYouMean, logSearch, searchProductIds } from "./search";

const isLive = (p: WithId<Product>, snap: CatalogSnapshot) => p.isActive && !p.deletedAt && !!snap.categoryById.get(p.categoryId)?.isActive;

export async function cardsByIds(ids: string[]): Promise<ProductCard[]> {
  if (!ids.length) return [];
  const snap = await catalog();
  return ids
    .map((id) => snap.byId.get(id))
    .filter((p): p is WithId<Product> => !!p && isLive(p, snap))
    .map((p) => toCard(p, snap));
}

type Sorter = (a: WithId<Product>, b: WithId<Product>) => number;
const by = (...keys: ((p: WithId<Product>) => number)[]): Sorter => (a, b) => {
  for (const k of keys) {
    const d = k(b) - k(a);
    if (d) return d;
  }
  return 0;
};

/** Live products matching `filter`, sorted (descending keys), as cards. */
export async function cards(filter: (p: WithId<Product>) => boolean, sort: Sorter, take: number): Promise<ProductCard[]> {
  const snap = await catalog();
  return snap.products.filter((p) => isLive(p, snap) && filter(p)).sort(sort).slice(0, take).map((p) => toCard(p, snap));
}

function categoryIdsForSlug(snap: CatalogSnapshot, slug: string): string[] {
  const cat = snap.categoryBySlug.get(slug);
  if (!cat) return [];
  return [cat.id, ...snap.categories.filter((c) => c.parentId === cat.id).map((c) => c.id)];
}

async function collectionBySlug(slug: string) {
  const rows = await getDocs<Collection>(db.collection(C.collections).where("slug", "==", slug).limit(1));
  return rows[0] ?? null;
}

export async function listProducts(q: ProductListQuery) {
  const snap = await catalog();
  let scores: Map<string, number> | null = null;
  let suggestion: string | null = null;
  const filters: ((p: WithId<Product>) => boolean)[] = [];

  if (q.q) {
    const hits = await searchProductIds(q.q);
    scores = new Map(hits.map((h) => [h.id, h.score]));
    filters.push((p) => scores!.has(p.id));
    if (!hits.length) suggestion = await didYouMean(q.q);
  }
  if (q.ids) {
    const ids = new Set(q.ids.split(",").slice(0, 100));
    filters.push((p) => ids.has(p.id));
  }
  if (q.category) {
    const ids = new Set(categoryIdsForSlug(snap, q.category));
    filters.push((p) => ids.has(p.categoryId) || (!!p.subcategoryId && ids.has(p.subcategoryId)));
  }
  if (q.collection) {
    const col = await collectionBySlug(q.collection);
    const ids = new Set(col?.isActive ? col.products.map((x) => x.productId) : []);
    filters.push((p) => ids.has(p.id));
  }
  if (q.flag === "bestseller") filters.push((p) => p.isBestseller);
  if (q.flag === "new") filters.push((p) => p.isNewArrival);
  if (q.flag === "featured") filters.push((p) => p.isFeatured);
  if (q.foodType) filters.push((p) => p.foodType === q.foodType);
  if (q.inStock) filters.push((p) => activeVariants(p).some((v) => (snap.stock.get(v.id)?.available ?? 0) > 0));
  if (q.onOffer) filters.push((p) => activeVariants(p).some((v) => v.salePricePaise != null));
  if (q.minPrice != null || q.maxPrice != null)
    filters.push((p) =>
      activeVariants(p).some((v) => {
        const price = sellingPrice(v);
        return (q.minPrice == null || price >= q.minPrice) && (q.maxPrice == null || price <= q.maxPrice);
      }),
    );

  let items = snap.products.filter((p) => isLive(p, snap) && filters.every((f) => f(p))).map((p) => toCard(p, snap));

  const price = (p: ProductCard) => p.minPricePaise;
  switch (q.sort) {
    case "price_asc": items.sort((a, b) => price(a) - price(b)); break;
    case "price_desc": items.sort((a, b) => price(b) - price(a)); break;
    case "popular": items.sort((a, b) => b.soldCount - a.soldCount); break;
    case "rating": items.sort((a, b) => b.avgRating - a.avgRating || b.reviewCount - a.reviewCount); break;
    case "newest": items.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)); break;
    case "discount": items.sort((a, b) => b.maxDiscountPct - a.maxDiscountPct); break;
    default:
      items.sort((a, b) =>
        scores
          ? (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0)
          : Number(b.isFeatured) - Number(a.isFeatured) || Number(b.isBestseller) - Number(a.isBestseller) || b.soldCount - a.soldCount,
      );
  }
  // Out-of-stock items sink to the bottom regardless of sort.
  items = [...items.filter((p) => p.inStock), ...items.filter((p) => !p.inStock)];

  const facetCats = new Map<string, { slug: string; name: string; count: number }>();
  for (const p of items) {
    const f = facetCats.get(p.category.slug) ?? { slug: p.category.slug, name: p.category.name, count: 0 };
    f.count++;
    facetCats.set(p.category.slug, f);
  }
  const prices = items.map(price);
  const total = items.length;
  const start = (q.page - 1) * q.pageSize;
  if (q.q && q.page === 1) logSearch(q.q, total).catch(() => undefined);

  return {
    items: items.slice(start, start + q.pageSize),
    meta: { total, page: q.page, pageSize: q.pageSize, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) },
    facets: {
      categories: [...facetCats.values()].sort((a, b) => b.count - a.count),
      priceRange: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
    },
    suggestion,
  };
}

export async function suggest(term: string) {
  const snap = await catalog();
  const hits = (await searchProductIds(term, 8)).filter((h) => h.score > 0.2);
  const products = await cardsByIds(hits.slice(0, 6).map((h) => h.id));
  const t = term.toLowerCase();
  const categories = snap.categories
    .filter((c) => c.isActive && (c.name.toLowerCase().includes(t) || (c.nameHi ?? "").includes(term)))
    .slice(0, 3)
    .map((c) => ({ slug: c.slug, name: c.name, nameHi: c.nameHi, imageUrl: c.imageUrl }));
  return {
    products: products.map((p) => ({ id: p.id, slug: p.slug, name: p.name, nameHi: p.nameHi, image: p.image, pricePaise: p.minPricePaise, category: p.category.name })),
    categories,
    suggestion: products.length ? null : await didYouMean(term),
  };
}

// ── Order-based signals (computed from recent orders, cached per instance) ──
const DAY = 86_400_000;

function tally(orders: WithId<Order>[], weight: (o: WithId<Order>, i: Order["items"][number]) => number, exclude?: string) {
  const score = new Map<string, number>();
  for (const o of orders) {
    if (o.status === "CANCELLED") continue;
    for (const i of o.items) if (i.productId !== exclude) score.set(i.productId, (score.get(i.productId) ?? 0) + weight(o, i));
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

function trendingIds(limit: number): Promise<string[]> {
  return cached(`trending:${limit}`, 10 * 60_000, async () => {
    const orders = await getDocs<Order>(db.collection(C.orders).where("createdAt", ">=", new Date(Date.now() - 7 * DAY)).orderBy("createdAt", "desc").limit(500));
    return tally(orders, (_o, i) => i.quantity).slice(0, limit);
  });
}

function frequentlyPurchasedIds(userId: string, limit: number): Promise<string[]> {
  return cached(`frequent:${userId}:${limit}`, 2 * 60_000, async () => {
    const orders = await getDocs<Order>(db.collection(C.orders).where("userId", "==", userId).orderBy("createdAt", "desc").limit(30));
    return tally(orders, () => 1).slice(0, limit);
  });
}

async function recentlyViewedIds(userId: string, limit: number): Promise<string[]> {
  const views = await db.collection(C.users).doc(userId).collection(SUB.views).orderBy("viewedAt", "desc").limit(limit).get();
  return views.docs.map((d) => d.id);
}

async function recommendedFor(userId: string | null, limit: number) {
  if (userId) {
    const snap = await catalog();
    const [recent, bought] = await Promise.all([recentlyViewedIds(userId, 20), frequentlyPurchasedIds(userId, 20)]);
    const catIds = new Set(recent.map((id) => snap.byId.get(id)?.categoryId).filter(Boolean));
    if (catIds.size) {
      const skip = new Set([...bought, ...recent]);
      const recs = await cards((p) => catIds.has(p.categoryId) && !skip.has(p.id), by((p) => p.soldCount, (p) => p.avgRating), limit);
      if (recs.length >= 4) return recs;
    }
  }
  return cards((p) => p.isFeatured, by((p) => p.soldCount), limit);
}

/**
 * The whole menu on one page: every live product, grouped under its top-level category (in the
 * categories' own order). Within a category, items in stock come first, then bestsellers, then the
 * most ordered; names break ties so the order stays put between visits.
 */
export function fullMenu(snap: CatalogSnapshot) {
  const topOf = (id: string) => {
    const c = snap.categoryById.get(id);
    return c?.parentId ? snap.categoryById.get(c.parentId) ?? c : c;
  };
  const byCategory = new Map<string, ProductCard[]>();
  for (const p of snap.products) {
    if (!isLive(p, snap)) continue;
    const top = topOf(p.categoryId);
    if (!top?.isActive) continue;
    const list = byCategory.get(top.id) ?? [];
    list.push(toCard(p, snap));
    byCategory.set(top.id, list);
  }
  return snap.categories
    .filter((c) => byCategory.has(c.id))
    .map((c) => ({
      category: { id: c.id, slug: c.slug, name: c.name, nameHi: c.nameHi },
      products: byCategory.get(c.id)!.sort(
        (a, b) => Number(b.inStock) - Number(a.inStock) || Number(b.isBestseller) - Number(a.isBestseller) || b.soldCount - a.soldCount || a.name.localeCompare(b.name),
      ),
    }));
}

const isCurrent = (x: { isActive: boolean; startsAt: Date | null; endsAt: Date | null }, now = new Date()) =>
  x.isActive && (!x.startsAt || x.startsAt <= now) && (!x.endsAt || x.endsAt >= now);

const homeStatic = () =>
  cached("home:static", 60_000, async () => {
    const [banners, sections, coupons, collections] = await Promise.all([
      getDocs<Banner>(db.collection(C.banners)),
      getDocs<HomeSection>(db.collection(C.homeSections)),
      getDocs<Coupon>(db.collection(C.coupons).where("isActive", "==", true)),
      getDocs<Collection>(db.collection(C.collections)),
    ]);
    return { banners, sections, coupons, collections };
  });

export async function homeFeed(userId: string | null) {
  const now = new Date();
  const [snap, stat, announcement, checkout] = await Promise.all([catalog(), homeStatic(), getSetting("announcement"), getSetting("checkout")]);
  const banners = stat.banners.filter((b) => isCurrent(b, now)).sort((a, b) => a.sortOrder - b.sortOrder);
  const categories = snap.categories.filter((c) => c.isActive && !c.parentId);
  const sections = stat.sections.filter((s) => s.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const coupons = stat.coupons
    .filter((c) => c.isPublic && c.startsAt <= now && c.endsAt >= now)
    .sort((a, b) => +a.createdAt - +b.createdAt)
    .slice(0, 8);
  const collectionsById = new Map(stat.collections.map((c) => [c.id, c]));

  const resolved = await Promise.all(
    sections.map(async (s) => {
      const base = { id: s.id, type: s.type, title: s.title, titleHi: s.titleHi, subtitle: s.subtitle };
      const n = s.limit;
      switch (s.type) {
        case "FULL_MENU": {
          const groups = fullMenu(snap);
          return groups.length ? { ...base, groups } : null;
        }
        case "CATEGORY_GRID":
          return { ...base, categories: categories.map((c) => ({ id: c.id, slug: c.slug, name: c.name, nameHi: c.nameHi, imageUrl: c.imageUrl, accentColor: c.accentColor })) };
        case "OFFERS":
          return { ...base, coupons: coupons.map((c) => ({ code: c.code, title: c.title, description: c.description, type: c.type, value: c.value, maxDiscountPaise: c.maxDiscountPaise, minOrderPaise: c.minOrderPaise, endsAt: c.endsAt, isFestival: c.isFestival })) };
        case "BESTSELLERS":
          return { ...base, products: await cards((p) => p.isBestseller, by((p) => p.soldCount, (p) => p.avgRating), n) };
        case "POPULAR":
          return { ...base, products: await cards(() => true, by((p) => p.soldCount, (p) => p.viewCount), n) };
        case "NEW_ARRIVALS":
          return { ...base, products: await cards((p) => p.isNewArrival, by((p) => +p.createdAt), n) };
        case "TRENDING": {
          const ids = await trendingIds(n);
          const items = ids.length >= 4 ? await cardsByIds(ids) : await cards(() => true, by((p) => p.viewCount, (p) => p.soldCount), n);
          return { ...base, products: items };
        }
        case "FAVOURITES": {
          const rated = await cards((p) => p.reviewCount > 0, by((p) => p.avgRating, (p) => p.reviewCount), n);
          return { ...base, products: rated.length >= 4 ? rated : await cards((p) => p.isFeatured, by((p) => p.soldCount), n) };
        }
        case "GIFT_HAMPERS": {
          const catId = s.categoryId ?? snap.categoryBySlug.get("gift-hampers")?.id;
          return { ...base, products: await cards((p) => p.categoryId === catId, by((p) => Number(p.isFeatured), (p) => p.soldCount), n) };
        }
        case "FESTIVAL_COLLECTION": {
          const col = s.collectionId ? collectionsById.get(s.collectionId) : null;
          if (!col || !col.isActive) return null;
          const ids = [...col.products].sort((a, b) => a.sortOrder - b.sortOrder).slice(0, n).map((x) => x.productId);
          return { ...base, collection: { slug: col.slug, name: col.name, description: col.description, theme: col.theme, bannerImageUrl: col.bannerImageUrl }, products: await cardsByIds(ids) };
        }
        case "RECENTLY_VIEWED": {
          if (!userId) return { ...base, clientSide: true, products: [] };
          return { ...base, products: await cardsByIds(await recentlyViewedIds(userId, n)) };
        }
        case "FREQUENTLY_PURCHASED": {
          if (!userId) return null;
          return { ...base, products: await cardsByIds(await frequentlyPurchasedIds(userId, n)) };
        }
        case "RECOMMENDED":
          return { ...base, products: await recommendedFor(userId, n) };
        default:
          return null;
      }
    }),
  );

  return {
    announcement: announcement.active ? announcement : null,
    banners: {
      hero: banners.filter((b) => b.placement === "HERO"),
      strip: banners.filter((b) => b.placement === "OFFER_STRIP"),
      promo: banners.filter((b) => b.placement === "PROMO_GRID"),
    },
    freeDeliveryThresholdPaise: checkout.freeDeliveryThresholdPaise,
    sections: resolved.filter((s) => s && (!("products" in s) || s.products.length > 0 || ("clientSide" in s && s.clientSide))),
  };
}

// ── Product detail ──
export async function productDetail(slug: string, userId: string | null) {
  const snap = await catalog();
  const p = snap.bySlug.get(slug);
  if (!p || !isLive(p, snap)) throw notFound("Product");

  const [reviews, related, wish, together] = await Promise.all([
    getDocs<Review>(db.collection(C.reviews).where("productId", "==", p.id).where("status", "==", "APPROVED")),
    cards((x) => x.categoryId === p.categoryId && x.id !== p.id, by((x) => x.soldCount), 10),
    userId ? db.collection(C.users).doc(userId).collection(SUB.wishlist).doc(p.id).get() : null,
    boughtTogether(p.id, p.categoryId),
  ]);

  if (userId)
    db.collection(C.users).doc(userId).collection(SUB.views).doc(p.id).set({ productId: p.id, viewedAt: new Date() }).catch(() => undefined);
  db.collection(C.products).doc(p.id).update({ viewCount: FieldValue.increment(1) }).catch(() => undefined);

  const card = toCard(p, snap);
  const approved = reviews.sort((a, b) => +b.createdAt - +a.createdAt);
  const ratingCounts = [5, 4, 3, 2, 1].map((r) => ({ rating: r, count: approved.filter((x) => x.rating === r).length }));
  const subcategory = p.subcategoryId ? snap.categoryById.get(p.subcategoryId) : undefined;
  return {
    ...card,
    description: p.description,
    ingredients: p.ingredients,
    allergens: p.allergens,
    nutrition: p.nutrition,
    manufacturingInfo: p.manufacturingInfo,
    shelfLifeDays: p.shelfLifeDays,
    storageInstructions: p.storageInstructions,
    videoUrl: p.videoUrl,
    sku: p.sku,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    images: sortedImages(p).map((i) => ({ url: i.url, alt: i.alt ?? p.name, width: i.width, height: i.height })),
    variants: activeVariants(p).map((v) => toVariant(v, snap.stock.get(v.id))),
    subcategory: subcategory ? { slug: subcategory.slug, name: subcategory.name } : null,
    category: categoryRef(snap.categoryById.get(p.categoryId)),
    isWishlisted: !!wish?.exists,
    reviews: approved.slice(0, 10).map((r) => {
      const parts = r.userName.split(" ");
      return { id: r.id, rating: r.rating, title: r.title, body: r.body, createdAt: r.createdAt, author: parts[0] + (parts[1] ? ` ${parts[1][0]}.` : "") };
    }),
    ratingCounts,
    related,
    boughtTogether: together,
  };
}

function boughtTogether(productId: string, categoryId: string): Promise<ProductCard[]> {
  return cached(`together:${productId}`, 30 * 60_000, async () => {
    const orders = await getDocs<Order>(db.collection(C.orders).where("productIds", "array-contains", productId).limit(200));
    let items = await cardsByIds(tally(orders, () => 1, productId).slice(0, 3));
    if (items.length < 2) {
      // Complementary fallback: bestsellers from other categories (e.g. sweets + namkeen).
      const have = new Set(items.map((i) => i.id));
      const extra = await cards((p) => p.categoryId !== categoryId && p.isBestseller && !have.has(p.id), by((p) => p.soldCount), 3 - items.length);
      items = [...items, ...extra];
    }
    return items.filter((i) => i.inStock).slice(0, 3);
  });
}

export const defaultStore = () =>
  cached("store:default", 60_000, async () => {
    const rows = await getDocs<Store>(db.collection(C.stores).where("isDefault", "==", true).limit(1));
    return rows[0] ?? null;
  });

export async function deliveryEstimate(pincode: string) {
  const [zone, checkout, delivery, store] = await Promise.all([
    getDoc<DeliveryZone>(db.collection(C.zones).doc(pincode)),
    getSetting("checkout"),
    getSetting("delivery"),
    defaultStore(),
  ]);
  const activeStore = store?.isActive ? store : null;
  const serviceable = !!zone?.isActive || (!delivery.restrictToZones && !!activeStore);
  if (!serviceable) return { pincode, serviceable: false as const };
  const eta = (zone?.etaMinutes ?? 60) + checkout.preparationMinutes;
  return {
    pincode,
    serviceable: true as const,
    area: zone?.area ?? null,
    city: zone?.city ?? activeStore?.city ?? null,
    etaMinutes: eta,
    estimatedAt: new Date(Date.now() + eta * 60_000),
    deliveryFeePaise: zone?.deliveryFeePaise ?? checkout.baseDeliveryFeePaise,
    freeDeliveryThresholdPaise: checkout.freeDeliveryThresholdPaise,
  };
}

export { sellingPrice };
