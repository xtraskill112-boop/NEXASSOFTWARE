"use client";
import Link from "next/link";
import { Suspense } from "react";
import type { Category } from "@naamdev/api-client";
import { BrandLoader, ErrorState } from "@naamdev/ui";
import { ProductImage } from "@/components/common/product-image";
import { ProductListing } from "@/components/product/listing";
import { useRouteParam } from "@/lib/route-param";
import { useDocumentTitle, usePublic } from "@/lib/use-public";

export default function CategoryPage() {
  const slug = useRouteParam("slug");
  const { data, loading, notFound, error } = usePublic<{ category: Category & { children: Category[] } }>(slug ? `/catalog/categories/${encodeURIComponent(slug)}` : null);
  const c = data?.category;
  useDocumentTitle(c ? `${c.name} — Order Online` : null);
  if (loading) return <BrandLoader className="min-h-[60dvh]" />;
  if (notFound || !c) return <div className="mx-auto max-w-xl px-4 py-20"><ErrorState title="Category not found" description={notFound ? "It may have been moved or removed." : error ?? "Please try again."} action={<Link href="/" className="font-semibold text-saffron-700">Back to the shop</Link>} /></div>;
  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-4 sm:px-6">
      <header className="relative mb-2 flex items-center gap-5 overflow-hidden rounded-[2rem] p-5 sm:p-8" style={{ background: `linear-gradient(120deg, ${c.accentColor ?? "#F57F0E"}33, transparent 70%)` }}>
        <ProductImage src={c.imageUrl} alt={c.name} className="h-20 w-20 shrink-0 rounded-full shadow-card sm:h-28 sm:w-28" sizes={240} priority />
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-saffron-700 dark:text-saffron-300">Category</p>
          <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">{c.name}</h1>
          {c.description && <p className="mt-1 max-w-xl text-sm text-ink-soft">{c.description}</p>}
        </div>
      </header>
      <Suspense fallback={<BrandLoader className="py-20" />}>
        <ProductListing fixed={{ category: slug }} />
      </Suspense>
    </div>
  );
}
