import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Eye, FilterX, Pencil, Plus, Power, PowerOff, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { qk, stockKeys, useCategories, useWarehouses } from '@/lib/queries';
import type { Paginated, Product, ProductDetail } from '@/lib/types';
import { formatCurrency, formatCurrencyWhole, formatNumber } from '@/lib/format';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { Button, IconButton } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { ActiveBadge, StockStatusBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, PageHeader, Pagination, SearchInput, Table, TableSkeleton, Td, Th } from '@/components/ui/Common';
import { ProductFormModal } from './ProductFormModal';
import { ProductDetailDrawer } from './ProductDetailDrawer';

const SORTS = [
  { value: 'name:asc', label: 'Name (A–Z)' },
  { value: 'name:desc', label: 'Name (Z–A)' },
  { value: 'sku:asc', label: 'SKU' },
  { value: 'totalStock:asc', label: 'Stock (low → high)' },
  { value: 'totalStock:desc', label: 'Stock (high → low)' },
  { value: 'stockValue:desc', label: 'Value (high → low)' },
  { value: 'unitPrice:desc', label: 'Price (high → low)' },
  { value: 'updatedAt:desc', label: 'Recently updated' },
];

export function ProductsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();

  const [search, setSearch] = useState(params.get('search') ?? '');
  const debouncedSearch = useDebounce(search, 300);
  const category = params.get('category') ?? '';
  const status = params.get('status') ?? 'all';
  const stockStatus = params.get('stockStatus') ?? 'all';
  const warehouseId = params.get('warehouseId') ?? '';
  const sort = params.get('sort') ?? 'name:asc';
  const page = Number(params.get('page') ?? '1') || 1;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | ProductDetail | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const update = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '' || v === 'all') next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.delete('page');
    setParams(next, { replace: true });
  };

  // Keep URL in sync with the debounced search box (and pick up external ?search= changes from the top bar).
  useEffect(() => {
    if ((params.get('search') ?? '') !== debouncedSearch) update({ search: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);
  const urlSearch = params.get('search') ?? '';
  useEffect(() => {
    if (urlSearch !== debouncedSearch) setSearch(urlSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSearch]);

  const [sortBy, sortOrder] = sort.split(':') as [string, string];
  const query = useMemo(
    () => ({ search: urlSearch, category, status, stockStatus, warehouseId, sortBy, sortOrder, page, pageSize: 15 }),
    [urlSearch, category, status, stockStatus, warehouseId, sortBy, sortOrder, page],
  );

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: [...qk.products, 'list', query],
    queryFn: () => api.get<Paginated<Product>>('/products', query),
    placeholderData: keepPreviousData,
  });
  const { data: categories } = useCategories();
  const { data: warehouses } = useWarehouses();

  const invalidate = () => {
    stockKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    qc.invalidateQueries({ queryKey: qk.categories });
  };

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch<{ data: ProductDetail }>(`/products/${id}/status`, { isActive }),
    onSuccess: (res) => {
      invalidate();
      toast.success(res.data.isActive ? 'Product activated' : 'Product deactivated', `${res.data.sku} · ${res.data.name}`);
    },
    onError: (err) => toast.error('Status change failed', errorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (p: Product) => api.delete(`/products/${p.id}`),
    onSuccess: (_r, p) => {
      invalidate();
      toast.success('Product deleted', `${p.sku} was permanently removed.`);
    },
    onError: (err) => toast.error('Cannot delete product', errorMessage(err)),
  });

  const toggleStatus = async (p: Product) => {
    const deactivate = p.isActive;
    const ok = await confirm({
      title: deactivate ? 'Deactivate product?' : 'Activate product?',
      message: deactivate ? (
        <>
          <strong className="text-ink">{p.name}</strong> ({p.sku}) will be hidden from stock operations and excluded from KPIs. History is kept and you can re-activate it at any time.
        </>
      ) : (
        <>
          <strong className="text-ink">{p.name}</strong> ({p.sku}) will be available for stock operations again.
        </>
      ),
      confirmLabel: deactivate ? 'Deactivate' : 'Activate',
      tone: deactivate ? 'danger' : 'primary',
    });
    if (ok) statusMutation.mutate({ id: p.id, isActive: !p.isActive });
  };

  const remove = async (p: Product) => {
    const ok = await confirm({
      title: 'Delete product permanently?',
      message: (
        <>
          This permanently deletes <strong className="text-ink">{p.name}</strong> ({p.sku}). Products with stock or movement history cannot be deleted — deactivate them instead. This action cannot be undone.
        </>
      ),
      confirmLabel: 'Delete permanently',
    });
    if (ok) deleteMutation.mutate(p);
  };

  const hasFilters = !!(urlSearch || category || status !== 'all' || stockStatus !== 'all' || warehouseId);
  const activeWarehouses = (warehouses ?? []).filter((w) => w.isActive);

  return (
    <div>
      <PageHeader
        title="Products"
        description="Manage the product catalogue, pricing and reorder levels."
        actions={
          can('products:create') && (
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Add product
            </Button>
          )
        }
      />

      <div className="card">
        <div className="flex flex-col gap-3 border-b border-line p-4 2xl:flex-row 2xl:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name, SKU, category…" className="2xl:w-72 2xl:shrink-0" />
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Select aria-label="Category" value={category} onChange={(e) => update({ category: e.target.value })}>
              <option value="">All categories</option>
              {categories?.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.productCount})
                </option>
              ))}
            </Select>
            <Select aria-label="Stock status" value={stockStatus} onChange={(e) => update({ stockStatus: e.target.value })}>
              <option value="all">Any stock level</option>
              <option value="in_stock">In stock</option>
              <option value="low_stock">Low stock (≤ reorder)</option>
              <option value="out_of_stock">Out of stock</option>
            </Select>
            <Select aria-label="Status" value={status} onChange={(e) => update({ status: e.target.value })}>
              <option value="all">Active & inactive</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </Select>
            <Select aria-label="Warehouse" value={warehouseId} onChange={(e) => update({ warehouseId: e.target.value })}>
              <option value="">All warehouses</option>
              {activeWarehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  Stocked at {w.code}
                </option>
              ))}
            </Select>
            <Select aria-label="Sort" value={sort} onChange={(e) => update({ sort: e.target.value === 'name:asc' ? null : e.target.value })}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
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
          <TableSkeleton rows={8} cols={7} />
        ) : isError ? (
          <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No products match your filters' : 'No products yet'}
            description={hasFilters ? 'Try a different search term or clear the filters.' : 'Add your first product to start tracking inventory.'}
            action={
              !hasFilters && can('products:create') ? (
                <Button icon={<Plus className="size-4" />} onClick={() => setFormOpen(true)}>
                  Add product
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className={clsx('transition-opacity', isFetching && 'opacity-70')}>
            <Table minWidth={1060}>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th>Category</Th>
                  <Th align="right">Unit price</Th>
                  <Th>By warehouse</Th>
                  <Th align="right">On hand</Th>
                  <Th align="right">Value</Th>
                  <Th>Stock</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((p) => (
                  <tr key={p.id} className={clsx('transition-colors hover:bg-surface-2', !p.isActive && 'opacity-60')}>
                    <Td>
                      <button type="button" onClick={() => setDetailId(p.id)} className="text-left">
                        <span className="block max-w-[240px] truncate font-medium text-ink hover:text-brand-600 dark:hover:text-brand-400">{p.name}</span>
                        <span className="flex items-center gap-2 font-mono text-xs text-ink-3">
                          {p.sku}
                          {!p.isActive && <ActiveBadge active={false} />}
                        </span>
                      </button>
                    </Td>
                    <Td className="whitespace-nowrap text-ink-2">{p.category}</Td>
                    <Td align="right" className="whitespace-nowrap text-ink-2">
                      {formatCurrency(p.unitPrice)}
                      <span className="text-ink-3"> /{p.unit}</span>
                    </Td>
                    <Td>
                      <div className="flex flex-nowrap gap-1">
                        {p.stockByWarehouse.length === 0 ? (
                          <span className="text-xs text-ink-3">—</span>
                        ) : (
                          p.stockByWarehouse.map((w) => (
                            <span key={w.warehouseId} title={w.warehouseName} className="inline-flex items-center gap-1 rounded-md bg-surface-3 px-1.5 py-0.5 text-[11px] text-ink-2 tabular">
                              <span className="font-medium">{w.warehouseCode.split('-')[0]}</span>
                              {formatNumber(w.quantity)}
                            </span>
                          ))
                        )}
                      </div>
                    </Td>
                    <Td align="right" className="font-semibold whitespace-nowrap text-ink">
                      {formatNumber(p.totalStock)}
                      <span className="block text-[11px] font-normal text-ink-3">reorder {formatNumber(p.reorderLevel)}</span>
                    </Td>
                    <Td align="right" className="whitespace-nowrap text-ink-2">
                      {formatCurrencyWhole(p.stockValue)}
                    </Td>
                    <Td>
                      <StockStatusBadge status={p.stockStatus} />
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-0.5">
                        <IconButton label="View details" onClick={() => setDetailId(p.id)}>
                          <Eye className="size-4" />
                        </IconButton>
                        {can('products:update') && (
                          <IconButton
                            label="Edit product"
                            onClick={() => {
                              setEditing(p);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil className="size-4" />
                          </IconButton>
                        )}
                        {can('products:deactivate') && (
                          <IconButton label={p.isActive ? 'Deactivate product' : 'Activate product'} onClick={() => toggleStatus(p)} disabled={statusMutation.isPending}>
                            {p.isActive ? <PowerOff className="size-4" /> : <Power className="size-4" />}
                          </IconButton>
                        )}
                        {can('products:delete') && (
                          <IconButton label="Delete product" onClick={() => remove(p)} disabled={deleteMutation.isPending} className="hover:text-[var(--status-critical)]">
                            <Trash2 className="size-4" />
                          </IconButton>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination meta={data.pagination} onPageChange={(p) => update({ page: String(p) }, false)} itemLabel="products" />
          </div>
        )}
      </div>

      <ProductFormModal open={formOpen} onClose={() => setFormOpen(false)} product={editing} />
      <ProductDetailDrawer
        productId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(p) => {
          setDetailId(null);
          setEditing(p);
          setFormOpen(true);
        }}
      />
    </div>
  );
}
