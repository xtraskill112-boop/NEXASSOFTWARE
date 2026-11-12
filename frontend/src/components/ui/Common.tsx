import type { ReactNode } from 'react';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Inbox, Search, X } from 'lucide-react';
import type { Pagination as PaginationMeta } from '@/lib/types';
import { formatNumber } from '@/lib/format';
import { Button } from './Button';

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, subtitle, actions, children, className, bodyClassName }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={clsx('card', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx(bodyClassName ?? 'p-5')}>{children}</div>
    </section>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-surface-3 text-ink-3">{icon ?? <Inbox className="size-6" />}</div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-3">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center" role="alert">
      <p className="text-sm font-semibold text-ink">Could not load data</p>
      <p className="mt-1 max-w-md text-sm text-ink-3">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search...', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={clsx('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-lg border border-line-strong bg-surface pr-9 pl-9 text-sm text-ink shadow-[0_1px_2px_rgba(16,24,40,0.04)] placeholder:text-ink-3 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-ink-3 hover:text-ink" aria-label="Clear search">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function Pagination({ meta, onPageChange, itemLabel = 'results' }: { meta: PaginationMeta; onPageChange: (p: number) => void; itemLabel?: string }) {
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.page * meta.pageSize, meta.total);
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-line px-4 py-3 sm:flex-row sm:px-5">
      <p className="text-xs text-ink-3 tabular">
        Showing <span className="font-medium text-ink-2">{formatNumber(from)}</span>–<span className="font-medium text-ink-2">{formatNumber(to)}</span> of{' '}
        <span className="font-medium text-ink-2">{formatNumber(meta.total)}</span> {itemLabel}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={meta.page <= 1} onClick={() => onPageChange(meta.page - 1)} icon={<ChevronLeft className="size-4" />}>
          Previous
        </Button>
        <span className="text-xs text-ink-3 tabular">
          Page {meta.page} / {meta.totalPages}
        </span>
        <Button variant="secondary" size="sm" disabled={meta.page >= meta.totalPages} onClick={() => onPageChange(meta.page + 1)}>
          Next
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/** Table primitives with consistent styling */
export function Table({ children, minWidth = 720 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className, align = 'left' }: { children?: ReactNode; className?: string; align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      scope="col"
      className={clsx(
        'border-b border-line bg-surface-2 px-4 py-2.5 text-[11px] font-semibold tracking-wider whitespace-nowrap text-ink-3 uppercase first:pl-5 last:pr-5',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className, align = 'left' }: { children?: ReactNode; className?: string; align?: 'left' | 'right' | 'center' }) {
  return (
    <td className={clsx('border-b border-line px-4 py-3 align-middle first:pl-5 last:pr-5', align === 'right' && 'text-right tabular', align === 'center' && 'text-center', className)}>
      {children}
    </td>
  );
}

export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-line" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-5 py-3.5">
          {Array.from({ length: cols }).map((__, c) => (
            <div key={c} className="h-3.5 flex-1 animate-pulse rounded bg-surface-3" style={{ maxWidth: c === 0 ? 180 : 120 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; icon?: ReactNode; disabled?: boolean }[] }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-surface-2 p-1" role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          role="tab"
          aria-selected={value === it.value}
          disabled={it.disabled}
          onClick={() => onChange(it.value)}
          className={clsx(
            'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
            value === it.value ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-ink-2 hover:text-ink',
          )}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
    </div>
  );
}
