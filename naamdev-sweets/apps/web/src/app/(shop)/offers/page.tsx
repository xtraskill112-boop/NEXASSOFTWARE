import type { Metadata } from "next";
import { Suspense } from "react";
import type { ProductList, PublicCoupon } from "@naamdev/api-client";
import { BrandLoader, SectionHeading } from "@naamdev/ui";
import { CouponTicket } from "@/components/home/coupon-ticket";
import { ProductListing } from "@/components/product/listing";
import { fetchPublic } from "@/lib/server-api";

export const metadata: Metadata = { title: "Offers & coupons", description: "Latest coupons, festive discounts and sweets on offer at NAAMDEV SWEETS." };
export const revalidate = 60;

export default async function OffersPage() {
  const [coupons, initial] = await Promise.all([
    fetchPublic<{ coupons: PublicCoupon[] }>("/public/coupons", 60),
    fetchPublic<ProductList>("/catalog/products", 60, { onOffer: "true", pageSize: 24, page: 1, sort: "discount" }),
  ]);
  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6">
      <div className="nd-gradient-royal relative overflow-hidden rounded-[2rem] p-6 text-cream-100 sm:p-10">
        <div className="nd-pattern absolute inset-0 opacity-30" />
        <p className="relative text-[11px] font-bold uppercase tracking-[0.2em] text-saffron-300">Offers & rewards</p>
        <h1 className="relative mt-2 font-display text-4xl font-semibold sm:text-5xl">Sweeter deals, every day</h1>
        <p className="relative mt-2 max-w-lg text-sm text-cream-200/80">Apply a code at checkout. Coupons are validated live, so you always see what you save.</p>
      </div>
      <section className="mt-8">
        <SectionHeading title="Coupons for you" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{(coupons?.coupons ?? []).map((c) => <CouponTicket key={c.code} coupon={c} />)}</div>
      </section>
      <section className="mt-12">
        <SectionHeading title="Sweets on offer" />
        <Suspense fallback={<BrandLoader className="py-20" />}>
          <ProductListing fixed={{ onOffer: "true" }} initial={initial} />
        </Suspense>
      </section>
    </div>
  );
}
