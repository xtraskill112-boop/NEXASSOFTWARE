"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Clock, Search, TrendingUp, X } from "lucide-react";
import { formatINR } from "@naamdev/shared";
import { Spinner } from "@naamdev/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { recentSearches } from "@/lib/storage";
import { ProductImage } from "../common/product-image";
import { ProductListing } from "./listing";

interface Suggest { products: { id: string; slug: string; name: string; image: string | null; pricePaise: number; category: string }[]; categories: { slug: string; name: string }[]; suggestion: string | null }

export function SearchExperience() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const q0 = sp.get("q") ?? "";
  const [q, setQ] = useState(q0);
  const [focused, setFocused] = useState(!q0 && !sp.get("flag") && !sp.get("sort"));
  const [sugg, setSugg] = useState<Suggest | null>(null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [trending, setTrending] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecent(recentSearches.get());
    api.get<{ terms: string[] }>("/catalog/search/trending").then((r) => setTrending(r.terms)).catch(() => undefined);
  }, []);
  useEffect(() => setQ(q0), [q0]);

  useEffect(() => {
    if (!focused || q.trim().length < 2) return setSugg(null);
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      setBusy(true);
      api.get<Suggest>("/catalog/search/suggest", { query: { q: q.trim() }, signal: ctrl.signal }).then(setSugg).catch(() => undefined).finally(() => setBusy(false));
    }, 180);
    return () => { clearTimeout(id); ctrl.abort(); };
  }, [q, focused]);

  const submit = (term: string) => {
    const t2 = term.trim();
    if (!t2) return;
    recentSearches.push(t2);
    setRecent(recentSearches.get());
    setFocused(false);
    inputRef.current?.blur();
    const n = new URLSearchParams(sp.toString());
    n.set("q", t2);
    n.delete("category");
    router.push(`${pathname}?${n.toString()}`);
  };

  const showResults = !focused && (q0 || sp.get("flag") || sp.get("sort"));

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); submit(q); }} className="relative" role="search">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => router.back()} className="grid h-12 w-10 shrink-0 place-items-center text-ink-soft md:hidden" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-maroon-700" />
            <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setFocused(true); }} onFocus={() => setFocused(true)} autoFocus={!q0}
              placeholder={t("common.searchPlaceholder")} aria-label={t("common.search")} enterKeyHint="search"
              className="h-14 w-full rounded-2xl border border-line bg-surface pl-12 pr-12 text-base text-ink shadow-card outline-none transition focus:border-ink-soft focus:ring-4 focus:ring-maroon-700/10" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              {busy ? <Spinner className="h-5 w-5 text-maroon-600" /> : q && <button type="button" aria-label="Clear search" onClick={() => { setQ(""); setFocused(true); inputRef.current?.focus(); }} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-2"><X className="h-4 w-4" /></button>}
            </span>
          </div>
        </div>
      </form>

      {focused && (
        <div className="mt-5 space-y-7">
          {sugg && (sugg.products.length > 0 || sugg.categories.length > 0) ? (
            <div className="overflow-hidden rounded-3xl border border-line-soft bg-surface shadow-card">
              {sugg.categories.map((c) => (
                <Link key={c.slug} href={`/category/${c.slug}`} className="flex items-center gap-3 border-b border-line-soft px-4 py-3 hover:bg-surface-2">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-maroon-700"><Search className="h-4 w-4" /></span>
                  <span className="text-sm"><b className="text-ink">{c.name}</b> <span className="text-muted">category</span></span>
                </Link>
              ))}
              {sugg.products.map((p) => (
                <Link key={p.id} href={`/product/${p.slug}`} onClick={() => recentSearches.push(p.name)} className="flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-0 hover:bg-surface-2">
                  <ProductImage src={p.image} alt={p.name} className="h-12 w-12 rounded-xl" sizes={96} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                    <span className="block text-xs text-muted">{p.category}, from {formatINR(p.pricePaise)}</span>
                  </span>
                </Link>
              ))}
              <button type="button" onClick={() => submit(q)} className="flex w-full items-center gap-2 px-4 py-3 text-sm font-bold text-maroon-700 hover:bg-surface-2 dark:text-maroon-200"><Search className="h-4 w-4" />See all results for “{q}”</button>
            </div>
          ) : sugg && sugg.suggestion ? (
            <p className="text-sm text-muted">No exact matches. Did you mean <button type="button" className="font-bold text-maroon-700" onClick={() => submit(sugg.suggestion!)}>{sugg.suggestion}</button>?</p>
          ) : null}

          {recent.length > 0 && q.length < 2 && (
            <div>
              <div className="mb-3 flex items-center justify-between"><h2 className="text-[13px] font-semibold text-muted">Recent searches</h2><button type="button" className="text-xs font-semibold text-maroon-700" onClick={() => { recentSearches.clear(); setRecent([]); }}>Clear</button></div>
              <div className="flex flex-wrap gap-2">{recent.map((r) => <button key={r} type="button" onClick={() => submit(r)} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink-soft hover:border-ink-soft/40"><Clock className="h-3.5 w-3.5 text-muted" />{r}</button>)}</div>
            </div>
          )}
          {trending.length > 0 && q.length < 2 && (
            <div>
              <h2 className="mb-3 text-[13px] font-semibold text-muted">Trending searches</h2>
              <div className="flex flex-wrap gap-2">{trending.map((r) => <button key={r} type="button" onClick={() => submit(r)} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3.5 py-2 text-sm font-semibold capitalize text-maroon-800 hover:bg-surface-2 dark:text-maroon-200"><TrendingUp className="h-3.5 w-3.5" />{r}</button>)}</div>
            </div>
          )}
        </div>
      )}

      {showResults && (
        <div className="mt-6">
          {q0 && <h1 className="mb-1 font-display text-2xl font-semibold text-ink">Results for “{q0}”</h1>}
          <ProductListing emptyTitle={q0 ? `No results for “${q0}”` : undefined} />
        </div>
      )}
    </div>
  );
}
