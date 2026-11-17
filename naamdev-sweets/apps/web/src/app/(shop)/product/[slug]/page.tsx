import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ChevronRight } from "lucide-react";
import type { ProductDetail } from "@naamdev/api-client";
import { BoughtTogether, ProductInfo, Reviews } from "@/components/product/product-info";
import { Gallery } from "@/components/product/gallery";
import { ProductRail } from "@/components/product/product-rail";
import { PurchasePanel } from "@/components/product/purchase-panel";
import { SITE_URL } from "@/lib/api";
import { fetchAsUser } from "@/lib/server-api";

const getProduct = cache(async (slug: string) => (await fetchAsUser<{ product: ProductDetail }>(`/catalog/products/${encodeURIComponent(slug)}`))?.product ?? null);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getProduct((await params).slug);
  if (!p) return { title: "Product not found" };
  const image = p.images[0]?.url ? new URL(p.images[0].url, SITE_URL).toString() : undefined;
  return {
    title: p.seoTitle?.replace(" | NAAMDEV SWEETS", "") ?? p.name,
    description: p.seoDescription ?? p.shortDescription,
    alternates: { canonical: `/product/${p.slug}` },
    openGraph: { title: p.name, description: p.shortDescription, images: image ? [{ url: image }] : undefined, type: "website" },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getProduct((await params).slug);
  if (!p) notFound();
  const prices = p.variants.map((v) => v.pricePaise / 100);
  const ld = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.shortDescription,
    sku: p.sku,
    image: p.images.map((i) => new URL(i.url, SITE_URL).toString()),
    brand: { "@type": "Brand", name: "NAAMDEV SWEETS" },
    category: p.category.name,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "INR",
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      offerCount: p.variants.length,
      availability: p.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
    ...(p.reviewCount > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: p.avgRating, reviewCount: p.reviewCount } } : {}),
  };
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: p.category.name, item: `${SITE_URL}/category/${p.category.slug}` },
      { "@type": "ListItem", position: 3, name: p.name },
    ],
  };
  return (
    <div className="mx-auto max-w-7xl px-4 pb-28 pt-4 sm:px-6 md:pb-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([ld, crumbs]).replace(/</g, "\\u003c") }} />
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-xs font-medium text-muted">
        <Link href="/" className="hover:text-ink">Home</Link><ChevronRight className="h-3 w-3" />
        <Link href={`/category/${p.category.slug}`} className="hover:text-ink">{p.category.name}</Link><ChevronRight className="h-3 w-3" />
        <span className="truncate text-ink-soft">{p.name}</span>
      </nav>
      <div className="grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
        <Gallery images={p.images} name={p.name} videoUrl={p.videoUrl} />
        <PurchasePanel product={p} />
      </div>
      <div className="mt-10 grid gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
        <div className="space-y-10">
          <ProductInfo product={p} />
          <Reviews product={p} />
        </div>
        <div><BoughtTogether product={p} items={p.boughtTogether} /></div>
      </div>
      <div className="-mx-4 mt-6 sm:-mx-6">
        <ProductRail title="You may also like" products={p.related} href={`/category/${p.category.slug}`} />
      </div>
    </div>
  );
}
