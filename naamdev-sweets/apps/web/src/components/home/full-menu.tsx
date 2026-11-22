"use client";
import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown, X } from "lucide-react";
import type { HomeSection } from "@naamdev/api-client";
import { cn } from "@naamdev/ui";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { ProductImage } from "../common/product-image";
import { MenuItem } from "../product/menu-item";

const anchor = (slug: string) => `menu-${slug}`;
const headerHeight = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue("--nd-header-h")) || 64;

/**
 * The whole menu on the home page, laid out like a food-delivery menu: category shortcuts, a sticky
 * category bar, collapsible sections of menu lines, and a floating "Menu" button that jumps anywhere.
 */
export function FullMenu({ section }: { section: HomeSection }) {
  const { L, t } = useI18n();
  const { count } = useCart();
  const groups = section.groups ?? [];
  const total = groups.reduce((n, g) => n + g.products.length, 0);
  const [active, setActive] = useState(groups[0]?.category.slug ?? "");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLElement>(null);

  const offset = () => headerHeight() + (barRef.current?.offsetHeight ?? 0);

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
  }, [groups]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the highlighted chip visible inside the horizontally scrolling bar.
  useEffect(() => {
    const bar = chipsRef.current;
    const chip = bar?.querySelector<HTMLElement>(`[data-slug="${active}"]`);
    if (bar && chip) bar.scrollTo({ left: chip.offsetLeft - (bar.clientWidth - chip.offsetWidth) / 2, behavior: "smooth" });
  }, [active]);

  const jump = (slug: string) => {
    setClosed((c) => {
      if (!c.has(slug)) return c;
      const n = new Set(c);
      n.delete(slug);
      return n;
    });
    setMenuOpen(false);
    requestAnimationFrame(() => {
      const el = document.getElementById(anchor(slug));
      if (!el) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset() + 1, behavior: reduce ? "auto" : "smooth" });
      setActive(slug);
    });
  };
  const toggle = (slug: string) =>
    setClosed((c) => {
      const n = new Set(c);
      if (n.has(slug)) n.delete(slug);
      else n.add(slug);
      return n;
    });

  if (!groups.length) return null;
  return (
    <div id="menu" style={{ scrollMarginTop: "var(--nd-header-h, 64px)" }}>
      {/* Category shortcuts */}
      <section className="mx-auto max-w-3xl px-4 pt-6">
        <h2 className="text-[20px] font-bold text-ink">{t("home.shopByCategory")}</h2>
        <div className="nd-scrollbar-none -mx-4 mt-3 flex gap-4 overflow-x-auto px-4 pb-1">
          {groups.map((g) => (
            <button key={g.category.id} type="button" onClick={() => jump(g.category.slug)} className="flex w-[76px] shrink-0 flex-col items-center gap-1.5 text-center">
              <span className="block h-[72px] w-[72px] overflow-hidden rounded-full bg-surface-2">
                <ProductImage src={g.products[0]?.image ?? null} alt="" className="h-full w-full" sizes={160} />
              </span>
              <span className="line-clamp-2 text-[13px] font-medium leading-tight text-ink-soft">{L(g.category, "name")}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="mx-auto mt-8 flex max-w-3xl items-baseline justify-between gap-3 px-4">
        <h2 className="text-[24px] font-bold text-ink">{L(section, "title")}</h2>
        <span className="text-[13px] text-muted">{t("home.menuItems", { n: total })}, rates per kg or per piece</span>
      </div>

      {/* Sticky category bar */}
      <div ref={barRef} style={{ top: "var(--nd-header-h, 64px)" }} className="sticky z-40 mt-2 bg-bg no-print">
        <nav ref={chipsRef} aria-label={t("home.menuJump")} className="nd-scrollbar-none mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 py-2.5">
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
                  "nd-press inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-full border px-4 text-[14px] font-semibold",
                  on ? "border-ink bg-ink text-bg" : "border-line bg-surface text-ink-soft hover:border-ink-soft/40",
                )}
              >
                {L(g.category, "name")}
                <span className={cn("text-[12px] font-medium", on ? "opacity-70" : "text-muted")}>{g.products.length}</span>
              </a>
            );
          })}
        </nav>
        <div className="h-px bg-line-soft" />
      </div>

      {/* Sections */}
      <div className="mx-auto max-w-3xl">
        {groups.map((g, gi) => {
          const open = !closed.has(g.category.slug);
          const id = anchor(g.category.slug);
          return (
            <section key={g.category.id} id={id} aria-labelledby={`${id}-title`} className="border-b-[10px] border-surface-2 px-4 last:border-b-0">
              <h3 id={`${id}-title`}>
                <button type="button" aria-expanded={open} onClick={() => toggle(g.category.slug)} className="flex w-full items-center justify-between py-4 text-left">
                  <span className="text-[20px] font-bold text-ink">
                    {L(g.category, "name")} <span className="font-semibold text-muted">({g.products.length})</span>
                  </span>
                  <ChevronDown className={cn("h-5 w-5 text-ink-soft transition-transform", !open && "-rotate-90")} />
                </button>
              </h3>
              {open && (
                <div className="-mt-3">
                  {g.products.map((p, i) => (
                    <MenuItem key={p.id} product={p} priority={gi === 0 && i < 2} className={cn(i < g.products.length - 1 && "border-b border-dashed border-line")} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Floating menu button + category list */}
      <div className={cn("fixed right-4 z-40 no-print md:right-8", count > 0 ? "bottom-[calc(132px+env(safe-area-inset-bottom))] md:bottom-8" : "bottom-[calc(80px+env(safe-area-inset-bottom))] md:bottom-8")}>
        {menuOpen && (
          <>
            <button type="button" aria-label="Close menu" className="fixed inset-0 cursor-default bg-black/30" onClick={() => setMenuOpen(false)} />
            <div role="dialog" aria-label="Menu categories" className="absolute bottom-14 right-0 max-h-[60dvh] w-64 overflow-y-auto rounded-2xl bg-ink p-2 text-bg shadow-lift">
              {groups.map((g) => (
                <button key={g.category.id} type="button" onClick={() => jump(g.category.slug)} className={cn("nd-press flex min-h-[44px] w-full items-center justify-between rounded-lg px-3 text-left text-[15px] hover:bg-white/10", g.category.slug === active ? "font-bold" : "font-medium opacity-85")}>
                  {L(g.category, "name")}
                  <span className="text-[13px] opacity-70">{g.products.length}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} className="nd-press relative flex h-12 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-semibold text-bg shadow-lift">
          {menuOpen ? <X className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}Menu
        </button>
      </div>
    </div>
  );
}
