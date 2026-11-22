"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgePercent, Bike, ChevronRight, Clock, Leaf, Truck } from "lucide-react";
import type { Banner, PublicCoupon } from "@naamdev/api-client";
import { formatINR } from "@naamdev/shared";
import { cn } from "@naamdev/ui";
import { useLocation } from "@/lib/location";
import { useSettings } from "@/lib/settings";
import { ProductImage } from "../common/product-image";
import { themeBg } from "./themes";

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const label = (hhmm: string) => {
  const t = toMin(hhmm);
  const h = Math.floor(t / 60), m = t % 60;
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
};
/** Minutes since midnight in India (the shop's time zone), whatever the visitor's clock says. */
const nowInIndia = () => {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  return Number(p.find((x) => x.type === "hour")?.value ?? 0) * 60 + Number(p.find((x) => x.type === "minute")?.value ?? 0);
};

/** The shop's header card: open hours, delivery time for the chosen PIN code and the delivery fee rule. */
export function ShopInfo({ freeDeliveryPaise }: { freeDeliveryPaise: number }) {
  const s = useSettings();
  const { location } = useLocation();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(nowInIndia());
    const id = setInterval(() => setNow(nowInIndia()), 60_000);
    return () => clearInterval(id);
  }, []);
  const store = s?.store;
  const open = store && now != null ? now >= toMin(store.openingTime) && now < toMin(store.closingTime) : null;
  const fee = s?.checkout.baseDeliveryFeePaise;
  return (
    <section className="mx-auto max-w-3xl px-4 pt-4">
      <div className="rounded-3xl border border-line bg-surface p-4 shadow-[0_6px_20px_-10px_rgb(16_16_24/0.18)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-extrabold leading-tight text-ink">NAAMDEV SWEETS</h1>
            <p className="mt-0.5 text-[14px] text-muted">Sweets · Namkeen · Snacks{store?.city ? ` · ${store.city}` : ""}</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[12px] font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"><Leaf className="h-3.5 w-3.5" />Pure veg</span>
        </div>
        <ul className="mt-3 space-y-2 border-t border-dashed border-line pt-3 text-[15px] text-ink-soft">
          {store && open != null && (
            <li className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-muted" />
              {open ? (
                <span><b className="font-semibold text-emerald-700 dark:text-emerald-400">Open now</b> · closes {label(store.closingTime)}</span>
              ) : (
                <span><b className="font-semibold text-maroon-700 dark:text-maroon-200">Closed</b> · opens {label(store.openingTime)}</span>
              )}
            </li>
          )}
          <li className="flex items-center gap-2">
            <Bike className="h-4 w-4 shrink-0 text-muted" />
            {location?.serviceable && location.etaMinutes ? (
              <span>Delivery in about <b className="font-semibold text-ink">{location.etaMinutes} min</b> to {location.area ?? location.pincode}</span>
            ) : location && !location.serviceable ? (
              <span>We don&apos;t deliver to {location.pincode} yet</span>
            ) : (
              <span>Set your location to see the delivery time</span>
            )}
          </li>
          {freeDeliveryPaise > 0 && (
            <li className="flex items-center gap-2">
              <Truck className="h-4 w-4 shrink-0 text-muted" />
              <span>Free delivery above <b className="font-semibold text-ink">{formatINR(freeDeliveryPaise)}</b>{fee ? ` · ${formatINR(fee)} below that` : ""}</span>
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}

/** Offers as small cards in one row (coupons first, then short offer banners that aren't coupons). */
export function DealsRow({ coupons, strip }: { coupons: PublicCoupon[]; strip: Banner[] }) {
  const codes = new Set(coupons.map((c) => c.code));
  const notes = strip.filter((b) => !b.ctaLabel || !codes.has(b.ctaLabel));
  if (!coupons.length && !notes.length) return null;
  return (
    <section className="mx-auto max-w-3xl pt-5">
      <div className="flex items-center justify-between px-4">
        <h2 className="text-[18px] font-extrabold text-ink">Offers for you</h2>
        <Link href="/offers" className="flex items-center text-[14px] font-semibold text-maroon-700 dark:text-maroon-200">All <ChevronRight className="h-4 w-4" /></Link>
      </div>
      <div className="nd-scrollbar-none mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
        {coupons.map((c) => (
          <Link key={c.code} href="/offers" className="flex w-[268px] shrink-0 snap-start items-center gap-3 rounded-2xl border border-line bg-surface p-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-soft"><BadgePercent className="h-5 w-5" /></span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-bold text-ink">{c.title}</span>
              <span className="block truncate text-[12px] font-semibold uppercase tracking-wide text-muted">Use {c.code}</span>
            </span>
          </Link>
        ))}
        {notes.map((b) => (
          <Link key={b.id} href={b.ctaLink ?? "/offers"} className="flex w-[268px] shrink-0 snap-start items-center gap-3 rounded-2xl border border-line bg-surface p-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-soft"><Truck className="h-5 w-5" /></span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-bold text-ink">{b.title}</span>
              {b.subtitle && <span className="block truncate text-[12px] text-muted">{b.subtitle}</span>}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** The shop's banners (from the console) as a row of cards. */
export function BannerRow({ banners }: { banners: Banner[] }) {
  if (!banners.length) return null;
  return (
    <section className="mx-auto max-w-3xl pt-5">
      <div className="nd-scrollbar-none flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
        {banners.map((b) => (
          <Link key={b.id} href={b.ctaLink ?? "/"} className={cn("relative flex h-[150px] w-[86%] shrink-0 snap-start overflow-hidden rounded-3xl sm:w-[60%]", themeBg(b.theme))}>
            <div className="relative z-10 flex w-[58%] flex-col justify-center gap-1 p-4">
              {b.eyebrow && <span className="line-clamp-1 text-[12px] font-semibold opacity-80">{b.eyebrow}</span>}
              <span className="line-clamp-3 text-[18px] font-extrabold leading-tight">{b.title}</span>
              {b.ctaLabel && <span className="mt-1 inline-flex items-center text-[13px] font-bold">{b.ctaLabel} <ChevronRight className="h-4 w-4" /></span>}
            </div>
            {b.imageUrl && <ProductImage src={b.imageUrl} alt="" className="absolute inset-y-0 right-0 h-full w-[42%] object-cover" sizes={400} />}
          </Link>
        ))}
      </div>
    </section>
  );
}
