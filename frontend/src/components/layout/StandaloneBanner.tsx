import { useState } from 'react';
import { HardDrive, RotateCcw } from 'lucide-react';
import { tokenStore } from '@/lib/api';
import { localApi } from '@local-api';
import { useConfirm } from '@/context/ConfirmContext';

/** Shown only in the single-file standalone demo build. */
export function StandaloneBanner() {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  if (!localApi) return null;
  const api = localApi;

  const reset = async () => {
    const ok = await confirm({
      title: 'Reset demo data?',
      message: 'All changes made in this browser (products, stock movements, users, audit entries) will be erased and the original demo data restored. You will be signed out.',
      confirmLabel: 'Reset demo data',
    });
    if (!ok) return;
    setBusy(true);
    api.resetData();
    tokenStore.clear();
    window.location.hash = '#/login';
    window.location.reload();
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
      <span className="inline-flex items-center gap-1.5">
        <HardDrive className="size-3.5" />
        Standalone demo edition: all data is stored in this browser only.
      </span>
      <button type="button" onClick={reset} disabled={busy} className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline disabled:opacity-50">
        <RotateCcw className="size-3.5" /> Reset demo data
      </button>
    </div>
  );
}
