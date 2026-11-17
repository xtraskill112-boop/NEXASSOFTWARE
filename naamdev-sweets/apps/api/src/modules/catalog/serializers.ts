import type { Prisma } from "@naamdev/db";
import { discountPercent, sellingPrice } from "@naamdev/shared";

export const cardInclude = {
  images: { orderBy: { sortOrder: "asc" }, take: 2 },
  category: { select: { id: true, slug: true, name: true, nameHi: true } },
  variants: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, include: { inventory: true } },
} satisfies Prisma.ProductInclude;

export type CardProduct = Prisma.ProductGetPayload<{ include: typeof cardInclude }>;

/** Cap the stock number exposed publicly so exact inventory isn't leaked. */
const publicStock = (n: number) => Math.max(0, Math.min(n, 50));

export function toVariant(v: CardProduct["variants"][number]) {
  const available = v.inventory?.available ?? 0;
  const price = sellingPrice(v);
  return {
    id: v.id,
    label: v.label,
    weightGrams: v.weightGrams,
    sku: v.sku,
    mrpPaise: v.mrpPaise,
    salePricePaise: v.salePricePaise,
    pricePaise: price,
    discountPct: discountPercent(v.mrpPaise, v.salePricePaise),
    available: publicStock(available),
    inStock: available > 0,
    lowStock: available > 0 && available <= Math.min(5, v.inventory?.lowStockThreshold ?? 5),
    isDefault: v.isDefault,
  };
}

export function toCard(p: CardProduct) {
  const variants = p.variants.map(toVariant);
  const def = variants.find((v) => v.isDefault && v.inStock) ?? variants.find((v) => v.inStock) ?? variants[0] ?? null;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    nameHi: p.nameHi,
    shortDescription: p.shortDescription,
    shortDescriptionHi: p.shortDescriptionHi,
    foodType: p.foodType,
    isBestseller: p.isBestseller,
    isNewArrival: p.isNewArrival,
    isFeatured: p.isFeatured,
    avgRating: Math.round(p.avgRating * 10) / 10,
    reviewCount: p.reviewCount,
    soldCount: p.soldCount,
    image: p.images[0]?.url ?? null,
    hoverImage: p.images[1]?.url ?? null,
    category: p.category,
    variants,
    defaultVariantId: def?.id ?? null,
    minPricePaise: variants.length ? Math.min(...variants.map((v) => v.pricePaise)) : 0,
    maxDiscountPct: variants.length ? Math.max(...variants.map((v) => v.discountPct)) : 0,
    inStock: variants.some((v) => v.inStock),
    tags: p.tags,
    createdAt: p.createdAt,
  };
}

export type ProductCard = ReturnType<typeof toCard>;
