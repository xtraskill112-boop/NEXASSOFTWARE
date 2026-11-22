"use client";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../cn";

export function QuantityStepper({ value, onChange, min = 0, max = 20, size = "md", disabled, className, label = "Quantity" }: { value: number; onChange: (v: number) => void; min?: number; max?: number; size?: "sm" | "md" | "lg"; disabled?: boolean; className?: string; label?: string }) {
  const h = { sm: "h-8 text-sm", md: "h-10 text-[15px]", lg: "h-12 text-base" }[size];
  const w = { sm: "w-7", md: "w-9", lg: "w-11" }[size];
  return (
    <div role="group" aria-label={label} className={cn("inline-flex items-center overflow-hidden rounded-lg border border-maroon-700 bg-surface font-bold text-maroon-700 dark:border-maroon-300 dark:text-maroon-100", h, className)}>
      <button type="button" aria-label="Decrease quantity" disabled={disabled || value <= min} onClick={() => onChange(value - 1)} className={cn("grid h-full place-items-center transition hover:bg-maroon-50 disabled:opacity-40 dark:hover:bg-maroon-500/20", w)}>
        −
      </button>
      <span className="relative grid h-full min-w-7 place-items-center overflow-hidden tabular-nums" aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={value} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} transition={{ duration: 0.16 }}>
            {value}
          </motion.span>
        </AnimatePresence>
      </span>
      <button type="button" aria-label="Increase quantity" disabled={disabled || value >= max} onClick={() => onChange(value + 1)} className={cn("grid h-full place-items-center transition hover:bg-maroon-50 disabled:opacity-40 dark:hover:bg-maroon-500/20", w)}>
        +
      </button>
    </div>
  );
}
