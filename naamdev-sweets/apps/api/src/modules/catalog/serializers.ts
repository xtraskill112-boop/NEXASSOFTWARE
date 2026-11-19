import type { Category, Inventory, Product, ProductVariant, WithId } from "@naamdev/db";
import { discountPercent, sellingPrice } from "@naamdev/shared";
import type { CatalogSnapshot } from "./cache";

/** Cap the stock number exposed publicly so exact inventory isn't leaked. */
const publicStock = (n: number) => Math.max(0, Math.min(n, 50));

export function toVariant(v: ProductVariant, inventory: Inventory | undefined) {
  const available = inventory?.available ?? 0;
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
    lowStock: available > 0 && available <= Math.min(5, inventory?.lowStockThreshold ?? 5),
    isDefault: v.isDefault,
  };
}

export const activeVariants = (p: Product) => p.variants.filter((v) => v.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
export const sortedImages = (p: Product) => [...p.images].sort((a, b) => a.sortOrder - b.sortOrder);

export function categoryRef(c: WithId<Category> | undefined) {
  return c ? { id: c.id, slug: c.slug, name: c.name, nameHi: c.nameHi } : { id: "", slug: "", name: "", nameHi: null };
}

export function toCard(p: WithId<Product>, snap: Pick<CatalogSnapshot, "stock" | "categoryById">) {
  const variants = activeVariants(p).map((v) => toVariant(v, snap.stock.get(v.id)));
  const def = variants.find((v) => v.isDefault && v.inStock) ?? variants.find((v) => v.inStock) ?? variants[0] ?? null;
  const images = sortedImages(p);
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
    image: images[0]?.url ?? null,
    hoverImage: images[1]?.url ?? null,
    category: categoryRef(snap.categoryById.get(p.categoryId)),
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
