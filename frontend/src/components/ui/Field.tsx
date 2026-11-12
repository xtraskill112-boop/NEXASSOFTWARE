import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';

const control =
  'block w-full rounded-lg border bg-surface px-3 text-sm text-ink placeholder:text-ink-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-ink-3';
const ok = 'border-line-strong focus:border-brand-500 focus:ring-brand-500/15';
const bad = 'border-[var(--status-critical)] focus:border-[var(--status-critical)] focus:ring-red-500/15';

interface FieldProps {
  label?: string;
  htmlFor?: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, hint, required, className, children }: FieldProps) {
  return (
    <div className={clsx('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
          {label}
          {required && <span className="ml-0.5 text-[var(--status-critical)]">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs font-medium text-[var(--status-critical)]" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; leading?: ReactNode }>(
  function Input({ className, invalid, leading, ...rest }, ref) {
    if (leading) {
      return (
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-3">{leading}</span>
          <input ref={ref} className={clsx(control, invalid ? bad : ok, 'h-10 pl-9', className)} aria-invalid={invalid || undefined} {...rest} />
        </div>
      );
    }
    return <input ref={ref} className={clsx(control, invalid ? bad : ok, 'h-10', className)} aria-invalid={invalid || undefined} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function Select({ className, invalid, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={clsx(
          control,
          invalid ? bad : ok,
          'h-10 appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%238a94a6%22%3E%3Cpath%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.17l3.71-3.94a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%2F%3E%3C%2Fsvg%3E")] bg-[length:1.1rem] bg-[right_0.6rem_center] bg-no-repeat pr-9',
          className,
        )}
        aria-invalid={invalid || undefined}
        {...rest}
      >
        {children}
      </select>
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, ...rest }, ref) {
    return <textarea ref={ref} className={clsx(control, invalid ? bad : ok, 'min-h-20 py-2', className)} aria-invalid={invalid || undefined} {...rest} />;
  },
);
