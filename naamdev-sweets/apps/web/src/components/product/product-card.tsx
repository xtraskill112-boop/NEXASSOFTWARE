"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Flame, Sparkles } from "lucide-react";
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
      <div className={cn("group relative flex gap-4 rounded-3xl border border-line-soft bg-surface p-3 shadow-card transition hover:shadow-lift", className)}>
        <Link href={`/product/${product.slug}`} className="absolute inset-0 z-[1] rounded-3xl" aria-label={L(product, "name")} />
        <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl">
          <ProductImage src={product.image} alt={product.name} className="h-full w-full transition duration-500 group-hover:scale-105" priority={priority} sizes={240} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1.5"><VegMark type={product.foodType} />{product.isBestseller && <span className="text-[10px] font-bold uppercase tracking-wide text-saffron-700">Bestseller</span>}</div>
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
    <motion.article initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.4 }} className={cn("group relative", className)}>
      <div className="relative">
        <div className="relative aspect-square overflow-hidden rounded-[1.6rem] bg-surface-2 shadow-card ring-1 ring-line-soft">
          <ProductImage src={product.image} alt={product.name} className="h-full w-full transition duration-700 ease-out group-hover:scale-[1.06]" priority={priority} />
          {product.hoverImage && <ProductImage src={product.hoverImage} alt="" className="absolute inset-0 h-full w-full opacity-0 transition duration-700 group-hover:opacity-100" />}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/20 to-transparent" />
          <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
            {product.isBestseller && <span className="inline-flex items-center gap-1 rounded-full bg-maroon-700/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-saffron-100 shadow"><Flame className="h-3 w-3" />Bestseller</span>}
            {product.isNewArrival && !product.isBestseller && <span className="inline-flex items-center gap-1 rounded-full bg-pista-600/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow"><Sparkles className="h-3 w-3" />New</span>}
            {product.maxDiscountPct > 0 && <span className="rounded-lg bg-white/95 px-2 py-0.5 text-[11px] font-extrabold text-pista-600 shadow dark:bg-black/60 dark:text-pista-400">{product.maxDiscountPct}% OFF</span>}
          </div>
          {!product.inStock && <div className="absolute inset-0 grid place-items-center bg-white/60 backdrop-blur-[1px] dark:bg-black/50"><span className="rounded-full bg-ink px-3 py-1 text-xs font-bold uppercase tracking-wide text-bg">Sold out</span></div>}
          <Link href={`/product/${product.slug}`} className="absolute inset-0 z-[1]" aria-label={L(product, "name")} />
        </div>
        <WishlistButton productId={product.id} name={product.name} size="sm" className="absolute right-3 top-3 z-[2]" />
        <AddButton product={product} className="absolute -bottom-4 left-1/2 z-[2] -translate-x-1/2" size="sm" />
      </div>
      <Link href={`/product/${product.slug}`} className="mt-6 block px-0.5">
        <div className="flex items-center gap-1.5">
          <VegMark type={product.foodType} />
          <RatingPill rating={product.avgRating} count={product.reviewCount} />
          {!product.reviewCount && <span className="truncate text-[11px] font-medium text-muted">{weights.join(" · ")}</span>}
        </div>
        <h3 className="mt-1.5 line-clamp-1 text-[15px] font-bold leading-snug text-ink">{L(product, "name")}</h3>
        <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">{L(product, "shortDescription")}</p>
        <div className="mt-1.5 flex items-baseline gap-1">
          {def && <Price pricePaise={def.pricePaise} mrpPaise={def.mrpPaise} size="sm" showDiscount={false} />}
          {def && product.variants.length > 1 && <span className="text-[11px] text-muted">/ {def.label}</span>}
        </div>
      </Link>
    </motion.article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-square w-full" rounded="rounded-[1.6rem]" />
      <Skeleton className="mt-3 h-3 w-1/3" />
      <Skeleton className="mt-2 h-4 w-3/4" />
      <Skeleton className="mt-2 h-3 w-1/2" />
    </div>
  );
}
