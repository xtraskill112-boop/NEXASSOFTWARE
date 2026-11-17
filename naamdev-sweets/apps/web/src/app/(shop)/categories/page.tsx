import type { Metadata } from "next";
import Link from "next/link";
import type { Category } from "@naamdev/api-client";
import { ProductImage } from "@/components/common/product-image";
import { fetchPublic } from "@/lib/server-api";

export const metadata: Metadata = { title: "All categories", description: "Browse Indian sweets, Bengali sweets, kaju sweets, laddu, barfi, namkeen, cakes and gift hampers." };
export const revalidate = 300;

export default async function CategoriesPage() {
  const data = await fetchPublic<{ categories: Category[] }>("/catalog/categories", 300);
  const cats = (data?.categories ?? []).filter((c) => !c.parentId);
  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6">
      <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">Explore our sweet shop</h1>
      <p className="mt-2 text-muted">{cats.length} categories, made fresh every day.</p>
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {cats.map((c) => (
          <Link key={c.id} href={`/category/${c.slug}`} className="group overflow-hidden rounded-[1.75rem] border border-line-soft bg-surface shadow-card transition hover:-translate-y-1 hover:shadow-lift">
            <div className="aspect-square overflow-hidden" style={{ background: c.accentColor ?? undefined }}>
              <ProductImage src={c.imageUrl} alt={c.name} className="h-full w-full transition duration-700 group-hover:scale-110" sizes={300} />
            </div>
            <div className="p-4">
              <h2 className="font-display text-lg font-semibold text-ink">{c.name}</h2>
              <p className="text-xs text-muted">{c.productCount} items</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
