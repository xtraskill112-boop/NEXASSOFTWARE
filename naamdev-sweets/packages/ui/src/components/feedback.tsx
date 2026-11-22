import type { ReactNode } from "react";
import { cn } from "../cn";

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("h-5 w-5 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className, rounded = "rounded-xl" }: { className?: string; rounded?: string }) {
  return <div aria-hidden="true" className={cn("nd-shimmer", rounded, className)} />;
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {icon && (
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-surface-2 text-ink-soft">
          {icon}
        </div>
      )}
      <h3 className="font-display text-xl font-bold text-ink">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, action, className }: { title?: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center rounded-xl border border-line bg-surface px-6 py-10 text-center", className)}>
      <svg viewBox="0 0 24 24" className="mb-3 h-8 w-8 text-maroon-600 dark:text-maroon-300" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></svg>
      <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function InlineAlert({ tone = "info", children, className }: { tone?: "info" | "warning" | "danger" | "success"; children: ReactNode; className?: string }) {
  const tones = {
    info: "bg-saffron-50 text-saffron-900 border-saffron-200 dark:bg-saffron-500/10 dark:text-saffron-100 dark:border-saffron-500/20",
    warning: "bg-gold-300/20 text-gold-600 border-gold-300/50 dark:text-gold-300",
    danger: "bg-maroon-50 text-maroon-800 border-maroon-200 dark:bg-maroon-500/10 dark:text-maroon-200 dark:border-maroon-500/20",
    success: "bg-pista-400/10 text-pista-600 border-pista-400/30 dark:text-pista-400",
  };
  return <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-sm", tones[tone], className)}>{children}</div>;
}
