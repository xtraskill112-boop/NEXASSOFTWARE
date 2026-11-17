"use client";
import { forwardRef, useId, useRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "../cn";

const fieldBase =
  "w-full rounded-2xl border border-line bg-surface px-4 text-[15px] text-ink placeholder:text-muted/80 transition-all duration-150 outline-none focus:border-saffron-400 focus:ring-4 focus:ring-saffron-400/15 disabled:opacity-60 aria-[invalid=true]:border-maroon-400 aria-[invalid=true]:ring-maroon-400/10";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { leading?: ReactNode; trailing?: ReactNode }>(function Input({ className, leading, trailing, ...props }, ref) {
  if (!leading && !trailing) return <input ref={ref} className={cn(fieldBase, "h-12", className)} {...props} />;
  return (
    <div className="relative">
      {leading && <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-muted">{leading}</span>}
      <input ref={ref} className={cn(fieldBase, "h-12", leading && "pl-11", trailing && "pr-12", className)} {...props} />
      {trailing && <span className="absolute inset-y-0 right-2 flex items-center">{trailing}</span>}
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, "min-h-[96px] py-3 leading-relaxed", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(fieldBase, "h-12 appearance-none pr-10", className)} {...props}>
        {children}
      </select>
      <svg className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
      </svg>
    </div>
  );
});

export function Label({ htmlFor, children, className }: { htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1.5 block text-[13px] font-semibold text-ink-soft", className)}>
      {children}
    </label>
  );
}

/** Label + control + hint/error, wiring ids for accessibility. */
export function Field({ label, error, hint, children, className, required }: { label?: string; error?: string | null; hint?: string; children: (props: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => ReactNode; className?: string; required?: boolean }) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={id}>
          {label}
          {required && <span className="ml-0.5 text-maroon-500">*</span>}
        </Label>
      )}
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {error ? (
        <p id={`${id}-err`} className="mt-1.5 text-[13px] font-medium text-maroon-600 dark:text-maroon-300">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[13px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({ checked, onChange, label, description, disabled, className }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: string; disabled?: boolean; className?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn("flex cursor-pointer items-start gap-3", disabled && "cursor-not-allowed opacity-60", className)}>
      <input id={id} type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 border-line bg-surface transition peer-checked:border-saffron-500 peer-checked:bg-saffron-500 peer-focus-visible:ring-4 peer-focus-visible:ring-saffron-400/30">
        <svg className={cn("h-3 w-3 text-white transition", checked ? "scale-100" : "scale-0")} viewBox="0 0 12 12" fill="none"><path d="M2 6.5l2.5 2.5L10 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-muted">{description}</span>}
      </span>
    </label>
  );
}

export function Switch({ checked, onChange, label, disabled, size = "md" }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean; size?: "md" | "lg" }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50",
        size === "lg" ? "h-9 w-16" : "h-6 w-11",
        checked ? "bg-pista-500" : "bg-line",
      )}
    >
      <span className={cn("inline-block rounded-full bg-white shadow-md transition-transform duration-200 ease-[var(--ease-spring)]", size === "lg" ? "h-7 w-7" : "h-5 w-5", checked ? (size === "lg" ? "translate-x-8" : "translate-x-[22px]") : "translate-x-0.5")} />
    </button>
  );
}

/** Six-box OTP input with paste + autofill support. */
export function OtpInput({ value, onChange, length = 6, autoFocus, disabled }: { value: string; onChange: (v: string) => void; length?: number; autoFocus?: boolean; disabled?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(length, " ").slice(0, length).split("");
  const set = (i: number, d: string) => {
    const arr = value.padEnd(length, " ").split("").slice(0, length);
    arr[i] = d || " ";
    onChange(arr.join("").replace(/\s+$/, "").replace(/\s/g, ""));
  };
  return (
    <div className="flex justify-between gap-2" role="group" aria-label="One-time password">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d.trim()}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1}`}
          maxLength={length}
          className="h-14 w-full min-w-0 rounded-2xl border border-line bg-surface text-center font-display text-2xl font-semibold text-ink outline-none transition focus:border-saffron-400 focus:ring-4 focus:ring-saffron-400/15"
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            if (v.length > 1) {
              onChange(v.slice(0, length));
              refs.current[Math.min(v.length, length) - 1]?.focus();
              return;
            }
            set(i, v);
            if (v && i < length - 1) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !d.trim() && i > 0) refs.current[i - 1]?.focus();
          }}
        />
      ))}
    </div>
  );
}
