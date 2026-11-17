import { prisma, type Prisma } from "@naamdev/db";
import { sellingPrice, type ProductListQuery } from "@naamdev/shared";
import { notFound } from "../../lib/errors";
import { getSetting } from "../../lib/settings";
import { cardInclude, toCard, toVariant, type ProductCard } from "./serializers";
import { didYouMean, logSearch, searchProductIds } from "./search";

const LIVE: Prisma.ProductWhereInput = { isActive: true, deletedAt: null, category: { isActive: true } };

export async function cardsByIds(ids: string[]): Promise<ProductCard[]> {
  if (!ids.length) return [];
  const rows = await prisma.product.findMany({ where: { ...LIVE, id: { in: ids } }, include: cardInclude });
  const map = new Map(rows.map((r) => [r.id, toCard(r)]));
  return ids.map((id) => map.get(id)).filter((p): p is ProductCard => !!p);
}

export async function cards(where: Prisma.ProductWhereInput, orderBy: Prisma.ProductOrderByWithRelationInput[], take: number) {
  const rows = await prisma.product.findMany({ where: { ...LIVE, ...where }, include: cardInclude, orderBy, take });
  return rows.map(toCard);
}

async function categoryIdsForSlug(slug: string): Promise<string[]> {
  const cat = await prisma.category.findUnique({ where: { slug }, include: { children: { select: { id: true } } } });
  if (!cat) return [];
  return [cat.id, ...cat.children.map((c) => c.id)];
}

export async function listProducts(q: ProductListQuery) {
  const where: Prisma.ProductWhereInput = { ...LIVE };
  const and: Prisma.ProductWhereInput[] = [];
  let scores: Map<string, number> | null = null;
  let suggestion: string | null = null;

  if (q.q) {
    const hits = await searchProductIds(q.q);
    scores = new Map(hits.map((h) => [h.id, h.score]));
    and.push({ id: { in: hits.map((h) => h.id) } });
    if (!hits.length) suggestion = await didYouMean(q.q);
  }
  if (q.ids) and.push({ id: { in: q.ids.split(",").slice(0, 100) } });
  if (q.category) {
    const ids = await categoryIdsForSlug(q.category);
    and.push({ OR: [{ categoryId: { in: ids } }, { subcategoryId: { in: ids } }] });
  }
  if (q.collection) and.push({ collections: { some: { collection: { slug: q.collection, isActive: true } } } });
  if (q.flag === "bestseller") and.push({ isBestseller: true });
  if (q.flag === "new") and.push({ isNewArrival: true });
  if (q.flag === "featured") and.push({ isFeatured: true });
  if (q.foodType) and.push({ foodType: q.foodType });
  if (q.inStock) and.push({ variants: { some: { isActive: true, inventory: { available: { gt: 0 } } } } });
  if (q.onOffer) and.push({ variants: { some: { isActive: true, salePricePaise: { not: null } } } });
  if (q.minPrice != null || q.maxPrice != null) {
    const range = { gte: q.minPrice ?? undefined, lte: q.maxPrice ?? undefined };
    and.push({ variants: { some: { isActive: true, OR: [{ salePricePaise: range }, { salePricePaise: null, mrpPaise: range }] } } });
  }
  if (and.length) where.AND = and;

  // Catalogues for a sweets brand are small (hundreds of SKUs), so we sort in memory for
  // computed fields (price, discount, relevance) and paginate the result.
  const rows = await prisma.product.findMany({ where, include: cardInclude, take: 1000 });
  let items = rows.map(toCard);

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
  const hits = (await searchProductIds(term, 8)).filter((h) => h.score > 0.2);
  const products = await cardsByIds(hits.slice(0, 6).map((h) => h.id));
  const categories = await prisma.category.findMany({
    where: { isActive: true, OR: [{ name: { contains: term, mode: "insensitive" } }, { nameHi: { contains: term } }] },
    select: { slug: true, name: true, nameHi: true, imageUrl: true },
    take: 3,
  });
  return {
    products: products.map((p) => ({ id: p.id, slug: p.slug, name: p.name, nameHi: p.nameHi, image: p.image, pricePaise: p.minPricePaise, category: p.category.name })),
    categories,
    suggestion: products.length ? null : await didYouMean(term),
  };
}

// ── Home feed ──
async function trendingIds(limit: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ productId: string }[]>`
    SELECT oi."productId" FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId"
    WHERE o."createdAt" > now() - interval '7 days' AND o."status" <> 'CANCELLED'
    GROUP BY oi."productId" ORDER BY SUM(oi."quantity") DESC LIMIT ${limit}`;
  return rows.map((r) => r.productId);
}

