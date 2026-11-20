"use client";
import { motion } from "framer-motion";
import { Truck } from "lucide-react";
import type { PricingResult } from "@naamdev/shared";
import { formatINR } from "@naamdev/shared";
import { Card } from "@naamdev/ui";
import { useI18n } from "@/lib/i18n";

export function FreeDeliveryProgress({ pricing }: { pricing: PricingResult }) {
  const { t } = useI18n();
  const pct = Math.min(100, (pricing.subtotalPaise / Math.max(1, pricing.freeDeliveryThresholdPaise)) * 100);
  const unlocked = pricing.amountToFreeDeliveryPaise <= 0 || pricing.deliveryFeeWaived;
  return (
    <div className="rounded-2xl bg-saffron-50 p-4 dark:bg-saffron-500/10">
      <p className="flex items-center gap-2 text-sm font-semibold text-saffron-900 dark:text-saffron-100">
        <Truck className="h-4 w-4" />
        {unlocked ? t("cart.freeDeliveryUnlocked") : t("cart.freeDeliveryProgress", { amount: formatINR(pricing.amountToFreeDeliveryPaise) })}
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80 dark:bg-black/30">
        <motion.div className="h-full rounded-full nd-gradient-saffron" initial={{ width: 0 }} animate={{ width: `${unlocked ? 100 : pct}%` }} transition={{ type: "spring", damping: 20 }} />
      </div>
    </div>
  );
}

export function BillSummary({ pricing, couponCode }: { pricing: PricingResult; couponCode?: string | null }) {
  const { t } = useI18n();
  const row = (label: React.ReactNode, value: React.ReactNode, cls = "") => (
    <div className={`flex items-center justify-between gap-4 py-1.5 text-sm ${cls}`}><span className="text-ink-soft">{label}</span><span className="font-semibold tabular-nums text-ink">{value}</span></div>
  );
  return (
    <Card className="p-5">
      <h3 className="mb-2 font-display text-lg font-semibold text-ink">Bill details</h3>
      {row(t("cart.mrpTotal"), formatINR(pricing.mrpTotalPaise))}
      {pricing.itemDiscountPaise > 0 && row(t("cart.productDiscount"), <span className="text-pista-600 dark:text-pista-400">−{formatINR(pricing.itemDiscountPaise)}</span>)}
      {pricing.couponDiscountPaise > 0 && row(<>{t("cart.couponDiscount")} {couponCode && <span className="ml-1 rounded bg-pista-400/15 px-1.5 py-0.5 font-mono text-[11px] font-bold text-pista-600">{couponCode}</span>}</>, <span className="text-pista-600 dark:text-pista-400">−{formatINR(pricing.couponDiscountPaise)}</span>)}
      {pricing.loyaltyDiscountPaise > 0 && row(`${t("cart.loyaltyDiscount")} (${pricing.pointsRedeemed} pts)`, <span className="text-pista-600 dark:text-pista-400">−{formatINR(pricing.loyaltyDiscountPaise)}</span>)}
      {row(t("cart.deliveryFee"), pricing.deliveryFeePaise === 0 ? <span className="text-pista-600 dark:text-pista-400">{t("common.free")}</span> : formatINR(pricing.deliveryFeePaise))}
      {pricing.taxPaise > 0 && row(pricing.taxIncluded ? t("cart.taxesIncluded") : t("cart.taxes"), formatINR(pricing.taxPaise), pricing.taxIncluded ? "opacity-75" : "")}
      <div className="my-3 border-t border-dashed border-line" />
      <div className="flex items-center justify-between"><span className="font-display text-lg font-semibold text-ink">{t("cart.toPay")}</span><span className="text-xl font-extrabold tabular-nums text-ink">{formatINR(pricing.totalPaise)}</span></div>
      {pricing.totalSavingsPaise > 0 && (
        <p className="mt-4 rounded-xl bg-pista-400/10 px-3 py-2 text-center text-sm font-semibold text-pista-600 dark:text-pista-400">🎉 {t("cart.savings", { amount: formatINR(pricing.totalSavingsPaise) })}</p>
      )}
    </Card>
  );
}
