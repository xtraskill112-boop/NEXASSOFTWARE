import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ExternalLink, Loader2, X } from "lucide-react";
import { GROUPS, TONE_CLASSES, groupLabel } from "../lib/status";
import type { Kind, StatusGroup } from "../types";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "danger" | "ghost";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-on-brand hover:bg-brand-strong shadow-sm",
  secondary: "bg-surface text-ink ring-1 ring-line hover:bg-subtle",
  danger: "bg-critical text-white hover:opacity-90 shadow-sm",
  ghost: "text-ink-2 hover:bg-subtle",
};

export function Button({
  variant = "secondary",
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl bg-surface p-4 ring-1 ring-line sm:p-5", className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-ink sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const fieldClass =
  "block w-full rounded-lg border-0 bg-surface px-3 py-2 text-sm text-ink ring-1 ring-line placeholder:text-ink-3 focus:ring-2 focus:ring-brand focus:outline-none disabled:bg-subtle";

export function Field({ label, hint, error, required, children }: { label: string; hint?: string; error?: string; required?: boolean; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink-2">
        {label}
        {required && <span className="text-critical"> *</span>}
      </label>
      {children(id)}
      {hint && !error && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
      {error && (
        <p className="mt-1 text-xs text-critical" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput({ label, hint, error, required, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {(id) => <input id={id} required={required} {...rest} className={cx(fieldClass, error && "ring-critical")} aria-invalid={Boolean(error)} />}
    </Field>
  );
}

export function TextArea({ label, hint, error, required, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string }) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {(id) => <textarea id={id} required={required} rows={2} {...rest} className={cx(fieldClass, error && "ring-critical")} aria-invalid={Boolean(error)} />}
    </Field>
  );
}

export function Select({ label, hint, error, required, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; error?: string }) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {(id) => (
        <select id={id} required={required} {...rest} className={cx(fieldClass, "pr-8", error && "ring-critical")}>
          {children}
        </select>
      )}
    </Field>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-subtle p-1 ring-1 ring-line">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "min-h-9 rounded-md px-3 text-sm font-medium transition",
            value === o.value ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-ink-3 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function StatusBadge({ group, kind, text }: { group: StatusGroup; kind: Kind; text?: string }) {
  const meta = GROUPS[group] ?? GROUPS.other;
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONE_CLASSES[meta.tone])} title={meta.hint}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {text ?? groupLabel(group, kind)}
    </span>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-3" role="status">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center">
      <p className="font-medium text-ink-2">{title}</p>
      {children && <div className="mt-2 text-sm text-ink-3">{children}</div>}
    </div>
  );
}

export function Alert({ tone = "info", title, children }: { tone?: "info" | "good" | "warn" | "critical"; title?: string; children?: ReactNode }) {
  const tones = {
    info: "bg-info-soft text-info ring-info/20",
    good: "bg-good-soft text-good ring-good/20",
    warn: "bg-warn-soft text-warn ring-warn/25",
    critical: "bg-critical-soft text-critical ring-critical/20",
  };
  return (
    <div className={cx("rounded-lg px-3 py-2 text-sm ring-1 ring-inset", tones[tone])} role={tone === "critical" ? "alert" : "status"}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cx(title && "mt-0.5", "text-ink-2 [&_a]:underline")}>{children}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto w-[min(100vw-2rem,32rem)] rounded-xl bg-surface p-0 text-ink shadow-xl ring-1 ring-line backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="font-semibold">{title}</h2>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-ink-3 hover:bg-subtle" aria-label="Close">
          <X className="size-5" />
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto px-4 py-4">{children}</div>
      {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
    </dialog>
  );
}

/** For everything the Shadowfax API does not offer. */
export function PanelLink({ url, children = "Open in Shadowfax panel" }: { url: string; children?: ReactNode }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-surface px-4 py-2 text-sm font-medium text-ink ring-1 ring-line hover:bg-subtle"
    >
      {children}
      <ExternalLink className="size-4" aria-hidden />
    </a>
  );
}

export function KeyValue({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-line/60 py-1 sm:block sm:border-0 sm:py-0">
          <dt className="text-ink-3">{k}</dt>
          <dd className="text-right font-medium text-ink sm:text-left">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
