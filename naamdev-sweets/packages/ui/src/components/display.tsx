import type { HTMLAttributes, ReactNode } from "react";
import { discountPercent, formatINR, type Tone } from "@naamdev/shared";
import { cn } from "../cn";

export function Card({ className, children, interactive, ...props }: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div className={cn("rounded-xl border border-line bg-surface", interactive && "transition-colors duration-150 hover:border-ink-soft/40", className)} {...props}>
      {children}
    </div>
  );
}

const toneStyles: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-soft ring-line",
  info: "bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-500/20",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/20",
  warning: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/20",
  danger: "bg-maroon-50 text-maroon-700 ring-maroon-200 dark:bg-maroon-500/10 dark:text-maroon-200 dark:ring-maroon-500/20",
  brand: "bg-saffron-50 text-saffron-800 ring-saffron-200 dark:bg-saffron-500/10 dark:text-saffron-200 dark:ring-saffron-500/20",
};

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", toneStyles[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Indian FSSAI-style veg / non-veg / egg indicator. */
export function VegMark({ type = "VEG", className }: { type?: "VEG" | "EGG" | "NON_VEG"; className?: string }) {
  const color = type === "VEG" ? "border-veg text-veg" : type === "EGG" ? "border-amber-600 text-amber-600" : "border-nonveg text-nonveg";
  return (
    <span title={type === "VEG" ? "Vegetarian" : type === "EGG" ? "Contains egg" : "Non-vegetarian"} className={cn("inline-grid h-4 w-4 shrink-0 place-items-center rounded-[3px] border-[1.5px] bg-white", color, className)}>
      {type === "NON_VEG" ? (
        <svg viewBox="0 0 10 10" className="h-2 w-2" fill="currentColor"><path d="M5 1l4 8H1z" /></svg>
      ) : (
        <span className="h-2 w-2 rounded-full bg-current" />
      )}
      <span className="sr-only">{type === "VEG" ? "Vegetarian" : type}</span>
    </span>
  );
}

export function Price({ pricePaise, mrpPaise, size = "md", className, showDiscount = true }: { pricePaise: number; mrpPaise?: number | null; size?: "sm" | "md" | "lg" | "xl"; className?: string; showDiscount?: boolean }) {
  const off = mrpPaise ? discountPercent(mrpPaise, pricePaise) : 0;
  const s = { sm: "text-sm", md: "text-base", lg: "text-xl", xl: "text-3xl" }[size];
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5", className)}>
      <span className={cn("font-bold tracking-tight text-ink tabular-nums", s)}>{formatINR(pricePaise)}</span>
      {off > 0 && mrpPaise && <span className={cn("text-muted line-through tabular-nums", size === "xl" ? "text-base" : "text-xs")}>{formatINR(mrpPaise)}</span>}
      {off > 0 && showDiscount && <span className={cn("font-bold text-pista-600 dark:text-pista-400", size === "xl" ? "text-sm" : "text-[11px]")}>{off}% OFF</span>}
    </span>
  );
}

export function RatingPill({ rating, count, className }: { rating: number; count?: number; className?: string }) {
  if (!count) return null;
  const color = rating >= 4 ? "bg-pista-600" : rating >= 3 ? "bg-gold-500" : "bg-maroon-500";
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold text-ink-soft", className)}>
      <span className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white", color)}>
        {rating.toFixed(1)}
        <svg viewBox="0 0 20 20" className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true"><path d="M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.8z" /></svg>
      </span>
      {count != null && <span className="text-muted">({count})</span>}
    </span>
  );
}

export function Stars({ value, size = 16, onChange, className }: { value: number; size?: number; onChange?: (v: number) => void; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} role={onChange ? "radiogroup" : "img"} aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const star = (
          <svg viewBox="0 0 20 20" width={size} height={size} className={i <= Math.round(value) ? "text-gold-400" : "text-line"} fill="currentColor" aria-hidden="true">
            <path d="M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.8z" />
          </svg>
        );
        return onChange ? (
          <button key={i} type="button" role="radio" aria-checked={i === value} aria-label={`${i} star${i > 1 ? "s" : ""}`} onClick={() => onChange(i)} className="transition hover:scale-110">
            {star}
          </button>
        ) : (
          <span key={i}>{star}</span>
        );
      })}
    </span>
  );
}

export function Avatar({ name, src, size = 40, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name} width={size} height={size} className={cn("rounded-full object-cover", className)} style={{ width: size, height: size }} />
  ) : (
    <span className={cn("inline-grid shrink-0 place-items-center rounded-full bg-maroon-800 font-semibold text-cream-100", className)} style={{ width: size, height: size, fontSize: size * 0.38 }} aria-label={name}>
      {initials || "N"}
    </span>
  );
}

export function SectionHeading({ title, subtitle, action, className, eyebrow }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string; eyebrow?: string }) {
  return (
    <div className={cn("mb-4 flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-[13px] font-semibold text-accent">{eyebrow}</p>}
        <h2 className="font-display text-[22px] font-extrabold leading-tight text-ink sm:text-[26px]">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon, trend, className }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; trend?: { value: string; positive?: boolean }; className?: string }) {
  return (
    <Card className={cn("relative overflow-hidden p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-muted">{label}</p>
          <p className="mt-2 truncate text-[28px] font-bold leading-none tracking-tight text-ink tabular-nums">{value}</p>
        </div>
        {icon && <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-soft [&_svg]:h-[18px] [&_svg]:w-[18px]">{icon}</div>}
      </div>
      {(hint || trend) && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted">
          {trend && <span className={cn("rounded-md px-1.5 py-0.5 font-semibold", trend.positive ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-maroon-50 text-maroon-700 dark:bg-maroon-500/10 dark:text-maroon-300")}>{trend.value}</span>}
          {hint}
        </div>
      )}
    </Card>
  );
}

export function Divider({ label, className }: { label?: string; className?: string }) {
  if (!label) return <hr className={cn("border-line-soft", className)} />;
  return (
    <div className={cn("flex items-center gap-3 text-xs font-medium text-muted", className)}>
      <span className="h-px flex-1 bg-line" />
      {label}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export function Money({ paise, className }: { paise: number; className?: string }) {
  return <span className={cn("tabular-nums", className)}>{formatINR(paise)}</span>;
}
