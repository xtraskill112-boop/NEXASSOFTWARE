import { useEffect, useState } from 'react';
import { RefreshCw, Sparkles, X } from 'lucide-react';
import { UPDATE_READY_EVENT } from '@/lib/liveUpdate';

/** Shown when a newer app version has been downloaded in the background. */
export function UpdateBanner() {
  const [release, setRelease] = useState<{ version: string; notes?: string } | null>(null);

  useEffect(() => {
    const onReady = (e: Event) => setRelease((e as CustomEvent<{ version: string; notes?: string }>).detail);
    window.addEventListener(UPDATE_READY_EVENT, onReady);
    return () => window.removeEventListener(UPDATE_READY_EVENT, onReady);
  }, []);

  if (!release) return null;
  return (
    <div role="status" className="card fixed bottom-4 left-4 z-[90] flex max-w-sm animate-slide-up items-start gap-3 p-4 shadow-xl sm:left-6">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
        <Sparkles className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">StockSense {release.version} is ready</p>
        <p className="mt-0.5 text-xs text-ink-2">{release.notes || 'A new version has been downloaded.'}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
        >
          <RefreshCw className="size-3.5" /> Restart now
        </button>
      </div>
      <button type="button" onClick={() => setRelease(null)} className="rounded p-1 text-ink-3 hover:text-ink" aria-label="Later">
        <X className="size-4" />
      </button>
    </div>
  );
}
