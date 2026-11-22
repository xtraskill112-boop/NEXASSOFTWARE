"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Droplets, Flame, PackageCheck, ShieldCheck } from "lucide-react";
import type { Banner, HomeSection, ProductCard as Product, PublicCoupon } from "@naamdev/api-client";
import { SectionHeading, cn } from "@naamdev/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { recentlyViewed } from "@/lib/storage";
import { ProductImage } from "../common/product-image";
import { ProductRail } from "../product/product-rail";
import { CouponTicket } from "./coupon-ticket";
import { themeBg } from "./themes";

export function TrustStrip() {
  const { t } = useI18n();
  const items = [
    { icon: Flame, label: t("home.trustFresh") },
    { icon: Droplets, label: t("home.trustGhee") },
    { icon: ShieldCheck, label: t("home.trustHygiene") },
    { icon: PackageCheck, label: t("home.trustDelivery") },
  ];
  return (
    <section className="mx-auto max-w-7xl px-4 pt-3 sm:px-6">
      <ul className="nd-scrollbar-none flex gap-x-5 overflow-x-auto border-b border-line pb-3 text-[13px] text-ink-soft sm:justify-between">
        {items.map(({ icon: Icon, label }) => (
          <li key={label} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
            <Icon className="h-4 w-4 text-muted" />
            {label}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OfferStrip({ banners }: { banners: Banner[] }) {
  if (!banners.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
      <div className="nd-scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0">
        {banners.map((b) => (
          <Link key={b.id} href={b.ctaLink ?? "/offers"} className="flex w-[80vw] shrink-0 snap-start items-center justify-between gap-3 rounded-lg border border-line border-l-4 border-l-maroon-700 bg-surface px-4 py-3 transition-colors hover:bg-surface-2 sm:w-auto">
            <div className="min-w-0">
              <p className="text-[15px] font-bold leading-tight text-ink">{b.title}</p>
              {b.subtitle && <p className="mt-0.5 text-[13px] text-muted">{b.subtitle}</p>}
            </div>
            {b.ctaLabel && <span className="shrink-0 rounded border border-dashed border-ink-soft/40 px-2 py-1 font-mono text-[12px] font-semibold text-ink-soft">{b.ctaLabel}</span>}
          </Link>
        ))}
      </div>
    </section>
  );
}

export function CouponsRail({ title, coupons }: { title: string; coupons: PublicCoupon[] }) {
  if (!coupons.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
      <SectionHeading title={title} action={<Link href="/offers" className="text-[14px] font-semibold text-maroon-700 underline-offset-4 hover:underline dark:text-maroon-200">All offers</Link>} />
      <div className="nd-scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
        {coupons.map((c) => <CouponTicket key={c.code} coupon={c} className="w-[300px] shrink-0 snap-start" />)}
      </div>
    </section>
  );
}

export function PromoGrid({ banners }: { banners: Banner[] }) {
  if (!banners.length) return null;
  return (
    <section className="mx-auto grid max-w-7xl gap-4 px-4 py-6 sm:grid-cols-2 sm:px-6">
      {banners.map((b) => (
        <Link key={b.id} href={b.ctaLink ?? "/"} className={cn("group relative flex h-44 overflow-hidden rounded-xl sm:h-52", themeBg(b.theme))}>
          <div className="relative z-10 flex w-3/5 flex-col justify-between p-5 sm:p-6">
            <div>
              <p className="font-display text-xl font-extrabold leading-tight sm:text-2xl">{b.title}</p>
              {b.subtitle && <p className="mt-1.5 text-[14px] opacity-85">{b.subtitle}</p>}
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 text-[14px] font-bold underline decoration-current/30 underline-offset-4 group-hover:decoration-current">{b.ctaLabel ?? "Explore"} <ArrowRight className="h-4 w-4" /></span>
          </div>
          {b.imageUrl && <ProductImage src={b.imageUrl} alt="" className="absolute inset-y-0 right-0 h-full w-2/5 object-cover" sizes={400} />}
        </Link>
      ))}
    </section>
  );
}

export function CollectionShowcase({ section }: { section: HomeSection }) {
  const { L } = useI18n();
  const c = section.collection!;
  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className={cn("relative overflow-hidden rounded-xl p-5 sm:p-8", themeBg(c.theme))}>
        {c.bannerImageUrl && <ProductImage src={c.bannerImageUrl} alt="" className="absolute inset-y-0 right-0 hidden h-full w-2/5 object-cover sm:block" sizes={900} />}
        <div className="relative max-w-lg">
          <p className="text-[13px] font-semibold opacity-80">Festival collection</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold leading-tight sm:text-3xl">{L(section, "title")}</h2>
          {(section.subtitle || c.description) && <p className="mt-2 text-[14px] opacity-90">{section.subtitle ?? c.description}</p>}
          <Link href={`/collections/${c.slug}`} className="mt-4 inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-[14px] font-semibold text-cream-50 dark:bg-cream-50 dark:text-ink">Explore collection <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </div>
      <div className="-mt-2">
        <ProductRail title="" products={section.products ?? []} />
      </div>
    </section>
  );
}

/** Recently viewed — from the account (signed in) or this device's history (guests). */
export function RecentlyViewed({ title, initial }: { title: string; initial?: Product[] }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Product[]>(initial ?? []);
  useEffect(() => {
    if (user) {
      api.get<{ items: Product[] }>("/account/recently-viewed").then((r) => setItems(r.items)).catch(() => undefined);
      return;
    }
    const ids = recentlyViewed.get();
    if (!ids.length) return setItems([]);
    api.get<{ items: Product[] }>("/catalog/products/by-ids", { query: { ids: ids.join(",") } }).then((r) => setItems(r.items)).catch(() => undefined);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return <ProductRail title={title} products={items} />;
}

/** Personalised rails (order again / recommended) fetched client-side for signed-in users. */
export function PersonalRail({ type, title }: { type: string; title: string }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Product[]>([]);
  useEffect(() => {
    if (!user) return setItems([]);
    api.get<{ sections: HomeSection[] }>("/catalog/home").then((r) => setItems(r.sections.find((s) => s.type === type)?.products ?? [])).catch(() => undefined);
  }, [user?.id, type]); // eslint-disable-line react-hooks/exhaustive-deps
  return <ProductRail title={title} products={items} />;
}
