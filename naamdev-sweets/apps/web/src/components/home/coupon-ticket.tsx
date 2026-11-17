"use client";
import { useState } from "react";
import { Check, Copy, Gift } from "lucide-react";
import type { PublicCoupon } from "@naamdev/api-client";
import { describeCoupon } from "@naamdev/shared";
import { cn } from "@naamdev/ui";

export function CouponTicket({ coupon, className, onApply, status }: { coupon: PublicCoupon; className?: string; onApply?: (code: string) => void; status?: string }) {
  const [copied, setCopied] = useState(false);
  const disabled = status && status !== "AVAILABLE";
  return (
    <div className={cn("relative flex overflow-hidden rounded-3xl border border-saffron-200 bg-gradient-to-br from-saffron-50 to-cream-200 shadow-card dark:border-saffron-500/20 dark:from-saffron-500/10 dark:to-surface", disabled && "opacity-60 grayscale", className)}>
      <div className="flex w-16 shrink-0 flex-col items-center justify-center bg-gradient-to-b from-maroon-700 to-maroon-900 text-saffron-200">
        <Gift className="h-5 w-5" />
        <span className="mt-1 text-[9px] font-bold uppercase tracking-widest [writing-mode:vertical-rl] rotate-180">{coupon.isFestival ? "Festive" : "Offer"}</span>
      </div>
      <span className="absolute left-[58px] top-[-8px] h-4 w-4 rounded-full bg-bg" />
      <span className="absolute bottom-[-8px] left-[58px] h-4 w-4 rounded-full bg-bg" />
      <div className="min-w-0 flex-1 border-l-2 border-dashed border-saffron-300/70 p-4 dark:border-saffron-500/30">
        <p className="font-display text-lg font-semibold leading-tight text-maroon-800 dark:text-saffron-200">{coupon.title}</p>
        <p className="mt-1 line-clamp-2 text-xs text-ink-soft">{coupon.summary ?? describeCoupon({ ...coupon, maxDiscountPaise: coupon.maxDiscountPaise, type: coupon.type as never })}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="rounded-lg border border-dashed border-maroon-300 bg-white/70 px-2.5 py-1 font-mono text-sm font-bold tracking-wider text-maroon-800 dark:border-maroon-400/40 dark:bg-black/20 dark:text-saffron-100">{coupon.code}</span>
          {disabled ? (
            <span className="text-[11px] font-semibold text-muted">{status === "PER_USER_LIMIT_REACHED" ? "Already used" : status === "FIRST_ORDER_ONLY" ? "First order only" : "Unavailable"}</span>
          ) : onApply ? (
            <button type="button" onClick={() => onApply(coupon.code)} className="text-sm font-extrabold uppercase tracking-wide text-saffron-700 dark:text-saffron-300">Apply</button>
          ) : (
            <button type="button" onClick={async () => { await navigator.clipboard?.writeText(coupon.code).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="inline-flex items-center gap-1 text-xs font-bold text-saffron-700 dark:text-saffron-300">
              {copied ? <><Check className="h-3.5 w-3.5" />Copied</> : <><Copy className="h-3.5 w-3.5" />Copy</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
