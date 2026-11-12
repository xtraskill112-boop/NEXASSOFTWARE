import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setOptions(null);
  };

  const danger = options?.tone !== 'primary';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!options}
        onClose={() => close(false)}
        size="sm"
        title={
          <span className="flex items-center gap-2.5">
            <span className={danger ? 'flex size-8 items-center justify-center rounded-full bg-red-50 text-[var(--status-critical)] dark:bg-red-500/10' : 'flex size-8 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15'}>
              {danger ? <AlertTriangle className="size-4" /> : <HelpCircle className="size-4" />}
            </span>
            {options?.title}
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              {options?.cancelLabel ?? 'Cancel'}
            </Button>
            <Button variant={danger ? 'danger' : 'primary'} onClick={() => close(true)} data-autofocus>
              {options?.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        }
      >
        <div className="text-sm leading-relaxed text-ink-2">{options?.message}</div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
