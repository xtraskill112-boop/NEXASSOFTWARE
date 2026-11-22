"use client";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../cn";

export function QuantityStepper({ value, onChange, min = 0, max = 20, size = "md", disabled, className, label = "Quantity" }: { value: number; onChange: (v: number) => void; min?: number; max?: number; size?: "sm" | "md" | "lg"; disabled?: boolean; className?: string; label?: string }) {
  const h = { sm: "h-9 text-sm", md: "h-11 text-[15px]", lg: "h-12 text-base" }[size];
  const w = { sm: "w-8", md: "w-10", lg: "w-11" }[size];
  return (
    <div role="group" aria-label={label} className={cn("inline-flex items-center overflow-hidden rounded-lg border border-line bg-surface font-extrabold text-maroon-700 dark:text-maroon-200", h, className)}>
      <button type="button" aria-label="Decrease quantity" disabled={disabled || value <= min} onClick={() => onChange(value - 1)} className={cn("nd-press grid h-full place-items-center hover:bg-maroon-50 disabled:opacity-40 dark:hover:bg-maroon-500/15", w)}>
        −
      </button>
      <span className="relative grid h-full min-w-7 place-items-center overflow-hidden tabular-nums" aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={value} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} transition={{ duration: 0.16 }}>
            {value}
          </motion.span>
        </AnimatePresence>
      </span>
      <button type="button" aria-label="Increase quantity" disabled={disabled || value >= max} onClick={() => onChange(value + 1)} className={cn("nd-press grid h-full place-items-center hover:bg-maroon-50 disabled:opacity-40 dark:hover:bg-maroon-500/15", w)}>
        +
      </button>
    </div>
  );
}
