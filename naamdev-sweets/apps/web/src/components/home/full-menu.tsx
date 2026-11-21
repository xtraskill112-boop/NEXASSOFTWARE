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
    <div id="menu">
      <div className="mx-auto flex max-w-7xl items-end justify-between gap-3 px-4 pt-6 sm:px-6">
        <div className="min-w-0">
          <h2 className="font-display text-[26px] font-semibold leading-tight text-ink sm:text-3xl">{L(section, "title")}</h2>
          {section.subtitle && <p className="mt-1 text-sm text-muted">{section.subtitle}</p>}
        </div>
        <span className="shrink-0 rounded-full bg-saffron-50 px-3 py-1 text-xs font-bold text-saffron-700 dark:bg-saffron-500/10 dark:text-saffron-300">
          {t("home.menuItems", { n: total })}
        </span>
      </div>

      <div ref={barRef} style={{ top: headerHeight }} className="sticky z-40 mt-3 border-b border-line-soft bg-bg/95 backdrop-blur no-print">
        <nav ref={chipsRef} aria-label={t("home.menuJump")} className="nd-scrollbar-none mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-2.5 sm:px-6">
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
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-semibold transition",
                  on ? "border-maroon-700 bg-maroon-700 text-white shadow-sm" : "border-line bg-surface text-ink-soft hover:border-saffron-400 hover:text-ink",
                )}
              >
                {L(g.category, "name")}
                <span className={cn("text-[11px] font-bold", on ? "text-saffron-200" : "text-muted")}>{g.products.length}</span>
              </a>
            );
          })}
        </nav>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {groups.map((g, gi) => (
          <section key={g.category.id} id={anchor(g.category.slug)} aria-labelledby={`${anchor(g.category.slug)}-title`} className="pt-6">
            <h3 id={`${anchor(g.category.slug)}-title`} className="mb-4 flex items-baseline gap-2 font-display text-xl font-semibold text-ink sm:text-2xl">
              {L(g.category, "name")}
              <span className="font-sans text-sm font-medium text-muted">({g.products.length})</span>
            </h3>
            <div className="grid grid-cols-2 gap-x-3 gap-y-9 pb-4 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4 xl:grid-cols-5">
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
