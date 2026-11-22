"use client";
import Link from "next/link";
import type { ProductCard } from "@naamdev/api-client";
import { ErrorState } from "@naamdev/ui";
import { MenuListSkeleton } from "@/components/common/skeletons";
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
  if (loading) return <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6"><MenuListSkeleton /></div>;
  if (notFound || !d) return <div className="mx-auto max-w-xl px-4 py-20"><ErrorState title="Collection not found" description={notFound ? "It may have been moved or removed." : error ?? "Please try again."} action={<Link href="/" className="font-semibold text-maroon-700">Back to the shop</Link>} /></div>;
  const c = d.collection;
  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-4 sm:px-6">
      <header className={`relative mb-8 overflow-hidden rounded-xl p-6 sm:p-10 ${themeBg(c.theme)}`}>
        {c.bannerImageUrl && <ProductImage src={c.bannerImageUrl} alt="" className="absolute inset-y-0 right-0 hidden h-full w-2/5 object-cover sm:block" sizes={900} priority />}
        <div className="relative max-w-xl">
          {c.isFestival && <p className="text-[12.5px] font-semibold text-cream-200">Festival collection</p>}
          <h1 className="mt-1 font-display text-3xl font-extrabold leading-tight sm:text-4xl">{c.name}</h1>
          {c.description && <p className="mt-3 text-sm opacity-90 sm:text-base">{c.description}</p>}
        </div>
      </header>
      <ProductGrid products={d.products} />
    </div>
  );
}
