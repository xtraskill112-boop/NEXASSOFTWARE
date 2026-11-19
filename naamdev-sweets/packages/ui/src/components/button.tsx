import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../cn";
import { Spinner } from "./feedback";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "soft" | "danger" | "link" | "white";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl" | "icon" | "icon-sm";

const variants: Record<ButtonVariant, string> = {
  primary:
    "nd-gradient-saffron text-white shadow-glow hover:brightness-[1.06] active:brightness-95 shadow-inset disabled:shadow-none",
  secondary: "nd-gradient-maroon text-cream-100 shadow-card hover:brightness-110 active:brightness-95",
  outline: "border border-line bg-surface text-ink hover:border-saffron-400 hover:text-saffron-700 dark:hover:text-saffron-300",
  ghost: "text-ink-soft hover:bg-surface-2 hover:text-ink",
  soft: "bg-saffron-100 text-saffron-800 hover:bg-saffron-200 dark:bg-saffron-500/15 dark:text-saffron-200 dark:hover:bg-saffron-500/25",
  danger: "bg-maroon-600 text-white hover:bg-maroon-700 shadow-card",
  link: "text-saffron-700 underline-offset-4 hover:underline dark:text-saffron-300 px-0 h-auto",
  white: "bg-white text-maroon-800 shadow-card hover:bg-cream-100",
};

const sizes: Record<ButtonSize, string> = {
  xs: "h-7 px-2.5 text-xs rounded-lg gap-1",
  sm: "h-9 px-3.5 text-sm rounded-xl gap-1.5",
  md: "h-11 px-5 text-sm rounded-2xl gap-2",
  lg: "h-12 px-6 text-[15px] rounded-2xl gap-2",
  xl: "h-14 px-7 text-base rounded-[1.25rem] gap-2.5",
  icon: "h-11 w-11 rounded-2xl",
  "icon-sm": "h-9 w-9 rounded-xl",
};

export function buttonStyles(opts: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string } = {}) {
  return cn(
    "relative inline-flex select-none items-center justify-center whitespace-nowrap font-semibold tracking-[-0.01em] transition-all duration-200 ease-out",
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    variants[opts.variant ?? "primary"],
    sizes[opts.size ?? "md"],
    opts.block && "w-full",
    opts.className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, block, loading, className, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonStyles({ variant, size, block, className })} {...props}>
      {loading && <Spinner className="h-4 w-4" />}
      <span className={cn("inline-flex items-center gap-[inherit]", loading && "opacity-90")}>{children}</span>
    </button>
  );
});
