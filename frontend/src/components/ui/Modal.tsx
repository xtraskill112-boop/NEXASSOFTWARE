import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import clsx from 'clsx';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Prevent closing via backdrop/Escape (e.g. while saving) */
  locked?: boolean;
}

const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

export function Modal({ open, onClose, title, description, children, footer, size = 'md', locked }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // focus first focusable field
    setTimeout(() => {
      const el = panelRef.current?.querySelector<HTMLElement>('input:not([type=hidden]):not([disabled]), select, textarea, button[data-autofocus]');
      (el ?? panelRef.current)?.focus();
    }, 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose, locked]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-slate-950/50 backdrop-blur-[2px]" onClick={() => !locked && onClose()} aria-hidden />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={clsx(
          'relative flex max-h-[92vh] w-full animate-slide-up flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl outline-none sm:rounded-2xl',
          widths[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-ink-2">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={locked}
            className="-mr-1 rounded-lg p-1.5 text-ink-3 hover:bg-surface-3 hover:text-ink disabled:opacity-40"
            aria-label="Close dialog"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-line bg-surface-2 px-5 py-3.5 sm:flex-row sm:justify-end sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-slate-950/40" onClick={onClose} aria-hidden />
      <aside className="relative flex h-full w-full max-w-xl animate-slide-in-right flex-col border-l border-line bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-ink">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm text-ink-2">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} className="-mr-1 rounded-lg p-1.5 text-ink-3 hover:bg-surface-3 hover:text-ink" aria-label="Close panel">
            <X className="size-5" />
          </button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3.5 sm:px-6">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}
