"use client";
import { useEffect, useRef, useState } from "react";
import type { HomeSection } from "@naamdev/api-client";
import { cn } from "@naamdev/ui";
import { useI18n } from "@/lib/i18n";
import { ProductCard } from "../product/product-card";

const anchor = (slug: string) => `menu-${slug}`;

/**
 * The whole menu on the home page: every product, grouped by category, with a category bar that
 * stays under the header so customers can jump straight to laddu, barfi, namkeen…
 */
export function FullMenu({ section }: { section: HomeSection }) {
  const { L, t } = useI18n();
  const groups = section.groups ?? [];
  const total = groups.reduce((n, g) => n + g.products.length, 0);
  const [active, setActive] = useState(groups[0]?.category.slug ?? "");
  const [headerHeight, setHeaderHeight] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

  // The bar sits right under the sticky header, whose height differs between phone and desktop.
  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;
    const update = () => setHeaderHeight(Math.round(header.getBoundingClientRect().height));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  const offset = () => headerHeight + (barRef.current?.offsetHeight ?? 0);

  // Highlight the category being read.
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const line = offset() + 12;
        let current = groups[0]?.category.slug ?? "";
        for (const g of groups) {
          const el = document.getElementById(anchor(g.category.slug));
          if (el && el.getBoundingClientRect().top <= line) current = g.category.slug;
        }
        setActive(current);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [groups, headerHeight]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the highlighted chip visible inside the (horizontally scrolling) bar.
  useEffect(() => {
    const bar = chipsRef.current;
    const chip = bar?.querySelector<HTMLElement>(`[data-slug="${active}"]`);
    if (bar && chip) bar.scrollTo({ left: chip.offsetLeft - (bar.clientWidth - chip.offsetWidth) / 2, behavior: "smooth" });
  }, [active]);

  const jump = (slug: string) => {
    const el = document.getElementById(anchor(slug));
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset() + 1, behavior: reduce ? "auto" : "smooth" });
    setActive(slug);
  };

  if (!groups.length) return null;
  return (
    <div id="menu" style={{ scrollMarginTop: headerHeight }}>
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-8">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-[26px] font-extrabold leading-tight text-ink sm:text-[32px]">{L(section, "title")}</h2>
          <span className="shrink-0 text-[14px] text-muted">{t("home.menuItems", { n: total })}</span>
        </div>
        {section.subtitle && <p className="mt-0.5 text-[15px] text-ink-soft">{section.subtitle}</p>}
      </div>

      <div ref={barRef} style={{ top: headerHeight }} className="sticky z-40 mt-3 border-b border-line bg-bg no-print">
        <nav ref={chipsRef} aria-label={t("home.menuJump")} className="nd-scrollbar-none mx-auto flex max-w-7xl gap-1.5 overflow-x-auto px-4 py-2.5 sm:px-6">
          {groups.map((g) => {
            const on = g.category.slug === active;
            return (
              <a
                key={g.category.id}
                href={`#${anchor(g.category.slug)}`}
                data-slug={g.category.slug}
                aria-current={on ? "true" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  jump(g.category.slug);
                }}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-[14px] font-semibold transition-colors",
                  on ? "border-ink bg-ink text-bg" : "border-line bg-surface text-ink-soft hover:border-ink-soft/50 hover:text-ink",
                )}
              >
                {L(g.category, "name")}
                <span className={cn("text-[12px] font-medium", on ? "opacity-70" : "text-muted")}>{g.products.length}</span>
              </a>
            );
          })}
        </nav>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {groups.map((g, gi) => (
          <section key={g.category.id} id={anchor(g.category.slug)} aria-labelledby={`${anchor(g.category.slug)}-title`} className="border-b border-line pb-6 pt-6 last:border-b-0">
            <h3 id={`${anchor(g.category.slug)}-title`} className="mb-4 flex items-baseline gap-2 font-display text-[20px] font-extrabold text-ink sm:text-[24px]">
              {L(g.category, "name")}
              <span className="font-sans text-[14px] font-normal text-muted">({g.products.length})</span>
            </h3>
            <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4 xl:grid-cols-5">
              {g.products.map((p, i) => (
                <ProductCard key={p.id} product={p} priority={gi === 0 && i < 2} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
