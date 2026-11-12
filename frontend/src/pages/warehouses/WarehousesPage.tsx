import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, MapPin, Pencil, Plus, Power, PowerOff, TriangleAlert } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { stockKeys, useWarehouses } from '@/lib/queries';
import type { Warehouse } from '@/lib/types';
import { formatCurrency, formatNumber } from '@/lib/format';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { Button, IconButton } from '@/components/ui/Button';
import { ActiveBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/Common';
import { Skeleton } from '@/components/ui/Spinner';
import { WarehouseFormModal } from './WarehouseFormModal';

export function WarehousesPage() {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useWarehouses(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const canManage = can('warehouses:manage');

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch<{ data: Warehouse }>(`/warehouses/${id}/status`, { isActive }),
    onSuccess: (res) => {
      stockKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      toast.success(res.data.isActive ? 'Warehouse activated' : 'Warehouse deactivated', res.data.name);
    },
    onError: (err) => toast.error('Status change failed', errorMessage(err)),
  });

  const toggle = async (w: Warehouse) => {
    const ok = await confirm({
      title: w.isActive ? 'Deactivate warehouse?' : 'Activate warehouse?',
      message: w.isActive
        ? `${w.name} will no longer accept stock operations. Warehouses that still hold stock cannot be deactivated — transfer or issue the remaining ${formatNumber(w.totalUnits)} units first.`
        : `${w.name} will accept stock operations again.`,
      confirmLabel: w.isActive ? 'Deactivate' : 'Activate',
      tone: w.isActive ? 'danger' : 'primary',
    });
    if (ok) statusMutation.mutate({ id: w.id, isActive: !w.isActive });
  };

  const totalUnits = data?.reduce((s, w) => s + w.totalUnits, 0) ?? 0;

  return (
    <div>
      <PageHeader
        title="Warehouses"
        description={data ? `${data.filter((w) => w.isActive).length} active warehouses · ${formatNumber(totalUnits)} units on hand` : 'Storage locations and their live stock position.'}
        actions={
          canManage && (
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Add warehouse
            </Button>
          )
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="card">
          <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
        </div>
      ) : !data?.length ? (
        <div className="card">
          <EmptyState title="No warehouses yet" description="Create a warehouse to start receiving stock." />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.map((w) => {
            const share = totalUnits ? Math.round((w.totalUnits / totalUnits) * 100) : 0;
            return (
              <article key={w.id} className={`card flex flex-col ${w.isActive ? '' : 'opacity-70'}`}>
                <div className="flex items-start justify-between gap-3 p-5 pb-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-brand-50 px-2 py-0.5 font-mono text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{w.code}</span>
                      <ActiveBadge active={w.isActive} />
                    </div>
                    <h2 className="mt-2 truncate text-base font-semibold text-ink">{w.name}</h2>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-3">
                      <MapPin className="size-3.5" /> {w.city}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex gap-0.5">
                      <IconButton
                        label="Edit warehouse"
                        onClick={() => {
                          setEditing(w);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </IconButton>
                      <IconButton label={w.isActive ? 'Deactivate warehouse' : 'Activate warehouse'} onClick={() => toggle(w)}>
                        {w.isActive ? <PowerOff className="size-4" /> : <Power className="size-4" />}
                      </IconButton>
                    </div>
                  )}
                </div>

                <dl className="grid grid-cols-3 divide-x divide-line border-y border-line bg-surface-2">
                  {[
                    ['Units', formatNumber(w.totalUnits)],
                    ['SKUs', formatNumber(w.skuCount)],
                    ['Share', `${share}%`],
                  ].map(([k, v]) => (
                    <div key={k} className="px-4 py-3">
                      <dt className="text-[11px] tracking-wide text-ink-3 uppercase">{k}</dt>
                      <dd className="mt-0.5 text-lg font-semibold text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>

                <div className="flex-1 space-y-4 p-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-2">Stock value</span>
                    <span className="font-semibold text-ink tabular">{formatCurrency(w.stockValue)}</span>
                  </div>
                  {w.utilization !== null && (
                    <div>
                      <div className="flex items-center justify-between text-xs text-ink-3">
                        <span>Capacity utilisation</span>
                        <span className="tabular">
                          {formatNumber(w.totalUnits)} / {formatNumber(w.capacity!)} · {w.utilization}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--series-1)_14%,transparent)]" aria-hidden>
                        <div className="h-full rounded-full bg-series-1" style={{ width: `${Math.max(1, w.utilization)}%` }} />
                      </div>
                    </div>
                  )}
                  {w.lowStockCount > 0 && (
                    <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                      <TriangleAlert className="size-3.5" /> {w.lowStockCount} product{w.lowStockCount > 1 ? 's' : ''} at or below reorder level here
                    </p>
                  )}
                  {w.address && <p className="text-xs leading-relaxed text-ink-3">{w.address}</p>}
                </div>

                <Link to={`/warehouses/${w.id}`} className="flex items-center justify-between border-t border-line px-5 py-3 text-sm font-medium text-brand-600 hover:bg-surface-2 dark:text-brand-400">
                  View stock & movements <ArrowRight className="size-4" />
                </Link>
              </article>
            );
          })}
        </div>
      )}

      <WarehouseFormModal open={formOpen} onClose={() => setFormOpen(false)} warehouse={editing} />
    </div>
  );
}
