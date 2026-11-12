import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Pencil, PackageMinus, PackagePlus } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { qk } from '@/lib/queries';
import type { ProductDetail } from '@/lib/types';
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/format';
import { useAuth } from '@/context/AuthContext';
import { Drawer } from '@/components/ui/Modal';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ActiveBadge, MovementBadge, StockStatusBadge } from '@/components/ui/Badge';
import { PageLoader } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/Common';

export function ProductDetailDrawer({ productId, onClose, onEdit }: { productId: string | null; onClose: () => void; onEdit: (p: ProductDetail) => void }) {
  const { can } = useAuth();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.product(productId ?? ''),
    queryFn: () => api.get<{ data: ProductDetail }>(`/products/${productId}`).then((r) => r.data),
    enabled: !!productId,
  });

  const maxQty = Math.max(1, ...(data?.stockByWarehouse.map((w) => w.quantity) ?? [1]));

  return (
    <Drawer
      open={!!productId}
      onClose={onClose}
      title={data ? data.name : 'Product details'}
      subtitle={data ? `${data.sku} · ${data.category}` : undefined}
      footer={
        data && (
          <>
            {can('inventory:stock-in') && data.isActive && (
              <ButtonLink to={`/inventory/operations?tab=in&productId=${data.id}`} variant="secondary" size="sm" icon={<PackagePlus className="size-4" />}>
                Stock in
              </ButtonLink>
            )}
            {can('inventory:stock-out') && data.isActive && (
              <ButtonLink to={`/inventory/operations?tab=out&productId=${data.id}`} variant="secondary" size="sm" icon={<PackageMinus className="size-4" />}>
                Stock out
              </ButtonLink>
            )}
            {can('inventory:transfer') && data.isActive && (
              <ButtonLink to={`/inventory/operations?tab=transfer&productId=${data.id}`} variant="secondary" size="sm" icon={<ArrowLeftRight className="size-4" />}>
                Transfer
              </ButtonLink>
            )}
            {can('products:update') && (
              <Button size="sm" icon={<Pencil className="size-4" />} onClick={() => onEdit(data)}>
                Edit
              </Button>
            )}
          </>
        )
      }
    >
      {isLoading ? (
        <PageLoader />
      ) : isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      ) : data ? (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <StockStatusBadge status={data.stockStatus} />
            <ActiveBadge active={data.isActive} />
          </div>

          <dl className="grid grid-cols-2 gap-3">
            {[
              ['Total on hand', `${formatNumber(data.totalStock)} ${data.unit}`],
              ['Stock value', formatCurrency(data.stockValue)],
              ['Unit price', formatCurrency(data.unitPrice)],
              ['Reorder level', `${formatNumber(data.reorderLevel)} ${data.unit}`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-line bg-surface-2 px-3.5 py-3">
                <dt className="text-xs text-ink-3">{k}</dt>
                <dd className="mt-1 text-base font-semibold text-ink">{v}</dd>
              </div>
            ))}
          </dl>

          {data.description && <p className="text-sm leading-relaxed text-ink-2">{data.description}</p>}

          <section>
            <h3 className="mb-3 text-sm font-semibold text-ink">Stock by warehouse</h3>
            <ul className="space-y-3">
              {data.stockByWarehouse.map((w) => (
                <li key={w.warehouseId}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-2">
                      <span className="font-medium text-ink">{w.warehouseCode}</span> · {w.warehouseName}
                    </span>
                    <span className="font-semibold text-ink tabular">{formatNumber(w.quantity)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--series-1)_14%,transparent)]" aria-hidden>
                    <div className="h-full rounded-full bg-series-1" style={{ width: `${(w.quantity / maxQty) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-ink">Recent movements</h3>
            {data.recentMovements.length === 0 ? (
              <p className="text-sm text-ink-3">No stock movements recorded for this product yet.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {data.recentMovements.map((m) => (
                  <li key={m.id} className="flex items-start justify-between gap-3 px-3.5 py-3">
                    <div className="min-w-0">
                      <MovementBadge type={m.type} />
                      <p className="mt-1 text-xs text-ink-3">
                        {m.type === 'TRANSFER'
                          ? `${m.fromWarehouse?.code} → ${m.toWarehouse?.code}`
                          : m.type === 'STOCK_IN'
                            ? `into ${m.toWarehouse?.code}`
                            : `from ${m.fromWarehouse?.code}`}
                        {m.reference && ` · ${m.reference}`} · {m.performedBy.name}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-ink tabular">
                        {m.type === 'STOCK_IN' ? '+' : m.type === 'STOCK_OUT' ? '−' : ''}
                        {formatNumber(m.quantity)}
                      </p>
                      <p className="text-xs text-ink-3">{formatDateTime(m.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-xs text-ink-3">
            Created {formatDateTime(data.createdAt)} · Last updated {formatDateTime(data.updatedAt)}
          </p>
        </div>
      ) : null}
    </Drawer>
  );
}