async function frequentlyPurchasedIds(userId: string, limit: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ productId: string }[]>`
    SELECT oi."productId" FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId"
    WHERE o."userId" = ${userId} AND o."status" <> 'CANCELLED'
    GROUP BY oi."productId" ORDER BY COUNT(*) DESC, MAX(o."createdAt") DESC LIMIT ${limit}`;
  return rows.map((r) => r.productId);
}

async function recommendedFor(userId: string | null, limit: number) {
  if (userId) {
    const recent = await prisma.productView.findMany({ where: { userId }, orderBy: { viewedAt: "desc" }, take: 20, include: { product: { select: { categoryId: true } } } });
    const bought = await frequentlyPurchasedIds(userId, 20);
    const catIds = [...new Set(recent.map((r) => r.product.categoryId))];
    if (catIds.length) {
      const recs = await cards({ categoryId: { in: catIds }, id: { notIn: [...bought, ...recent.map((r) => r.productId)].slice(0, 50) } }, [{ soldCount: "desc" }, { avgRating: "desc" }], limit);
      if (recs.length >= 4) return recs;
    }
  }
  return cards({ isFeatured: true }, [{ soldCount: "desc" }], limit);
}

export async function homeFeed(userId: string | null) {
  const now = new Date();
  const live = { isActive: true, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] };
  const [banners, categories, sections, coupons, announcement, checkout] = await Promise.all([
    prisma.banner.findMany({ where: live, orderBy: { sortOrder: "asc" } }),
    prisma.category.findMany({ where: { isActive: true, parentId: null }, orderBy: { sortOrder: "asc" } }),
    prisma.homeSection.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, include: { collection: true, category: true } }),
    prisma.coupon.findMany({ where: { isActive: true, isPublic: true, startsAt: { lte: now }, endsAt: { gte: now } }, orderBy: { createdAt: "asc" }, take: 8 }),
    getSetting("announcement"),
    getSetting("checkout"),
  ]);

  const resolved = await Promise.all(
    sections.map(async (s) => {
      const base = { id: s.id, type: s.type, title: s.title, titleHi: s.titleHi, subtitle: s.subtitle };
      const n = s.limit;
      switch (s.type) {
        case "CATEGORY_GRID":
          return { ...base, categories: categories.map((c) => ({ id: c.id, slug: c.slug, name: c.name, nameHi: c.nameHi, imageUrl: c.imageUrl, accentColor: c.accentColor })) };
        case "OFFERS":
          return { ...base, coupons: coupons.map((c) => ({ code: c.code, title: c.title, description: c.description, type: c.type, value: c.value, maxDiscountPaise: c.maxDiscountPaise, minOrderPaise: c.minOrderPaise, endsAt: c.endsAt, isFestival: c.isFestival })) };
        case "BESTSELLERS":
          return { ...base, products: await cards({ isBestseller: true }, [{ soldCount: "desc" }, { avgRating: "desc" }], n) };
        case "POPULAR":
          return { ...base, products: await cards({}, [{ soldCount: "desc" }, { viewCount: "desc" }], n) };
        case "NEW_ARRIVALS":
          return { ...base, products: await cards({ isNewArrival: true }, [{ createdAt: "desc" }], n) };
        case "TRENDING": {
          const ids = await trendingIds(n);
          const items = ids.length >= 4 ? await cardsByIds(ids) : await cards({}, [{ viewCount: "desc" }, { soldCount: "desc" }], n);
          return { ...base, products: items };
        }
        case "FAVOURITES": {
          const rated = await cards({ reviewCount: { gt: 0 } }, [{ avgRating: "desc" }, { reviewCount: "desc" }], n);
          return { ...base, products: rated.length >= 4 ? rated : await cards({ isFeatured: true }, [{ soldCount: "desc" }], n) };
        }
        case "GIFT_HAMPERS":
          return { ...base, products: await cards(s.categoryId ? { categoryId: s.categoryId } : { category: { slug: "gift-hampers" } }, [{ isFeatured: "desc" }, { soldCount: "desc" }], n) };
        case "FESTIVAL_COLLECTION": {
          if (!s.collection || !s.collection.isActive) return null;
          const links = await prisma.collectionProduct.findMany({ where: { collectionId: s.collection.id }, orderBy: { sortOrder: "asc" }, take: n });
          return { ...base, collection: { slug: s.collection.slug, name: s.collection.name, description: s.collection.description, theme: s.collection.theme, bannerImageUrl: s.collection.bannerImageUrl }, products: await cardsByIds(links.map((l) => l.productId)) };
        }
        case "RECENTLY_VIEWED": {
          if (!userId) return { ...base, clientSide: true, products: [] };
          const views = await prisma.productView.findMany({ where: { userId }, orderBy: { viewedAt: "desc" }, take: n });
          return { ...base, products: await cardsByIds(views.map((v) => v.productId)) };
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
  const p = await prisma.product.findFirst({
    where: { ...LIVE, slug },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      category: true,
      subcategory: true,
      variants: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, include: { inventory: true } },
    },
  });
  if (!p) throw notFound("Product");

  const [reviews, histogram, related, wish, together] = await Promise.all([
    prisma.review.findMany({
      where: { productId: p.id, status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { user: { select: { name: true } } },
    }),
    prisma.review.groupBy({ by: ["rating"], where: { productId: p.id, status: "APPROVED" }, _count: true }),
    cards({ categoryId: p.categoryId, id: { not: p.id } }, [{ soldCount: "desc" }], 10),
    userId ? prisma.wishlistItem.findUnique({ where: { userId_productId: { userId, productId: p.id } } }) : null,
    boughtTogether(p.id, p.categoryId),
  ]);

  if (userId) {
    prisma.productView
      .upsert({ where: { userId_productId: { userId, productId: p.id } }, update: { viewedAt: new Date() }, create: { userId, productId: p.id } })
      .catch(() => undefined);
  }
  prisma.product.update({ where: { id: p.id }, data: { viewCount: { increment: 1 } } }).catch(() => undefined);

  const card = toCard({ ...p, images: p.images.slice(0, 2), category: { id: p.category.id, slug: p.category.slug, name: p.category.name, nameHi: p.category.nameHi } });
  const ratingCounts = [5, 4, 3, 2, 1].map((r) => ({ rating: r, count: histogram.find((h) => h.rating === r)?._count ?? 0 }));
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
    images: p.images.map((i) => ({ url: i.url, alt: i.alt ?? p.name, width: i.width, height: i.height })),
    variants: p.variants.map(toVariant),
    subcategory: p.subcategory ? { slug: p.subcategory.slug, name: p.subcategory.name } : null,
    isWishlisted: !!wish,
    reviews: reviews.map((r) => ({ id: r.id, rating: r.rating, title: r.title, body: r.body, createdAt: r.createdAt, author: r.user.name.split(" ")[0] + (r.user.name.split(" ")[1] ? ` ${r.user.name.split(" ")[1]![0]}.` : "") })),
    ratingCounts,
    related,
    boughtTogether: together,
  };
}

async function boughtTogether(productId: string, categoryId: string): Promise<ProductCard[]> {
  const rows = await prisma.$queryRaw<{ productId: string }[]>`
    SELECT oi2."productId" FROM "OrderItem" oi1
    JOIN "OrderItem" oi2 ON oi2."orderId" = oi1."orderId" AND oi2."productId" <> oi1."productId"
    JOIN "Order" o ON o."id" = oi1."orderId"
    WHERE oi1."productId" = ${productId} AND o."status" <> 'CANCELLED'
    GROUP BY oi2."productId" ORDER BY COUNT(*) DESC LIMIT 3`;
  let items = await cardsByIds(rows.map((r) => r.productId));
  if (items.length < 2) {
    // Complementary fallback: bestsellers from other categories (e.g. sweets + namkeen).
    const extra = await cards({ categoryId: { not: categoryId }, isBestseller: true, id: { notIn: items.map((i) => i.id) } }, [{ soldCount: "desc" }], 3 - items.length);
    items = [...items, ...extra];
  }
  return items.filter((i) => i.inStock).slice(0, 3);
}

export async function deliveryEstimate(pincode: string) {
  const [zone, checkout, delivery, store] = await Promise.all([
    prisma.deliveryZone.findUnique({ where: { pincode } }),
    getSetting("checkout"),
    getSetting("delivery"),
    prisma.store.findFirst({ where: { isDefault: true, isActive: true } }),
  ]);
  const serviceable = !!zone?.isActive || (!delivery.restrictToZones && !!store);
  if (!serviceable) return { pincode, serviceable: false as const };
  const eta = (zone?.etaMinutes ?? 60) + checkout.preparationMinutes;
  return {
    pincode,
    serviceable: true as const,
    area: zone?.area ?? null,
    city: zone?.city ?? store?.city ?? null,
    etaMinutes: eta,
    estimatedAt: new Date(Date.now() + eta * 60_000),
    deliveryFeePaise: zone?.deliveryFeePaise ?? checkout.baseDeliveryFeePaise,
    freeDeliveryThresholdPaise: checkout.freeDeliveryThresholdPaise,
  };
}

export { sellingPrice };
