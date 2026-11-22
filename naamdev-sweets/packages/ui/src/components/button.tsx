import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../cn";
import { Spinner } from "./feedback";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "soft" | "danger" | "link" | "white";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl" | "icon" | "icon-sm";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-maroon-700 text-white hover:bg-maroon-800 active:bg-maroon-900 dark:bg-maroon-600 dark:hover:bg-maroon-500",
  secondary: "bg-ink text-bg hover:bg-ink-soft",
  outline: "border border-line bg-surface text-ink hover:border-ink-soft/50 hover:bg-surface-2",
  ghost: "text-ink-soft hover:bg-surface-2 hover:text-ink",
  soft: "bg-surface-2 text-ink hover:bg-surface-3",
  danger: "bg-maroon-600 text-white hover:bg-maroon-700",
  link: "h-auto px-0 text-maroon-700 underline decoration-maroon-700/30 underline-offset-4 hover:decoration-maroon-700 dark:text-maroon-200 dark:decoration-maroon-200/40",
  white: "bg-white text-maroon-800 hover:bg-cream-100",
};

const sizes: Record<ButtonSize, string> = {
  xs: "h-7 px-2.5 text-xs rounded-md gap-1",
  sm: "h-9 px-3.5 text-sm rounded-md gap-1.5",
  md: "h-11 px-5 text-[15px] rounded-lg gap-2",
  lg: "h-12 px-6 text-[15px] rounded-lg gap-2",
  xl: "h-14 px-7 text-base rounded-lg gap-2.5",
  icon: "h-11 w-11 rounded-lg",
  "icon-sm": "h-9 w-9 rounded-md",
};

export function buttonStyles(opts: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string } = {}) {
  return cn(
    "relative inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-colors duration-150",
    "disabled:pointer-events-none disabled:opacity-50",
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
