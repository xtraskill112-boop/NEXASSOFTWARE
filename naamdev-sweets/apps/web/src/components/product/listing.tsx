"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, PackageSearch, SlidersHorizontal, X } from "lucide-react";
import type { ProductList } from "@naamdev/api-client";
import { Button, EmptyState, ErrorState, Sheet, cn } from "@naamdev/ui";
import { api, errorMessage } from "@/lib/api";
import { ProductCardSkeleton } from "./product-card";
import { ProductGrid } from "./product-rail";

const SORTS = [
  ["relevance", "Relevance"],
  ["popular", "Popularity"],
  ["rating", "Customer rating"],
  ["price_asc", "Price: low to high"],
  ["price_desc", "Price: high to low"],
  ["discount", "Biggest discount"],
  ["newest", "Newest first"],
] as const;

const PRICES = [
  ["", "", "Any price"],
  ["", "30000", "Under ₹300"],
  ["30000", "70000", "₹300 – ₹700"],
  ["70000", "150000", "₹700 – ₹1,500"],
  ["150000", "", "Above ₹1,500"],
] as const;

export function ProductListing({ fixed = {}, initial, emptyTitle = "No sweets match your filters", hideCategoryChips }: { fixed?: Record<string, string>; initial?: ProductList | null; emptyTitle?: string; hideCategoryChips?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [data, setData] = useState<ProductList | null>(initial ?? null);
  const [items, setItems] = useState(initial?.items ?? []);
  const [loading, setLoading] = useState(!initial);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const first = useRef(!!initial);

  const params = useMemo(() => {
    const p: Record<string, string> = { pageSize: "24" };
    for (const k of ["q", "category", "sort", "minPrice", "maxPrice", "inStock", "onOffer", "flag", "collection"]) {
      const v = sp.get(k);
      if (v) p[k] = v;
    }
    return { ...p, ...fixed };
  }, [sp, fixed]);
  const key = JSON.stringify(params);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.get<ProductList>("/catalog/products", { query: { ...params, page: 1 } })
      .then((r) => { if (!cancelled) { setData(r); setItems(r.items); } })
      .catch((e) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v ? n.set(k, v) : n.delete(k));
    router.replace(`${pathname}?${n.toString()}`, { scroll: false });
  };

  const loadMore = async () => {
    if (!data) return;
    setMore(true);
    try {
      const r = await api.get<ProductList>("/catalog/products", { query: { ...params, page: data.meta.page + 1 } });
      setData(r);
      setItems((x) => [...x, ...r.items]);
    } finally {
      setMore(false);
    }
  };

  const chip = (active: boolean) => cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-[14px] font-semibold transition-colors", active ? "border-ink bg-ink text-bg" : "border-line bg-surface text-ink-soft hover:border-ink-soft/50");
  const priceKey = `${params.minPrice ?? ""}-${params.maxPrice ?? ""}`;
  const activeCount = ["minPrice", "maxPrice", "inStock", "onOffer"].filter((k) => sp.get(k)).length;

  return (
    <div>
      <div style={{ top: "var(--nd-header-h, 64px)" }} className="nd-scrollbar-none sticky z-30 -mx-4 flex gap-2 overflow-x-auto border-b border-line bg-bg px-4 py-2.5 sm:-mx-6 sm:px-6">
        <button type="button" className={chip(!!sp.get("sort"))} onClick={() => setSortOpen(true)}><ArrowDownUp className="h-3.5 w-3.5" />{SORTS.find((s) => s[0] === (params.sort ?? "relevance"))?.[1] ?? "Sort"}</button>
        <button type="button" className={chip(params.inStock === "true")} onClick={() => set({ inStock: params.inStock === "true" ? null : "true" })}>In stock</button>
        <button type="button" className={chip(params.onOffer === "true")} onClick={() => set({ onOffer: params.onOffer === "true" ? null : "true" })}>On offer</button>
        {PRICES.slice(1).map(([min, max, label]) => {
          const active = priceKey === `${min}-${max}`;
          return <button key={label} type="button" className={chip(active)} onClick={() => set(active ? { minPrice: null, maxPrice: null } : { minPrice: min || null, maxPrice: max || null })}>{label}</button>;
        })}
        {activeCount > 0 && <button type="button" className="inline-flex h-9 shrink-0 items-center gap-1 px-2 text-[13px] font-semibold text-maroon-700" onClick={() => set({ minPrice: null, maxPrice: null, inStock: null, onOffer: null, sort: null })}><X className="h-3.5 w-3.5" />Clear</button>}
      </div>

      {!hideCategoryChips && !fixed.category && data && data.facets.categories.length > 1 && (
        <div className="nd-scrollbar-none -mx-4 mb-2 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
          <button type="button" className={chip(!params.category)} onClick={() => set({ category: null })}>All</button>
          {data.facets.categories.map((c) => (
            <button key={c.slug} type="button" className={chip(params.category === c.slug)} onClick={() => set({ category: params.category === c.slug ? null : c.slug })}>
              {c.name} <span className="text-[11px] text-muted">{c.count}</span>
            </button>
          ))}
        </div>
      )}

      {data && !loading && <p className="mb-4 mt-2 text-sm text-muted"><SlidersHorizontal className="mr-1 inline h-3.5 w-3.5" />{data.meta.total} item{data.meta.total === 1 ? "" : "s"}</p>}

      {error ? (
        <ErrorState description={error} action={<Button onClick={() => set({})}>Retry</Button>} />
      ) : loading ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{Array.from({ length: 10 }, (_, i) => <ProductCardSkeleton key={i} />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={<PackageSearch className="h-8 w-8" />} title={emptyTitle} description={data?.suggestion ? `Did you mean "${data.suggestion}"?` : "Try removing a filter or searching for something else."}
          action={data?.suggestion ? <Button variant="soft" onClick={() => set({ q: data.suggestion })}>Search “{data.suggestion}”</Button> : activeCount ? <Button variant="outline" onClick={() => set({ minPrice: null, maxPrice: null, inStock: null, onOffer: null })}>Clear filters</Button> : undefined} />
      ) : (
        <>
          <ProductGrid products={items} />
          {data && data.meta.page < data.meta.totalPages && (
            <div className="mt-10 flex justify-center"><Button variant="outline" size="lg" loading={more} onClick={loadMore}>Show more sweets</Button></div>
          )}
        </>
      )}

      <Sheet open={sortOpen} onClose={() => setSortOpen(false)} side="bottom" title="Sort by" className="sm:mx-auto sm:max-w-md">
        <div className="p-3">
          {SORTS.map(([value, label]) => (
            <button key={value} type="button" onClick={() => { set({ sort: value === "relevance" ? null : value }); setSortOpen(false); }}
              className={cn("flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-left text-[15px] font-semibold transition hover:bg-surface-2", (params.sort ?? "relevance") === value ? "text-maroon-700 dark:text-maroon-200" : "text-ink")}>
              {label}{(params.sort ?? "relevance") === value && <span className="h-2.5 w-2.5 rounded-full bg-maroon-700" />}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
