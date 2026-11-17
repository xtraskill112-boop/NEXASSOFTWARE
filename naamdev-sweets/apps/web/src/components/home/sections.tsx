"use client";
import Link from "next/link";
import { motion } from "framer-motion";
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
    <section className="mx-auto max-w-7xl px-4 pt-5 sm:px-6">
      <div className="nd-scrollbar-none flex gap-3 overflow-x-auto">
        {items.map(({ icon: Icon, label }) => (
          <div key={label} className="flex shrink-0 items-center gap-2.5 rounded-2xl border border-line-soft bg-surface px-4 py-3 shadow-sm">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-saffron-50 text-saffron-600 dark:bg-saffron-500/10 dark:text-saffron-300"><Icon className="h-[18px] w-[18px]" /></span>
            <span className="whitespace-nowrap text-[13px] font-semibold text-ink-soft">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function OfferStrip({ banners }: { banners: Banner[] }) {
  if (!banners.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
      <div className="nd-scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0">
        {banners.map((b) => (
          <Link key={b.id} href={b.ctaLink ?? "/offers"} className={cn("relative flex w-[78vw] shrink-0 snap-start flex-col justify-between gap-3 overflow-hidden rounded-3xl px-5 py-4 shadow-card sm:w-auto sm:flex-row sm:items-center", themeBg(b.theme))}>
            <div className="nd-pattern pointer-events-none absolute inset-0 opacity-20" />
            <div className="relative min-w-0">
              <p className="font-display text-[17px] font-semibold leading-tight sm:text-lg">{b.title}</p>
              {b.subtitle && <p className="mt-0.5 text-xs opacity-85">{b.subtitle}</p>}
            </div>
            {b.ctaLabel && <span className="relative w-fit shrink-0 rounded-xl bg-white/90 px-3 py-1.5 font-mono text-xs font-bold text-maroon-800">{b.ctaLabel}</span>}
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
      <SectionHeading title={title} action={<Link href="/offers" className="text-sm font-bold text-saffron-700 hover:underline dark:text-saffron-300">All offers</Link>} />
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
      {banners.map((b, i) => (
        <motion.div key={b.id} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}>
          <Link href={b.ctaLink ?? "/"} className={cn("group relative flex h-52 overflow-hidden rounded-[2rem] p-6 shadow-card sm:h-60", themeBg(b.theme))}>
            <div className="nd-pattern pointer-events-none absolute inset-0 opacity-20" />
            <div className="relative z-10 flex w-3/5 flex-col justify-between">
              <div>
                <p className="font-display text-2xl font-semibold leading-tight sm:text-3xl">{b.title}</p>
                {b.subtitle && <p className="mt-2 text-sm opacity-85">{b.subtitle}</p>}
              </div>
              <span className="inline-flex w-fit items-center gap-1.5 rounded-xl bg-white/90 px-4 py-2 text-sm font-bold text-maroon-800 transition group-hover:gap-2.5">{b.ctaLabel ?? "Explore"} <ArrowRight className="h-4 w-4" /></span>
            </div>
            {b.imageUrl && <ProductImage src={b.imageUrl} alt="" className="absolute -bottom-8 -right-8 h-56 w-56 rounded-full shadow-2xl ring-8 ring-white/10 transition duration-700 group-hover:rotate-6 group-hover:scale-105 sm:h-64 sm:w-64" sizes={400} />}
          </Link>
        </motion.div>
      ))}
    </section>
  );
}

export function CollectionShowcase({ section }: { section: HomeSection }) {
  const { L } = useI18n();
  const c = section.collection!;
  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className={cn("relative overflow-hidden rounded-[2rem] p-5 sm:p-8", themeBg(c.theme))}>
        {c.bannerImageUrl && <ProductImage src={c.bannerImageUrl} alt="" className="absolute inset-0 h-full w-full opacity-35 mix-blend-luminosity sm:opacity-60 sm:mix-blend-normal" sizes={1600} />}
        <div className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/15 to-transparent" />
        <div className="relative max-w-lg">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-saffron-200">Festival collection</p>
          <h2 className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl">{L(section, "title")}</h2>
          {(section.subtitle || c.description) && <p className="mt-2 text-sm opacity-90">{section.subtitle ?? c.description}</p>}
          <Link href={`/collections/${c.slug}`} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-maroon-800 shadow">Explore collection <ArrowRight className="h-4 w-4" /></Link>
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
