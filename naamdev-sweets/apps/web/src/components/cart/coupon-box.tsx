"use client";
import { useEffect, useState } from "react";
import { BadgePercent, ChevronRight, X } from "lucide-react";
import type { PublicCoupon } from "@naamdev/api-client";
import { Button, Card, Input, Sheet } from "@naamdev/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { CouponTicket } from "../home/coupon-ticket";

export function CouponBox() {
  const { cart, applyCoupon, removeCoupon } = useCart();
  const { user, requireLogin } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [coupons, setCoupons] = useState<(PublicCoupon & { status?: string })[]>([]);
  useEffect(() => {
    if (!open) return;
    (user ? api.get<{ coupons: (PublicCoupon & { status: string })[] }>("/account/coupons") : api.get<{ coupons: PublicCoupon[] }>("/public/coupons")).then((r) => setCoupons(r.coupons)).catch(() => undefined);
  }, [open, user]);
  const applied = cart?.couponCode && cart.pricing.coupon?.evaluation.valid ? cart.couponCode : null;
  const invalid = cart?.couponCode && cart.pricing.coupon && !cart.pricing.coupon.evaluation.valid ? cart.pricing.coupon.evaluation : null;

  const apply = async (c: string) => {
    if (!requireLogin("/cart")) return;
    setBusy(true);
    const ok = await applyCoupon(c);
    setBusy(false);
    if (ok) { setOpen(false); setCode(""); }
  };

  return (
    <>
      <Card className="p-4">
        {applied ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-pista-400/15 text-pista-600"><BadgePercent className="h-5 w-5" /></span>
              <div><p className="font-mono text-sm font-bold text-ink">{applied}</p><p className="text-xs font-semibold text-pista-600">Coupon applied</p></div>
            </div>
            <button type="button" onClick={() => void removeCoupon()} className="inline-flex items-center gap-1 text-sm font-bold text-maroon-700"><X className="h-4 w-4" />{t("common.remove")}</button>
          </div>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center justify-between gap-3 text-left">
            <span className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-saffron-50 text-saffron-600 dark:bg-saffron-500/10"><BadgePercent className="h-5 w-5" /></span>
              <span><span className="block font-semibold text-ink">{t("cart.applyCoupon")}</span><span className="block text-xs text-muted">View offers & save more</span></span>
            </span>
            <ChevronRight className="h-5 w-5 text-muted" />
          </button>
        )}
        {invalid && !invalid.valid && <p className="mt-3 rounded-xl bg-maroon-50 px-3 py-2 text-xs font-semibold text-maroon-700 dark:bg-maroon-500/10 dark:text-maroon-200">{cart?.couponCode}: {invalid.message}</p>}
      </Card>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("cart.applyCoupon")}>
        <div className="space-y-4 p-5">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) void apply(code.trim()); }}>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t("cart.couponPlaceholder")} aria-label="Coupon code" className="font-mono uppercase tracking-wider" />
            <Button type="submit" loading={busy} disabled={!code.trim()}>{t("common.apply")}</Button>
          </form>
          {coupons.map((c) => <CouponTicket key={c.code} coupon={c} status={c.status} onApply={(x) => void apply(x)} />)}
        </div>
      </Sheet>
    </>
  );
}
