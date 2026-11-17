import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ProductCard } from "@naamdev/api-client";
import { ProductImage } from "@/components/common/product-image";
import { themeBg } from "@/components/home/themes";
import { ProductGrid } from "@/components/product/product-rail";
import { fetchPublic } from "@/lib/server-api";

export const revalidate = 60;

type Coll = { collection: { name: string; slug: string; description: string | null; theme: string; bannerImageUrl: string | null; isFestival: boolean }; products: ProductCard[] };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await fetchPublic<Coll>(`/catalog/collections/${(await params).slug}`, 120);
  return d ? { title: d.collection.name, description: d.collection.description ?? undefined } : { title: "Collection not found" };
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const d = await fetchPublic<Coll>(`/catalog/collections/${(await params).slug}`, 120);
  if (!d) notFound();
  const c = d.collection;
  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-4 sm:px-6">
      <header className={`relative mb-8 overflow-hidden rounded-[2rem] p-6 sm:p-12 ${themeBg(c.theme)}`}>
        {c.bannerImageUrl && <ProductImage src={c.bannerImageUrl} alt="" className="absolute inset-0 h-full w-full opacity-50" sizes={1600} priority />}
        <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-transparent" />
        <div className="relative max-w-xl">
          {c.isFestival && <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-saffron-200">Festival collection</p>}
          <h1 className="mt-2 font-display text-4xl font-semibold leading-tight sm:text-5xl">{c.name}</h1>
          {c.description && <p className="mt-3 text-sm opacity-90 sm:text-base">{c.description}</p>}
        </div>
      </header>
      <ProductGrid products={d.products} />
    </div>
  );
}
