import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowRight, FilterX } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { qk, useWarehouses } from '@/lib/queries';
import type { Movement, Paginated } from '@/lib/types';
import { formatDateTime, formatNumber, roleLabel } from '@/lib/format';
import { useDebounce } from '@/hooks/useDebounce';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { MovementBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, PageHeader, Pagination, SearchInput, Table, TableSkeleton, Td, Th } from '@/components/ui/Common';

export function MovementsPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const debounced = useDebounce(search);
  const type = params.get('type') ?? '';
  const warehouseId = params.get('warehouseId') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const page = Number(params.get('page') ?? '1') || 1;
  const { data: warehouses } = useWarehouses();

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  const query = {
    type,
    warehouseId,
    search: debounced,
    from: from ? new Date(`${from}T00:00:00`).toISOString() : '',
    to: to ? new Date(`${to}T23:59:59.999`).toISOString() : '',
    page: debounced !== (params.get('search') ?? '') ? 1 : page,
    pageSize: 20,
  };

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: [...qk.movements, 'list', query],
    queryFn: () => api.get<Paginated<Movement>>('/inventory/movements', query),
    placeholderData: keepPreviousData,
  });

  const hasFilters = !!(type || warehouseId || debounced || from || to);

  return (
    <div>
      <PageHeader title="Movement History" description="Complete ledger of every stock in, stock out and transfer." />
      <div className="card">
        <div className="flex flex-col gap-3 border-b border-line p-4 xl:flex-row xl:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Product, SKU, reference, notes…" className="xl:max-w-xs xl:flex-1" />
          <div className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-4">
            <Select aria-label="Movement type" value={type} onChange={(e) => update({ type: e.target.value })}>
              <option value="">All types</option>
              <option value="STOCK_IN">Stock In</option>
              <option value="STOCK_OUT">Stock Out</option>
              <option value="TRANSFER">Transfer</option>
            </Select>
            <Select aria-label="Warehouse" value={warehouseId} onChange={(e) => update({ warehouseId: e.target.value })}>
              <option value="">All warehouses</option>
              {warehouses?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} · {w.name}
                </option>
              ))}
            </Select>
            <Input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => update({ from: e.target.value })} />
            <Input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => update({ to: e.target.value })} />
          </div>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              icon={<FilterX className="size-4" />}
              onClick={() => {
                setSearch('');
                setParams(new URLSearchParams(), { replace: true });
              }}
            >
              Clear
            </Button>
          )}
        </div>

        {isLoading ? (
          <TableSkeleton rows={10} cols={7} />
        ) : isError ? (
          <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
        ) : !data?.data.length ? (
          <EmptyState title="No movements found" description={hasFilters ? 'Try adjusting the filters.' : 'Stock operations will appear here.'} />
        ) : (
          <div className={clsx('transition-opacity', isFetching && 'opacity-70')}>
            <Table minWidth={1000}>
              <thead>
                <tr>
                  <Th>Date & time</Th>
                  <Th>Type</Th>
                  <Th>Product</Th>
                  <Th>Warehouse</Th>
                  <Th align="right">Quantity</Th>
                  <Th>Reference</Th>
                  <Th>Performed by</Th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((m) => (
                  <tr key={m.id} className="hover:bg-surface-2">
                    <Td className="text-xs whitespace-nowrap text-ink-2">{formatDateTime(m.createdAt)}</Td>
                    <Td>
                      <MovementBadge type={m.type} />
                    </Td>
                    <Td>
                      <p className="max-w-[240px] truncate font-medium text-ink">{m.product.name}</p>
                      <p className="font-mono text-xs text-ink-3">{m.product.sku}</p>
                    </Td>
                    <Td className="text-sm whitespace-nowrap text-ink-2">
                      {m.type === 'TRANSFER' ? (
                        <span className="inline-flex items-center gap-1">
                          {m.fromWarehouse?.code} <ArrowRight className="size-3.5 text-ink-3" /> {m.toWarehouse?.code}
                        </span>
                      ) : (
                        (m.toWarehouse ?? m.fromWarehouse)?.code
                      )}
                    </Td>
                    <Td align="right" className={clsx('font-semibold', m.type === 'STOCK_IN' ? 'text-emerald-700 dark:text-emerald-400' : m.type === 'STOCK_OUT' ? 'text-red-700 dark:text-red-400' : 'text-ink')}>
                      {m.type === 'STOCK_IN' ? '+' : m.type === 'STOCK_OUT' ? '−' : ''}
                      {formatNumber(m.quantity)}
                      <span className="ml-1 text-xs font-normal text-ink-3">{m.product.unit}</span>
                    </Td>
                    <Td>
                      <p className="font-mono text-xs text-ink-2">{m.reference ?? '—'}</p>
                      {m.notes && <p className="max-w-[220px] truncate text-xs text-ink-3" title={m.notes}>{m.notes}</p>}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <p className="text-sm text-ink">{m.performedBy.name}</p>
                      <p className="text-xs text-ink-3">{roleLabel[m.performedBy.role]}</p>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination meta={data.pagination} onPageChange={(p) => update({ page: String(p) })} itemLabel="movements" />
          </div>
        )}
      </div>
    </div>
  );
}
