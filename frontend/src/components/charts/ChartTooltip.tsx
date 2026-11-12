import type { ReactNode } from 'react';

export function TooltipCard({ title, rows }: { title: ReactNode; rows: { color?: string; label: string; value: string }[] }) {
  return (
    <div className="min-w-44 rounded-lg border border-line bg-surface px-3 py-2.5 text-xs shadow-xl">
      <p className="mb-1.5 font-semibold text-ink">{title}</p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-ink-2">
              {r.color && <span className="inline-block size-2.5 rounded-sm" style={{ background: r.color }} aria-hidden />}
              {r.label}
            </span>
            <span className="font-medium text-ink tabular">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-xs text-ink-2">
          <span className="inline-block h-0.5 w-3.5 rounded-full" style={{ background: i.color, height: 3 }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
