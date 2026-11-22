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
    <div className={cn("relative flex overflow-hidden rounded-xl border border-line bg-surface", disabled && "opacity-60 grayscale", className)}>
      <div className="flex w-14 shrink-0 flex-col items-center justify-center bg-maroon-800 text-cream-100">
        <Gift className="h-5 w-5" />
        <span className="mt-1.5 rotate-180 text-[11px] font-semibold [writing-mode:vertical-rl]">{coupon.isFestival ? "Festive" : "Offer"}</span>
      </div>
      <span className="absolute left-[50px] top-[-8px] h-4 w-4 rounded-full border border-line bg-bg" />
      <span className="absolute bottom-[-8px] left-[50px] h-4 w-4 rounded-full border border-line bg-bg" />
      <div className="min-w-0 flex-1 border-l border-dashed border-line p-4">
        <p className="text-[16px] font-bold leading-tight text-ink">{coupon.title}</p>
        <p className="mt-1 line-clamp-2 text-[13px] text-muted">{coupon.summary ?? describeCoupon({ ...coupon, maxDiscountPaise: coupon.maxDiscountPaise, type: coupon.type as never })}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="rounded border border-dashed border-ink-soft/40 px-2 py-0.5 font-mono text-[13px] font-semibold tracking-wide text-ink">{coupon.code}</span>
          {disabled ? (
            <span className="text-[11px] font-semibold text-muted">{status === "PER_USER_LIMIT_REACHED" ? "Already used" : status === "FIRST_ORDER_ONLY" ? "First order only" : "Unavailable"}</span>
          ) : onApply ? (
            <button type="button" onClick={() => onApply(coupon.code)} className="text-[14px] font-bold text-maroon-700 dark:text-maroon-200">Apply</button>
          ) : (
            <button type="button" onClick={async () => { await navigator.clipboard?.writeText(coupon.code).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-soft hover:text-ink">
              {copied ? <><Check className="h-3.5 w-3.5" />Copied</> : <><Copy className="h-3.5 w-3.5" />Copy</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
