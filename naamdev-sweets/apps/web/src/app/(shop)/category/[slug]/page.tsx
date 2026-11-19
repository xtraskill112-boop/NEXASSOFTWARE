import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Category, ProductList } from "@naamdev/api-client";
import { BrandLoader } from "@naamdev/ui";
import { ProductImage } from "@/components/common/product-image";
import { ProductListing } from "@/components/product/listing";
import { fetchPublic } from "@/lib/server-api";

export const revalidate = 60;

async function getCategory(slug: string) {
  return (await fetchPublic<{ category: Category & { children: Category[] } }>(`/catalog/categories/${encodeURIComponent(slug)}`, 300))?.category ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = await getCategory((await params).slug);
  if (!c) return { title: "Category not found" };
  return { title: `${c.name} — Order Online`, description: c.description ?? `Buy fresh ${c.name.toLowerCase()} online from NAAMDEV SWEETS.`, alternates: { canonical: `/category/${c.slug}` } };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [c, initial] = await Promise.all([getCategory(slug), fetchPublic<ProductList>("/catalog/products", 60, { category: slug, pageSize: 24, page: 1 })]);
  if (!c) notFound();
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
        <ProductListing fixed={{ category: slug }} initial={initial} />
      </Suspense>
    </div>
  );
}
