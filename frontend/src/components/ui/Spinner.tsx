import clsx from 'clsx';

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={clsx('animate-spin', className ?? 'size-5')} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function PageLoader({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-ink-3" role="status">
      <Spinner className="size-7 text-brand-500" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-md bg-surface-3', className)} />;
}
