import type { ReactNode } from 'react';
import clsx from 'clsx';
import { AlertTriangle, ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CheckCircle2, Circle, XCircle } from 'lucide-react';
import type { MovementType, Role, StockStatus } from '@/lib/types';

type Tone = 'neutral' | 'brand' | 'good' | 'warning' | 'critical' | 'info';

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-ink-2 ring-line-strong/60',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/30',
  good: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25',
  critical: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25',
  info: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/25',
};

export function Badge({ tone = 'neutral', icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset', tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

/** Stock status always ships icon + label (never color alone). */
export function StockStatusBadge({ status }: { status: StockStatus }) {
  if (status === 'OUT_OF_STOCK')
    return (
      <Badge tone="critical" icon={<XCircle className="size-3.5" aria-hidden />}>
        Out of stock
      </Badge>
    );
  if (status === 'LOW_STOCK')
    return (
      <Badge tone="warning" icon={<AlertTriangle className="size-3.5" aria-hidden />}>
        Low stock
      </Badge>
    );
  return (
    <Badge tone="good" icon={<CheckCircle2 className="size-3.5" aria-hidden />}>
      In stock
    </Badge>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge tone="good" icon={<Circle className="size-2 fill-current" aria-hidden />}>
      Active
    </Badge>
  ) : (
    <Badge tone="neutral" icon={<Circle className="size-2" aria-hidden />}>
      Inactive
    </Badge>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  const tone: Tone = role === 'ADMIN' ? 'brand' : role === 'MANAGER' ? 'info' : 'neutral';
  return <Badge tone={tone}>{role === 'ADMIN' ? 'Admin' : role === 'MANAGER' ? 'Manager' : 'Staff'}</Badge>;
}

export function MovementBadge({ type }: { type: MovementType }) {
  if (type === 'STOCK_IN')
    return (
      <Badge tone="good" icon={<ArrowDownLeft className="size-3.5" aria-hidden />}>
        Stock In
      </Badge>
    );
  if (type === 'STOCK_OUT')
    return (
      <Badge tone="critical" icon={<ArrowUpRight className="size-3.5" aria-hidden />}>
        Stock Out
      </Badge>
    );
  return (
    <Badge tone="info" icon={<ArrowLeftRight className="size-3.5" aria-hidden />}>
      Transfer
    </Badge>
  );
}
