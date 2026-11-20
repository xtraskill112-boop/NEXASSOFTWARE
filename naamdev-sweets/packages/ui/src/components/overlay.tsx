"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../cn";

function useLockScroll(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
}

function useFocusTrap(open: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !ref.current) return;
    const el = ref.current;
    const prev = document.activeElement as HTMLElement | null;
    const focusables = () => [...el.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')];
    (focusables()[0] ?? el).focus({ preventScroll: true });
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0]!, last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener("keydown", h);
    return () => {
      el.removeEventListener("keydown", h);
      prev?.focus?.({ preventScroll: true });
    };
  }, [open]);
  return ref;
}

export function Modal({ open, onClose, title, description, children, footer, size = "md", className, bodyClassName, label }: { open: boolean; onClose: () => void; title?: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" | "xl"; className?: string; /** Overrides the body padding (e.g. a custom header). */ bodyClassName?: string; /** Accessible name when there is no title. */ label?: string }) {
  useLockScroll(open);
  useEscape(open, onClose);
  const ref = useFocusTrap(open);
  const id = useId();
  if (typeof document === "undefined") return null;
  const width = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div className="absolute inset-0 bg-maroon-950/50 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? `${id}-t` : undefined}
            aria-label={title ? undefined : label}
            tabIndex={-1}
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className={cn("relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[2rem] bg-bg-elevated shadow-lift outline-none sm:rounded-[2rem]", width, className)}
          >
            {(title || description) && (
              <div className="flex items-start justify-between gap-4 border-b border-line-soft px-6 pb-4 pt-6">
                <div>
                  {title && <h2 id={`${id}-t`} className="font-display text-xl font-semibold text-ink">{title}</h2>}
                  {description && <p className="mt-1 text-sm text-muted">{description}</p>}
                </div>
                <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink">
                  <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
                </button>
              </div>
            )}
            <div className={cn("overflow-y-auto px-6 py-5", bodyClassName)}>{children}</div>
            {footer && <div className="border-t border-line-soft bg-surface-2/50 px-6 py-4">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Bottom sheet on mobile, side drawer on desktop. */
export function Sheet({ open, onClose, title, children, footer, side = "right", className }: { open: boolean; onClose: () => void; title?: ReactNode; children?: ReactNode; footer?: ReactNode; side?: "right" | "left" | "bottom"; className?: string }) {
  useLockScroll(open);
  useEscape(open, onClose);
  const ref = useFocusTrap(open);
  if (typeof document === "undefined") return null;
  const isBottom = side === "bottom";
  const pos = isBottom ? "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-[2rem]" : side === "right" ? "inset-y-0 right-0 w-full max-w-md sm:rounded-l-[2rem]" : "inset-y-0 left-0 w-full max-w-sm sm:rounded-r-[2rem]";
  const from = isBottom ? { y: "100%" } : { x: side === "right" ? "100%" : "-100%" };
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90]">
          <motion.div className="absolute inset-0 bg-maroon-950/45 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            ref={ref}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            initial={from}
            animate={{ x: 0, y: 0 }}
            exit={from}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            className={cn("absolute flex flex-col bg-bg-elevated shadow-lift outline-none", pos, className)}
          >
            {isBottom && <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-line" />}
            {title && (
              <div className="flex items-center justify-between border-b border-line-soft px-5 py-4">
                <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
                <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink">
                  <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto">{children}</div>
            {footer && <div className="border-t border-line-soft p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
