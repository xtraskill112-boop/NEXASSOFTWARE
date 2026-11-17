"use client";
import { motion } from "framer-motion";
import { useId, type ReactNode } from "react";
import { cn } from "../cn";

export function Segmented<T extends string>({ value, onChange, options, className, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[]; className?: string; size?: "sm" | "md" }) {
  const id = useId();
  return (
    <div role="tablist" className={cn("nd-scrollbar-none inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-surface-2 p-1", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn("relative shrink-0 whitespace-nowrap rounded-xl font-semibold transition-colors", size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm", active ? "text-ink" : "text-muted hover:text-ink-soft")}
          >
            {active && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-xl bg-surface shadow-card" transition={{ type: "spring", damping: 30, stiffness: 400 }} />}
            <span className="relative inline-flex items-center gap-1.5">
              {o.label}
              {o.count != null && <span className={cn("rounded-full px-1.5 text-[10px]", active ? "bg-saffron-100 text-saffron-800 dark:bg-saffron-500/20 dark:text-saffron-200" : "bg-line text-muted")}>{o.count}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Pagination({ page, totalPages, onChange, className }: { page: number; totalPages: number; onChange: (p: number) => void; className?: string }) {
  if (totalPages <= 1) return null;
  const pages: (number | "…")[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages[pages.length - 1] !== "…") pages.push("…");
  }
  const btn = "grid h-9 min-w-9 place-items-center rounded-xl px-2 text-sm font-semibold transition";
  return (
    <nav aria-label="Pagination" className={cn("flex items-center justify-center gap-1", className)}>
      <button type="button" className={cn(btn, "text-ink-soft hover:bg-surface-2 disabled:opacity-40")} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">‹</button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="px-1 text-muted">…</span>
        ) : (
          <button key={p} type="button" aria-current={p === page ? "page" : undefined} onClick={() => onChange(p)} className={cn(btn, p === page ? "nd-gradient-saffron text-white shadow-glow" : "text-ink-soft hover:bg-surface-2")}>
            {p}
          </button>
        ),
      )}
      <button type="button" className={cn(btn, "text-ink-soft hover:bg-surface-2 disabled:opacity-40")} disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="Next page">›</button>
    </nav>
  );
}
