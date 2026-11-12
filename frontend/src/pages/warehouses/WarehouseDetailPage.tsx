import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowLeft, MapPin } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { qk } from '@/lib/queries';
import type { Paginated, StockLevelRow, WarehouseDetail } from '@/lib/types';
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/format';
import { useDebounce } from '@/hooks/useDebounce';
import { ActiveBadge, Badge, MovementBadge } from '@/components/ui/Badge';
import { Card, EmptyState, ErrorState, Pagination, SearchInput, Table, TableSkeleton, Td, Th } from '@/components/ui/Common';
import { PageLoader } from '@/components/ui/Spinner';

export function WarehouseDetailPage() {
  const { id = '' } = useParams();
  const [search, setSearch] = useState('');
  const [onlyInStock, setOnlyInStock] = useState(true);
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search);

  const warehouse = useQuery({
    queryKey: qk.warehouse(id),
    queryFn: () => api.get<{ data: WarehouseDetail }>(`/warehouses/${id}`).then((r) => r.data),
  });

  const levels = useQuery({
    queryKey: [...qk.stockLevels, id, debounced, onlyInStock, page],
    queryFn: () => api.get<Paginated<StockLevelRow>>('/inventory/stock-levels', { warehouseId: id, search: debounced, onlyInStock, page, pageSize: 20 }),
    placeholderData: keepPreviousData,
  });

  if (warehouse.isLoading) return <PageLoader />;
  if (warehouse.isError || !warehouse.data)
    return (
      <div className="card">
        <ErrorState message={errorMessage(warehouse.error, 'Warehouse not found')} onRetry={() => warehouse.refetch()} />
      </div>
    );

  const w = warehouse.data;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/warehouses" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
          <ArrowLeft className="size-4" /> All warehouses
        </Link>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-brand-50 px-2 py-0.5 font-mono text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{w.code}</span>
              <ActiveBadge active={w.isActive} />
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{w.name}</h1>
            <p className="mt-1 flex items-center gap-1 text-sm text-ink-2">
              <MapPin className="size-4" /> {w.address ?? w.city}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ['Units on hand', formatNumber(w.totalUnits)],
          ['SKUs stocked', formatNumber(w.skuCount)],
          ['Stock value', formatCurrency(w.stockValue)],
          ['Capacity used', w.utilization !== null ? `${w.utilization}%` : 'Not tracked'],
        ].map(([k, v]) => (
          <div key={k} className="card p-4">
            <p className="text-xs text-ink-3">{k}</p>
            <p className="mt-1 text-xl font-semibold text-ink">{v}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="Stock held in this warehouse"
          bodyClassName="p-0"
          actions={
            <label className="flex items-center gap-2 text-xs text-ink-2">
              <input
                type="checkbox"
                checked={onlyInStock}
                onChange={(e) => {
                  setOnlyInStock(e.target.checked);
                  setPage(1);
                }}
                className="size-4 rounded border-line-strong accent-brand-600"
              />
              In stock only
            </label>
          }
        >
          <div className="border-b border-line p-4">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search product or SKU…"
              className="max-w-sm"
            />
          </div>
          {levels.isLoading ? (
            <TableSkeleton rows={6} cols={5} />
          ) : levels.isError ? (
            <ErrorState message={errorMessage(levels.error)} onRetry={() => levels.refetch()} />
          ) : !levels.data?.data.length ? (
            <EmptyState title="No stock found" description="No products match in this warehouse." />
          ) : (
            <>
              <Table minWidth={640}>
                <thead>
                  <tr>
                    <Th>Product</Th>
                    <Th>Category</Th>
                    <Th align="right">Quantity</Th>
                    <Th align="right">Value</Th>
                    <Th>Updated</Th>
                  </tr>
                </thead>
                <tbody>
                  {levels.data.data.map((s) => (
                    <tr key={s.id} className="hover:bg-surface-2">
                      <Td>
                        <p className="font-medium text-ink">{s.product.name}</p>
                        <p className="font-mono text-xs text-ink-3">{s.product.sku}</p>
                      </Td>
                      <Td className="text-ink-2">{s.product.category}</Td>
                      <Td align="right">
                        <span className="font-semibold text-ink">{formatNumber(s.quantity)}</span>
                        {s.quantity <= s.product.reorderLevel && (
                          <Badge tone={s.quantity === 0 ? 'critical' : 'warning'} className="ml-2">
                            {s.quantity === 0 ? 'Empty' : 'Low'}
                          </Badge>
                        )}
                      </Td>
                      <Td align="right" className="text-ink-2">
                        {formatCurrency(s.value)}
                      </Td>
                      <Td className="text-xs text-ink-3">{formatDateTime(s.updatedAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Pagination meta={levels.data.pagination} onPageChange={setPage} itemLabel="products" />
            </>
          )}
        </Card>

        <Card title="Recent movements" bodyClassName="p-0">
          {w.recentMovements.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink-3">No movements yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {w.recentMovements.map((m) => {
                const inbound = m.toWarehouse?.id === w.id;
                return (
                  <li key={m.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <MovementBadge type={m.type} />
                      <span className="text-sm font-semibold text-ink tabular">
                        {inbound ? '+' : '−'}
                        {formatNumber(m.quantity)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-ink">{m.product.name}</p>
                    <p className="text-xs text-ink-3">
                      {m.type === 'TRANSFER' && (inbound ? `from ${m.fromWarehouse?.code} · ` : `to ${m.toWarehouse?.code} · `)}
                      {m.performedBy.name} · {formatDateTime(m.createdAt)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-line px-5 py-3">
            <Link to={`/inventory/movements?warehouseId=${w.id}`} className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
              View full history →
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
