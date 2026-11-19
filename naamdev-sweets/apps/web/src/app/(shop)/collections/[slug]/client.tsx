"use client";
import Link from "next/link";
import type { ProductCard } from "@naamdev/api-client";
import { BrandLoader, ErrorState } from "@naamdev/ui";
import { ProductImage } from "@/components/common/product-image";
import { themeBg } from "@/components/home/themes";
import { ProductGrid } from "@/components/product/product-rail";
import { useRouteParam } from "@/lib/route-param";
import { useDocumentTitle, usePublic } from "@/lib/use-public";

type Coll = { collection: { name: string; slug: string; description: string | null; theme: string; bannerImageUrl: string | null; isFestival: boolean }; products: ProductCard[] };

export default function CollectionPage() {
  const slug = useRouteParam("slug");
  const { data: d, loading, notFound, error } = usePublic<Coll>(slug ? `/catalog/collections/${encodeURIComponent(slug)}` : null);
  useDocumentTitle(d?.collection.name);
  if (loading) return <BrandLoader className="min-h-[60dvh]" />;
  if (notFound || !d) return <div className="mx-auto max-w-xl px-4 py-20"><ErrorState title="Collection not found" description={notFound ? "It may have been moved or removed." : error ?? "Please try again."} action={<Link href="/" className="font-semibold text-saffron-700">Back to the shop</Link>} /></div>;
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
