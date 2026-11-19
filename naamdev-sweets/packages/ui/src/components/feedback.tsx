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

export function Skeleton({ className, rounded = "rounded-2xl" }: { className?: string; rounded?: string }) {
  return <div aria-hidden="true" className={cn("nd-shimmer", rounded, className)} />;
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {icon && (
        <div className="relative mb-5 grid h-20 w-20 place-items-center rounded-full bg-saffron-50 text-saffron-600 dark:bg-saffron-500/10">
          <div className="absolute inset-0 rounded-full border-2 border-dashed border-saffron-200 dark:border-saffron-500/30" />
          {icon}
        </div>
      )}
      <h3 className="font-display text-xl font-semibold text-ink">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, action, className }: { title?: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center rounded-3xl border border-maroon-200/60 bg-maroon-50/60 px-6 py-10 text-center dark:border-maroon-500/20 dark:bg-maroon-500/5", className)}>
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-maroon-100 text-2xl dark:bg-maroon-500/15">🍮</div>
      <h3 className="font-display text-lg font-semibold text-maroon-800 dark:text-maroon-200">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-maroon-700/80 dark:text-maroon-200/70">{description}</p>}
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
  return <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-2xl border px-4 py-3 text-sm", tones[tone], className)}>{children}</div>;
}
