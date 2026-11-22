"use client";
import Link from "next/link";
import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ProductCard as Product } from "@naamdev/api-client";
import { SectionHeading } from "@naamdev/ui";
import { useI18n } from "@/lib/i18n";
import { ProductCard } from "./product-card";

export function ProductRail({ title, subtitle, products, href, eyebrow }: { title: string; subtitle?: string | null; products: Product[]; href?: string; eyebrow?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  if (!products.length) return null;
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <SectionHeading
        title={title}
        subtitle={subtitle ?? undefined}
        eyebrow={eyebrow}
        action={
          <div className="flex items-center gap-2">
            {href && <Link href={href} className="text-[14px] font-semibold text-maroon-700 underline-offset-4 hover:underline dark:text-maroon-200">{t("common.viewAll")}</Link>}
            <div className="hidden gap-1.5 md:flex">
              <button type="button" aria-label="Scroll left" onClick={() => scroll(-1)} className="grid h-9 w-9 place-items-center rounded-md border border-line bg-surface text-ink-soft transition-colors hover:bg-surface-2"><ChevronLeft className="h-4 w-4" /></button>
              <button type="button" aria-label="Scroll right" onClick={() => scroll(1)} className="grid h-9 w-9 place-items-center rounded-md border border-line bg-surface text-ink-soft transition-colors hover:bg-surface-2"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        }
      />
      <div ref={ref} className="nd-scrollbar-none -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
        {products.map((p, i) => (
          <ProductCard key={p.id} product={p} priority={i < 2} className="w-[44vw] shrink-0 snap-start sm:w-[220px] lg:w-[232px]" />
        ))}
      </div>
    </section>
  );
}

export function ProductGrid({ products, className }: { products: Product[]; className?: string }) {
  return (
    <div className={className ?? "grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4 xl:grid-cols-5"}>
      {products.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 4} />)}
    </div>
  );
}
