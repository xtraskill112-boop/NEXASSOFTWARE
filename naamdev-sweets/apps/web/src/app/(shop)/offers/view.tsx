"use client";
import { Suspense } from "react";
import type { PublicCoupon } from "@naamdev/api-client";
import { BrandLoader, SectionHeading } from "@naamdev/ui";
import { CouponTicket } from "@/components/home/coupon-ticket";
import { ProductListing } from "@/components/product/listing";
import { usePublic } from "@/lib/use-public";

export function OffersView() {
  const { data: coupons } = usePublic<{ coupons: PublicCoupon[] }>("/public/coupons");
  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6">
      <div className="border-b border-line pb-6">
        <h1 className="font-display text-[30px] font-extrabold leading-tight text-ink sm:text-4xl">Offers</h1>
        <p className="mt-1.5 max-w-lg text-[15px] text-ink-soft">Apply a code at checkout. We check it as you apply it, so the discount you see is the one you get.</p>
      </div>
      <section className="mt-8">
        <SectionHeading title="Coupons for you" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{(coupons?.coupons ?? []).map((c) => <CouponTicket key={c.code} coupon={c} />)}</div>
      </section>
      <section className="mt-12">
        <SectionHeading title="Sweets on offer" />
        <Suspense fallback={<BrandLoader className="py-20" />}>
          <ProductListing fixed={{ onOffer: "true" }} />
        </Suspense>
      </section>
    </div>
  );
}
