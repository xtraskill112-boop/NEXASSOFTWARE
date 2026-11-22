"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ProductDetail } from "@naamdev/api-client";
import { ErrorState } from "@naamdev/ui";
import { ProductPageSkeleton } from "@/components/common/skeletons";
import { BoughtTogether, ProductInfo, Reviews } from "@/components/product/product-info";
import { Gallery } from "@/components/product/gallery";
import { ProductRail } from "@/components/product/product-rail";
import { PurchasePanel } from "@/components/product/purchase-panel";
import { SITE_URL } from "@/lib/api";
import { useRouteParam } from "@/lib/route-param";
import { useDocumentTitle, usePublic } from "@/lib/use-public";

export default function ProductPage() {
  const slug = useRouteParam("slug");
  // Prices and stock change often, so the product is always loaded fresh from the API.
  const { data, loading, notFound, error } = usePublic<{ product: ProductDetail }>(slug ? `/catalog/products/${encodeURIComponent(slug)}` : null);
  const p = data?.product;
  useDocumentTitle(p ? p.seoTitle?.replace(" | NAAMDEV SWEETS", "") ?? p.name : null);
  if (loading) return <ProductPageSkeleton />;
  if (notFound || !p) return <div className="mx-auto max-w-xl px-4 py-20"><ErrorState title="Sweet not found" description={notFound ? "It may have been moved or removed." : error ?? "Please try again."} action={<Link href="/" className="font-semibold text-maroon-700">Back to the shop</Link>} /></div>;
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
