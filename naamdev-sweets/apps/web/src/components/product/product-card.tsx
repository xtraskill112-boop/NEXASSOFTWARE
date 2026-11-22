"use client";
import Link from "next/link";
import type { ProductCard as Product } from "@naamdev/api-client";
import { Price, RatingPill, Skeleton, VegMark, cn } from "@naamdev/ui";
import { useI18n } from "@/lib/i18n";
import { ProductImage } from "../common/product-image";
import { AddButton } from "./add-button";
import { WishlistButton } from "./wishlist-button";

export function ProductCard({ product, priority, className, layout = "vertical" }: { product: Product; priority?: boolean; className?: string; layout?: "vertical" | "horizontal" }) {
  const { L } = useI18n();
  const def = product.variants.find((v) => v.id === product.defaultVariantId) ?? product.variants[0];
  const weights = product.variants.map((v) => v.label).slice(0, 4);

  if (layout === "horizontal")
    return (
      <div className={cn("group relative flex gap-3.5 rounded-xl border border-line bg-surface p-3 transition-colors hover:border-ink-soft/40", className)}>
        <Link href={`/product/${product.slug}`} className="absolute inset-0 z-[1] rounded-xl" aria-label={L(product, "name")} />
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg">
          <ProductImage src={product.image} alt={product.name} className="h-full w-full transition duration-500 group-hover:scale-105" priority={priority} sizes={240} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1.5"><VegMark type={product.foodType} />{product.isBestseller && <span className="text-[12px] font-semibold text-maroon-700 dark:text-maroon-200">Bestseller</span>}</div>
          <h3 className="mt-1 line-clamp-1 font-semibold text-ink">{L(product, "name")}</h3>
          <RatingPill rating={product.avgRating} count={product.reviewCount} className="mt-1" />
          <div className="mt-auto flex items-end justify-between gap-2 pt-2">
            {def && <Price pricePaise={def.pricePaise} mrpPaise={def.mrpPaise} size="sm" />}
            <AddButton product={product} size="sm" className="relative z-[2]" />
          </div>
        </div>
      </div>
    );

  return (
    <article className={cn("group relative flex flex-col", className)}>
      <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-2">
        <ProductImage src={product.image} alt={product.name} className="h-full w-full transition-transform duration-300 group-hover:scale-[1.03]" priority={priority} />
        {product.hoverImage && <ProductImage src={product.hoverImage} alt="" className="absolute inset-0 h-full w-full opacity-0 transition-opacity duration-300 group-hover:opacity-100" />}
        {product.isBestseller ? (
          <span className="absolute left-2 top-2 rounded bg-white/95 px-1.5 py-0.5 text-[11px] font-bold text-maroon-800 dark:bg-black/70 dark:text-maroon-100">Bestseller</span>
        ) : product.isNewArrival ? (
          <span className="absolute left-2 top-2 rounded bg-white/95 px-1.5 py-0.5 text-[11px] font-bold text-pista-600 dark:bg-black/70 dark:text-pista-400">New</span>
        ) : null}
        {product.maxDiscountPct > 0 && <span className="absolute bottom-2 left-2 rounded bg-pista-600 px-1.5 py-0.5 text-[11px] font-bold text-white">{product.maxDiscountPct}% off</span>}
        {!product.inStock && <div className="absolute inset-0 grid place-items-center bg-white/55 dark:bg-black/50"><span className="rounded bg-ink px-2 py-1 text-xs font-semibold text-bg">Sold out</span></div>}
        <Link href={`/product/${product.slug}`} className="absolute inset-0 z-[1]" aria-label={L(product, "name")} />
        <WishlistButton productId={product.id} name={product.name} size="sm" className="absolute right-2 top-2 z-[2]" />
      </div>
      <div className="mt-2.5 flex flex-1 flex-col px-0.5">
        <div className="flex items-start gap-1.5">
          <VegMark type={product.foodType} className="mt-[3px]" />
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">
            <Link href={`/product/${product.slug}`} className="hover:text-maroon-700 dark:hover:text-maroon-200">{L(product, "name")}</Link>
          </h3>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[13px] text-muted">
          <span className="truncate">{weights.join(", ")}</span>
          <RatingPill rating={product.avgRating} count={product.reviewCount} />
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2.5">
          <div className="min-w-0 leading-tight">
            {def && <Price pricePaise={def.pricePaise} mrpPaise={def.mrpPaise} size="md" showDiscount={false} />}
            {def && product.variants.length > 1 && <span className="block text-[12px] text-muted">for {def.label}</span>}
          </div>
          <AddButton product={product} size="sm" className="relative z-[2] shrink-0" />
        </div>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-square w-full" rounded="rounded-xl" />
      <Skeleton className="mt-3 h-3 w-1/3" />
      <Skeleton className="mt-2 h-4 w-3/4" />
      <Skeleton className="mt-2 h-3 w-1/2" />
    </div>
  );
}
