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
  if (notFound || !c) return <div className="mx-auto max-w-xl px-4 py-20"><ErrorState title="Category not found" description={notFound ? "It may have been moved or removed." : error ?? "Please try again."} action={<Link href="/" className="font-semibold text-maroon-700">Back to the shop</Link>} /></div>;
  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-4 sm:px-6">
      <header className="mb-2 flex items-center gap-4 border-b border-line pb-5 pt-2 sm:gap-5">
        <ProductImage src={c.imageUrl} alt={c.name} className="h-16 w-16 shrink-0 rounded-lg sm:h-20 sm:w-20" sizes={200} priority />
        <div className="min-w-0">
          <h1 className="font-display text-[28px] font-extrabold leading-tight text-ink sm:text-4xl">{c.name}</h1>
          {c.description && <p className="mt-1 max-w-xl text-[15px] text-ink-soft">{c.description}</p>}
        </div>
      </header>
      <Suspense fallback={<BrandLoader className="py-20" />}>
        <ProductListing fixed={{ category: slug }} />
      </Suspense>
    </div>
  );
}
