"use client";
import Link from "next/link";
import type { ProductCard as Product } from "@naamdev/api-client";
import { formatINR } from "@naamdev/shared";
import { RatingPill, VegMark, cn } from "@naamdev/ui";
import { useI18n } from "@/lib/i18n";
import { counterRate } from "@/lib/rate";
import { ProductImage } from "../common/product-image";
import { AddButton } from "./add-button";

/**
 * One line of the menu, read like the shop's rate board: the counter rate (per kg or per piece) in
 * large figures, the pack prices under it, and the photo with its Add button on the right.
 */
export function MenuItem({ product, priority, className }: { product: Product; priority?: boolean; className?: string }) {
  const { L } = useI18n();
  const rate = counterRate(product.variants);
  const def = product.variants.find((v) => v.id === product.defaultVariantId) ?? product.variants[0];
  const href = `/product/${product.slug}`;
  return (
    <article className={cn("flex gap-4 py-5", className)}>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <VegMark type={product.foodType} className="mt-[5px] h-[15px] w-[15px]" />
          <h3 className="text-[17px] font-semibold leading-snug text-ink">
            <Link href={href} className="hover:underline hover:decoration-line hover:underline-offset-4">{L(product, "name")}</Link>
            {product.isBestseller ? (
              <span className="ml-2 inline-block translate-y-[-1px] rounded border border-line px-1.5 py-px align-middle text-[12px] font-medium text-ink-soft">Bestseller</span>
            ) : product.isNewArrival ? (
              <span className="ml-2 inline-block translate-y-[-1px] rounded border border-line px-1.5 py-px align-middle text-[12px] font-medium text-ink-soft">New</span>
            ) : null}
          </h3>
        </div>
        <p className="mt-1.5 flex items-baseline gap-1">
          {rate ? (
            <>
              <span className="text-[24px] font-bold leading-none tracking-[-0.02em] text-ink">{formatINR(rate.paise)}</span>
              <span className="text-[13px] text-muted">per {rate.unit}</span>
            </>
          ) : def ? (
            <>
              <span className="text-[24px] font-bold leading-none tracking-[-0.02em] text-ink">{formatINR(def.pricePaise)}</span>
              <span className="text-[13px] text-muted">for {def.label}</span>
            </>
          ) : null}
        </p>
        {product.variants.length > 1 && (
          <ul className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] text-muted" aria-label="Pack prices">
            {product.variants.map((v) => (
              <li key={v.id} className={cn(!v.inStock && "line-through opacity-60")}>
                {v.label} <span className="font-medium text-ink-soft">{formatINR(v.pricePaise)}</span>
                {v.mrpPaise > v.pricePaise && <s className="ml-1">{formatINR(v.mrpPaise)}</s>}
              </li>
            ))}
          </ul>
        )}
        {product.reviewCount > 0 && <RatingPill rating={product.avgRating} count={product.reviewCount} className="mt-2" />}
        <p className="mt-2 line-clamp-2 text-[15px] leading-snug text-muted">{L(product, "shortDescription")}</p>
      </div>
      <div className="w-[128px] shrink-0 pb-5">
        <div className="relative">
          <Link href={href} aria-label={L(product, "name")} className="block h-[120px] overflow-hidden rounded-xl bg-surface-2">
            <ProductImage src={product.image} alt={product.name} className="h-full w-full" priority={priority} sizes={260} />
          </Link>
          {!product.inStock && <span className="pointer-events-none absolute inset-0 rounded-xl bg-white/50 dark:bg-black/45" />}
          <AddButton product={product} variant="overlay" className="absolute inset-x-3 -bottom-5 z-[1]" />
        </div>
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
