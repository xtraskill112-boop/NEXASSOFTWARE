"use client";
import Link from "next/link";
import { Star } from "lucide-react";
import type { ProductCard as Product } from "@naamdev/api-client";
import { Price, RatingPill, VegMark, cn } from "@naamdev/ui";
import { useI18n } from "@/lib/i18n";
import { ProductImage } from "../common/product-image";
import { AddButton } from "./add-button";

/**
 * A menu line the way food-delivery apps show it: details on the left, the photo on the right with
 * the ADD button sitting on its bottom edge.
 */
export function MenuItem({ product, priority, className }: { product: Product; priority?: boolean; className?: string }) {
  const { L } = useI18n();
  const def = product.variants.find((v) => v.id === product.defaultVariantId) ?? product.variants[0];
  const multi = product.variants.length > 1;
  const href = `/product/${product.slug}`;
  return (
    <article className={cn("flex gap-4 py-5", className)}>
      <div className="min-w-0 flex-1">
        <div className="flex h-5 items-center gap-2">
          <VegMark type={product.foodType} className="h-[15px] w-[15px]" />
          {product.isBestseller ? (
            <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#d4561d] dark:text-[#f08a55]"><Star className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} />Bestseller</span>
          ) : product.isNewArrival ? (
            <span className="text-[13px] font-semibold text-go-600 dark:text-go-500">New</span>
          ) : null}
        </div>
        <h3 className="mt-1 text-[17px] font-bold leading-snug text-ink">
          <Link href={href} className="hover:underline hover:decoration-line hover:underline-offset-4">{L(product, "name")}</Link>
        </h3>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
          {def && <Price pricePaise={def.pricePaise} mrpPaise={def.mrpPaise} size="md" />}
          {def && multi && <span className="text-[13px] text-muted">for {def.label}</span>}
        </div>
        {product.reviewCount > 0 && <RatingPill rating={product.avgRating} count={product.reviewCount} className="mt-1.5" />}
        <p className="mt-2 line-clamp-2 text-[14px] leading-snug text-muted">{L(product, "shortDescription")}</p>
      </div>
      <div className="w-[136px] shrink-0">
        <div className="relative">
          <Link href={href} aria-label={L(product, "name")} className="block h-[128px] overflow-hidden rounded-2xl bg-surface-2">
            <ProductImage src={product.image} alt={product.name} className="h-full w-full" priority={priority} sizes={280} />
          </Link>
          {!product.inStock && <span className="pointer-events-none absolute inset-0 rounded-2xl bg-white/50 dark:bg-black/45" />}
          <AddButton product={product} variant="overlay" className="absolute inset-x-3 -bottom-4 z-[1]" />
        </div>
        <p className="mt-6 h-4 text-center text-[11px] text-muted">{multi && product.inStock ? "Choose weight" : ""}</p>
      </div>
    </article>
  );
}

/** A list of menu lines: one column on phones, two on wide screens. */
export function MenuList({ products, className }: { products: Product[]; className?: string }) {
  return (
    <div className={cn("grid lg:grid-cols-2 lg:gap-x-10", className)}>
      {products.map((p, i) => <MenuItem key={p.id} product={p} priority={i < 2} className="border-b border-dashed border-line" />)}
    </div>
  );
}
