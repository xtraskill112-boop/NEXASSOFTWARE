import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import clsx from 'clsx';

type ToastKind = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

interface ToastApi {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const icons = {
  success: <CheckCircle2 className="size-5 text-[var(--status-good)]" aria-hidden />,
  error: <XCircle className="size-5 text-[var(--status-critical)]" aria-hidden />,
  warning: <AlertTriangle className="size-5 text-[var(--status-warning)]" aria-hidden />,
  info: <Info className="size-5 text-brand-500" aria-hidden />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (kind: ToastKind, title: string, message?: string) => {
      const id = ++counter.current;
      setToasts((t) => [...t.slice(-4), { id, kind, title, message }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4500);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (t, m) => push('success', t, m),
      error: (t, m) => push('error', t, m),
      warning: (t, m) => push('warning', t, m),
      info: (t, m) => push('info', t, m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={clsx(
              'card pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 p-4 shadow-lg',
            )}
          >
            <div className="mt-0.5 shrink-0">{icons[t.kind]}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{t.title}</p>
              {t.message && <p className="mt-0.5 text-sm break-words text-ink-2">{t.message}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="rounded-md p-1 text-ink-3 hover:bg-surface-3 hover:text-ink"
              aria-label="Dismiss notification"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
