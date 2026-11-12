import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import clsx from 'clsx';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/20 disabled:bg-brand-600/60',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-3 shadow-[0_1px_2px_rgba(16,24,40,0.05)]',
  ghost: 'text-ink-2 hover:bg-surface-3 hover:text-ink',
  danger: 'bg-[var(--status-critical)] text-white hover:brightness-95 shadow-sm disabled:opacity-60',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm disabled:opacity-60',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
};

const base =
  'inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed';

/** A router link styled as a button (avoids nesting <button> inside <a>). */
export function ButtonLink({ variant = 'primary', size = 'md', icon, className, children, ...rest }: LinkProps & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <Link className={clsx(base, variants[variant], sizes[size], className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        base,
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex size-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
