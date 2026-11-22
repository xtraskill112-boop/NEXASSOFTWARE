"use client";
import Link from "next/link";
import type { Category } from "@naamdev/api-client";
import { ProductImage } from "@/components/common/product-image";
import { CategoryGridSkeleton } from "@/components/common/skeletons";
import { usePublic } from "@/lib/use-public";

export function CategoriesView() {
  const { data, loading } = usePublic<{ categories: Category[] }>("/catalog/categories");
  if (loading) return <CategoryGridSkeleton />;
  const cats = (data?.categories ?? []).filter((c) => !c.parentId);
  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6">
      <h1 className="font-display text-[30px] font-extrabold text-ink sm:text-4xl">Categories</h1>
      <p className="mt-1 text-[15px] text-muted">{cats.length} categories</p>
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {cats.map((c) => (
          <Link key={c.id} href={`/category/${c.slug}`} className="group overflow-hidden rounded-xl border border-line bg-surface transition-colors hover:border-ink-soft/40">
            <div className="aspect-[4/3] overflow-hidden bg-surface-2">
              <ProductImage src={c.imageUrl} alt={c.name} className="h-full w-full transition-transform duration-300 group-hover:scale-[1.03]" sizes={300} />
            </div>
            <div className="px-3.5 py-3">
              <h2 className="text-[16px] font-bold text-ink">{c.name}</h2>
              <p className="text-[13px] text-muted">{c.productCount} item{c.productCount === 1 ? "" : "s"}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
