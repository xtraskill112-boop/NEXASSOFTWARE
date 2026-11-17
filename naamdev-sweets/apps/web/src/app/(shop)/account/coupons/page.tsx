"use client";
import { useEffect, useState } from "react";
import type { PublicCoupon } from "@naamdev/api-client";
import { Skeleton } from "@naamdev/ui";
import { PageTitle } from "@/components/account/nav";
import { CouponTicket } from "@/components/home/coupon-ticket";
import { api } from "@/lib/api";

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<(PublicCoupon & { status: string })[] | null>(null);
  useEffect(() => { api.get<{ coupons: (PublicCoupon & { status: string })[] }>("/account/coupons").then((r) => setCoupons(r.coupons)); }, []);
  return (
    <div>
      <PageTitle title="Coupons & offers" subtitle="Copy a code and apply it in your cart" />
      {!coupons ? <div className="grid gap-4 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div> : (
        <div className="grid gap-4 sm:grid-cols-2">{coupons.map((c) => <CouponTicket key={c.code} coupon={c} status={c.status} />)}</div>
      )}
    </div>
  );
}
