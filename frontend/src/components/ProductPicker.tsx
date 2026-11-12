import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Package, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { qk } from '@/lib/queries';
import type { Paginated, Product } from '@/lib/types';
import { formatNumber } from '@/lib/format';
import { useDebounce } from '@/hooks/useDebounce';
import { StockStatusBadge } from './ui/Badge';
import { Spinner } from './ui/Spinner';

interface Props {
  value: { id: string; sku: string; name: string } | null;
  onChange: (p: Product | null) => void;
  invalid?: boolean;
  id?: string;
}

/** Searchable product combobox (active products only). */
export function ProductPicker({ value, onChange, invalid, id }: Props) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [highlight, setHighlight] = useState(0);
  const debounced = useDebounce(term, 200);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isFetching } = useQuery({
    queryKey: [...qk.products, 'picker', debounced],
    queryFn: () => api.get<Paginated<Product>>('/products', { search: debounced, status: 'active', pageSize: 8, sortBy: 'name' }),
    enabled: open,
  });
  const items = data?.data ?? [];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => setHighlight(0), [debounced]);

  const choose = (p: Product) => {
    onChange(p);
    setOpen(false);
    setTerm('');
  };

  if (value && !open) {
    return (
      <div className={clsx('flex h-12 items-center gap-3 rounded-lg border bg-surface px-3', invalid ? 'border-[var(--status-critical)]' : 'border-line-strong')}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <Package className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{value.name}</p>
          <p className="font-mono text-xs text-ink-3">{value.sku}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
        >
          Change
        </button>
        <button type="button" onClick={() => onChange(null)} className="rounded p-1 text-ink-3 hover:text-ink" aria-label="Clear product">
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls="product-picker-list"
        autoComplete="off"
        value={term}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, items.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter' && items[highlight]) {
            e.preventDefault();
            choose(items[highlight]!);
          } else if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Search product by name or SKU…"
        className={clsx(
          'h-12 w-full rounded-lg border bg-surface pr-9 pl-9 text-sm text-ink placeholder:text-ink-3 focus:ring-4 focus:outline-none',
          invalid ? 'border-[var(--status-critical)] focus:ring-red-500/15' : 'border-line-strong focus:border-brand-500 focus:ring-brand-500/15',
        )}
      />
      {isFetching && <Spinner className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-3" />}
      {open && (
        <ul id="product-picker-list" role="listbox" className="card scrollbar-thin absolute z-20 mt-1.5 max-h-80 w-full overflow-y-auto py-1 shadow-xl">
          {items.length === 0 && !isFetching && <li className="px-4 py-6 text-center text-sm text-ink-3">No active products found.</li>}
          {items.map((p, idx) => (
            <li
              key={p.id}
              role="option"
              aria-selected={idx === highlight}
              onMouseEnter={() => setHighlight(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(p);
              }}
              className={clsx('flex cursor-pointer items-center gap-3 px-3.5 py-2.5', idx === highlight && 'bg-surface-3')}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{p.name}</p>
                <p className="text-xs text-ink-3">
                  <span className="font-mono">{p.sku}</span> · {p.category}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-ink tabular">{formatNumber(p.totalStock)}</p>
                <StockStatusBadge status={p.stockStatus} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
