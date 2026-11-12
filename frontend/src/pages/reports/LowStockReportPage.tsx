import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Download, IndianRupee, PackagePlus, TriangleAlert, XCircle } from 'lucide-react';
import { api, apiDownload, errorMessage } from '@/lib/api';
import { qk, useCategories, useWarehouses } from '@/lib/queries';
import type { LowStockReport } from '@/lib/types';
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/format';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { StockStatusBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, PageHeader, SearchInput, Table, TableSkeleton, Td, Th } from '@/components/ui/Common';

export function LowStockReportPage() {
  const { can } = useAuth();
  const toast = useToast();
  const [warehouseId, setWarehouseId] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<'all' | 'low' | 'out'>('all');
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const debounced = useDebounce(search);
  const { data: warehouses } = useWarehouses(false);
  const { data: categories } = useCategories();

  const query = { warehouseId, category, status, search: debounced };
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: [...qk.lowStock, query],
    queryFn: () => api.get<LowStockReport>('/reports/low-stock', query),
    placeholderData: keepPreviousData,
  });

  const exportCsv = async () => {
    setExporting(true);
    try {
      await apiDownload('/reports/low-stock', { ...query, format: 'csv' }, 'low-stock-report.csv');
      toast.success('Report exported', 'The CSV file has been downloaded.');
    } catch (err) {
      toast.error('Export failed', errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const summary = data?.summary;

  return (
    <div>
      <PageHeader
        title="Low-Stock Report"
        description={
          data?.scope.type === 'WAREHOUSE'
            ? `Products at or below reorder level in ${data.scope.warehouse?.name}`
            : 'Active products whose total stock across all warehouses is at or below the reorder level.'
        }
        actions={
          <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv} loading={exporting} disabled={!data?.data.length}>
            Export CSV
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card flex items-center gap-4 p-5">
          <span className="flex size-10 items-center justify-center rounded-lg bg-red-50 text-[var(--status-critical)] dark:bg-red-500/10">
            <XCircle className="size-5" />
          </span>
          <div>
            <p className="text-sm text-ink-2">Out of stock</p>
            <p className="text-2xl font-semibold text-ink">{summary ? formatNumber(summary.outOfStock) : '–'}</p>
          </div>
        </div>
        <div className="card flex items-center gap-4 p-5">
          <span className="flex size-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
            <TriangleAlert className="size-5" />
          </span>
          <div>
            <p className="text-sm text-ink-2">Low stock</p>
            <p className="text-2xl font-semibold text-ink">{summary ? formatNumber(summary.lowStock) : '–'}</p>
          </div>
        </div>
        <div className="card flex items-center gap-4 p-5">
          <span className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
            <IndianRupee className="size-5" />
          </span>
          <div>
            <p className="text-sm text-ink-2">Estimated reorder cost</p>
            <p className="text-2xl font-semibold text-ink">{summary ? formatCurrency(summary.estimatedReorderCost) : '–'}</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Search product or SKU…" className="lg:max-w-xs lg:flex-1" />
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
            <Select aria-label="Scope" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">All warehouses (total stock)</option>
              {warehouses?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} · {w.name}
                </option>
              ))}
            </Select>
            <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {categories?.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select aria-label="Severity" value={status} onChange={(e) => setStatus(e.target.value as 'all' | 'low' | 'out')}>
              <option value="all">Low & out of stock</option>
              <option value="out">Out of stock only</option>
              <option value="low">Low stock only</option>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} cols={8} />
        ) : isError ? (
          <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
        ) : !data?.data.length ? (
          <EmptyState title="Nothing to reorder" description="No products are at or below their reorder level for this selection." />
        ) : (
          <div className={clsx('transition-opacity', isFetching && 'opacity-70')}>
            <Table minWidth={1180}>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th>Status</Th>
                  <Th align="right">On hand</Th>
                  <Th align="right">Reorder level</Th>
                  <Th align="right">Shortfall</Th>
                  <Th align="right">Suggested order</Th>
                  <Th align="right">Est. cost</Th>
                  <Th>By warehouse</Th>
                  {can('inventory:stock-in') && <Th align="right">Action</Th>}
                </tr>
              </thead>
              <tbody>
                {data.data.map((i) => {
                  const pct = Math.min(100, (i.quantity / Math.max(1, i.reorderLevel)) * 100);
                  return (
                    <tr key={i.productId} className="hover:bg-surface-2">
                      <Td>
                        <p className="max-w-[240px] truncate font-medium text-ink">{i.name}</p>
                        <p className="text-xs whitespace-nowrap text-ink-3">
                          <span className="font-mono">{i.sku}</span> · {i.category}
                        </p>
                      </Td>
                      <Td>
                        <StockStatusBadge status={i.status} />
                      </Td>
                      <Td align="right">
                        <span className="font-semibold text-ink">{formatNumber(i.quantity)}</span>
                        <div className="mt-1 ml-auto h-1 w-20 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                          <div className={clsx('h-full rounded-full', i.status === 'OUT_OF_STOCK' ? 'bg-[var(--status-critical)]' : 'bg-[var(--status-warning)]')} style={{ width: `${Math.max(pct, 3)}%` }} />
                        </div>
                      </Td>
                      <Td align="right" className="text-ink-2">
                        {formatNumber(i.reorderLevel)}
                      </Td>
                      <Td align="right" className="font-medium text-red-700 dark:text-red-400">
                        {formatNumber(i.shortfall)}
                      </Td>
                      <Td align="right" className="text-ink">
                        {formatNumber(i.suggestedReorderQty)} <span className="text-xs text-ink-3">{i.unit}</span>
                      </Td>
                      <Td align="right" className="text-ink-2">
                        {formatCurrency(i.estimatedReorderCost)}
                      </Td>
                      <Td>
                        <div className="flex flex-nowrap gap-1">
                          {i.stockByWarehouse.length === 0 ? (
                            <span className="text-xs whitespace-nowrap text-ink-3">No stock anywhere</span>
                          ) : (
                            i.stockByWarehouse.map((w) => (
                              <span key={w.warehouseId} className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[11px] text-ink-2 tabular" title={w.warehouseName}>
                                <span className="font-medium">{w.warehouseCode.split('-')[0]}</span> {formatNumber(w.quantity)}
                              </span>
                            ))
                          )}
                        </div>
                      </Td>
                      {can('inventory:stock-in') && (
                        <Td align="right">
                          <Link
                            to={`/inventory/operations?tab=in&productId=${i.productId}`}
                            aria-label="Receive stock"
                            title="Receive stock"
                            className="inline-flex size-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
                          >
                            <PackagePlus className="size-4" />
                          </Link>
                        </Td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <p className="border-t border-line px-5 py-3 text-xs text-ink-3">
              Suggested order tops stock up to twice the reorder level. Generated {formatDateTime(data.generatedAt)}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
