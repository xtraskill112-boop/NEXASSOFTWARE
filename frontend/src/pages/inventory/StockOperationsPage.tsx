import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowDown, ArrowLeftRight, ArrowRight, CheckCircle2, PackageMinus, PackagePlus, TriangleAlert } from 'lucide-react';
import { api, ApiError, errorMessage } from '@/lib/api';
import { qk, stockKeys, useWarehouses } from '@/lib/queries';
import type { Movement, Paginated, Product, ProductDetail, StockOperationResult } from '@/lib/types';
import { formatDateTime, formatNumber, timeAgo } from '@/lib/format';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Card, PageHeader, Tabs } from '@/components/ui/Common';
import { MovementBadge, StockStatusBadge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Spinner';
import { ProductPicker } from '@/components/ProductPicker';

type Tab = 'in' | 'out' | 'transfer';

interface Errors {
  product?: string;
  warehouseId?: string;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  quantity?: string;
  reference?: string;
  notes?: string;
}

const tabMeta: Record<Tab, { title: string; verb: string; endpoint: string; description: string }> = {
  in: { title: 'Stock In', verb: 'Receive stock', endpoint: '/inventory/stock-in', description: 'Record goods received from suppliers or returns into a warehouse.' },
  out: { title: 'Stock Out', verb: 'Dispatch stock', endpoint: '/inventory/stock-out', description: 'Record goods dispatched to customers, damaged or written off.' },
  transfer: { title: 'Transfer', verb: 'Transfer stock', endpoint: '/inventory/transfer', description: 'Move stock between warehouses in a single atomic operation.' },
};

export function StockOperationsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();

  const allowed: Record<Tab, boolean> = { in: can('inventory:stock-in'), out: can('inventory:stock-out'), transfer: can('inventory:transfer') };
  const requested = (params.get('tab') as Tab | null) ?? 'in';
  const tab: Tab = allowed[requested] ? requested : (['in', 'out', 'transfer'] as Tab[]).find((t) => allowed[t]) ?? 'in';

  const [product, setProduct] = useState<{ id: string; sku: string; name: string } | null>(null);
  const [warehouseId, setWarehouseId] = useState('');
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [lastResult, setLastResult] = useState<StockOperationResult | null>(null);

  const { data: warehouses } = useWarehouses(false);

  // Preselect product from ?productId=
  const presetId = params.get('productId');
  const preset = useQuery({
    queryKey: qk.product(presetId ?? ''),
    queryFn: () => api.get<{ data: ProductDetail }>(`/products/${presetId}`).then((r) => r.data),
    enabled: !!presetId && !product,
  });
  useEffect(() => {
    if (preset.data && !product) setProduct({ id: preset.data.id, sku: preset.data.sku, name: preset.data.name });
  }, [preset.data, product]);

  // Live stock for the selected product
  const detail = useQuery({
    queryKey: qk.product(product?.id ?? ''),
    queryFn: () => api.get<{ data: ProductDetail }>(`/products/${product!.id}`).then((r) => r.data),
    enabled: !!product,
  });

  const recent = useQuery({
    queryKey: [...qk.movements, 'recent'],
    queryFn: () => api.get<Paginated<Movement>>('/inventory/movements', { pageSize: 8 }),
  });

  const qtyAt = useMemo(() => {
    const map = new Map<string, number>();
    detail.data?.stockByWarehouse.forEach((w) => map.set(w.warehouseId, w.quantity));
    return (id: string) => map.get(id) ?? 0;
  }, [detail.data]);

  // Default warehouse choices
  useEffect(() => {
    if (!warehouses?.length) return;
    if (!warehouseId) setWarehouseId(warehouses[0]!.id);
    if (!fromWarehouseId) setFromWarehouseId(warehouses[0]!.id);
    if (!toWarehouseId && warehouses[1]) setToWarehouseId(warehouses[1].id);
  }, [warehouses, warehouseId, fromWarehouseId, toWarehouseId]);

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
    setErrors({});
  };

  const qty = Number(quantity);
  const sourceId = tab === 'transfer' ? fromWarehouseId : warehouseId;
  const available = product && sourceId ? qtyAt(sourceId) : 0;
  const exceeds = tab !== 'in' && !!product && qty > 0 && qty > available;

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<{ data: StockOperationResult }>(tabMeta[tab].endpoint, body),
    onSuccess: (res) => {
      setLastResult(res.data);
      stockKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      qc.invalidateQueries({ queryKey: qk.product(res.data.movement.product.id) });
      const m = res.data.movement;
      toast.success(
        `${tabMeta[tab].title} recorded`,
        `${formatNumber(m.quantity)} × ${m.product.sku} ${m.type === 'TRANSFER' ? `${m.fromWarehouse?.code} → ${m.toWarehouse?.code}` : m.type === 'STOCK_IN' ? `into ${m.toWarehouse?.code}` : `from ${m.fromWarehouse?.code}`}`,
      );
      setQuantity('');
      setReference('');
      setNotes('');
      setErrors({});
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        if (err.code === 'INSUFFICIENT_STOCK') {
          const d = err.details as { available?: number } | undefined;
          setErrors({ quantity: `Only ${formatNumber(d?.available ?? 0)} units available` });
          qc.invalidateQueries({ queryKey: qk.product(product?.id ?? '') });
          toast.error('Insufficient stock (409 Conflict)', err.message);
          return;
        }
        setErrors(err.fieldErrors as Errors);
      }
      toast.error('Operation failed', errorMessage(err));
    },
  });

  const validate = (): Errors => {
    const e: Errors = {};
    if (!product) e.product = 'Select a product';
    if (!quantity || !Number.isInteger(qty) || qty < 1) e.quantity = 'Enter a whole number of at least 1';
    else if (qty > 1_000_000) e.quantity = 'Maximum 1,000,000 per operation';
    if (tab === 'transfer') {
      if (!fromWarehouseId) e.fromWarehouseId = 'Select the source warehouse';
      if (!toWarehouseId) e.toWarehouseId = 'Select the destination warehouse';
      if (fromWarehouseId && fromWarehouseId === toWarehouseId) e.toWarehouseId = 'Destination must differ from source';
    } else if (!warehouseId) e.warehouseId = 'Select a warehouse';
    if (!e.quantity && exceeds) e.quantity = `Only ${formatNumber(available)} units available`;
    if (reference.length > 80) e.reference = 'Max 80 characters';
    if (notes.length > 500) e.notes = 'Max 500 characters';
    return e;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    const wName = (id: string) => warehouses?.find((w) => w.id === id)?.name ?? '';
    if (tab !== 'in') {
      const ok = await confirm({
        title: tab === 'out' ? 'Confirm stock out' : 'Confirm transfer',
        message:
          tab === 'out' ? (
            <>
              Dispatch <strong className="text-ink">{formatNumber(qty)} units</strong> of <strong className="text-ink">{product!.name}</strong> from {wName(warehouseId)}? Remaining balance will be{' '}
              <strong className="text-ink">{formatNumber(available - qty)}</strong>.
            </>
          ) : (
            <>
              Move <strong className="text-ink">{formatNumber(qty)} units</strong> of <strong className="text-ink">{product!.name}</strong> from {wName(fromWarehouseId)} to {wName(toWarehouseId)}?
            </>
          ),
        confirmLabel: tab === 'out' ? 'Dispatch stock' : 'Transfer stock',
        tone: 'primary',
      });
      if (!ok) return;
    }

    const common = { productId: product!.id, quantity: qty, reference: reference || null, notes: notes || null };
    mutation.mutate(tab === 'transfer' ? { ...common, fromWarehouseId, toWarehouseId } : { ...common, warehouseId });
  };

  const optionLabel = (id: string, code: string, name: string) => (product && detail.data ? `${code} · ${name} — ${formatNumber(qtyAt(id))} on hand` : `${code} · ${name}`);

  const preview =
    product && detail.data && qty > 0 && Number.isInteger(qty)
      ? tab === 'transfer'
        ? [
            { id: fromWarehouseId, before: qtyAt(fromWarehouseId), after: qtyAt(fromWarehouseId) - qty },
            { id: toWarehouseId, before: qtyAt(toWarehouseId), after: qtyAt(toWarehouseId) + qty },
          ]
        : [{ id: warehouseId, before: qtyAt(warehouseId), after: qtyAt(warehouseId) + (tab === 'in' ? qty : -qty) }]
      : null;

  return (
    <div>
      <PageHeader
        title="Stock Operations"
        description="Every operation is validated, applied in a database transaction and written to the audit log."
        actions={
          <ButtonLink to="/inventory/movements" variant="secondary">
            View movement history
          </ButtonLink>
        }
      />

      <div className="mb-5">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'in', label: 'Stock In', icon: <PackagePlus className="size-4" />, disabled: !allowed.in },
            { value: 'out', label: 'Stock Out', icon: <PackageMinus className="size-4" />, disabled: !allowed.out },
            { value: 'transfer', label: 'Transfer', icon: <ArrowLeftRight className="size-4" />, disabled: !allowed.transfer },
          ]}
        />
        {!allowed.transfer && <p className="mt-2 text-xs text-ink-3">Transfers between warehouses require the Manager or Admin role.</p>}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3" title={tabMeta[tab].title} subtitle={tabMeta[tab].description}>
          <form onSubmit={submit} className="space-y-5" noValidate>
            <Field label="Product" htmlFor="product-picker" required error={errors.product}>
              <ProductPicker
                id="product-picker"
                value={product}
                invalid={!!errors.product}
                onChange={(p: Product | null) => {
                  setProduct(p ? { id: p.id, sku: p.sku, name: p.name } : null);
                  setErrors((e) => ({ ...e, product: undefined, quantity: undefined }));
                  setLastResult(null);
                }}
              />
            </Field>

            {product && (
              <div className="rounded-xl border border-line bg-surface-2 p-4">
                {detail.isLoading || !detail.data ? (
                  <Skeleton className="h-16" />
                ) : (
                  <>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-ink-2">
                        Total on hand <span className="font-semibold text-ink">{formatNumber(detail.data.totalStock)}</span> {detail.data.unit} · reorder at {formatNumber(detail.data.reorderLevel)}
                      </p>
                      <StockStatusBadge status={detail.data.stockStatus} />
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {detail.data.stockByWarehouse.map((w) => (
                        <div
                          key={w.warehouseId}
                          className={clsx(
                            'rounded-lg border bg-surface px-3 py-2',
                            (tab === 'transfer' ? [fromWarehouseId, toWarehouseId].includes(w.warehouseId) : w.warehouseId === warehouseId)
                              ? 'border-brand-400 ring-2 ring-brand-500/15'
                              : 'border-line',
                          )}
                        >
                          <p className="text-[11px] font-medium text-ink-3">{w.warehouseCode}</p>
                          <p className="text-lg font-semibold text-ink tabular">{formatNumber(w.quantity)}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === 'transfer' ? (
              <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[1fr_auto_1fr]">
                <Field label="From warehouse" htmlFor="from-wh" required error={errors.fromWarehouseId}>
                  <Select id="from-wh" value={fromWarehouseId} invalid={!!errors.fromWarehouseId} onChange={(e) => setFromWarehouseId(e.target.value)}>
                    {warehouses?.map((w) => (
                      <option key={w.id} value={w.id}>
                        {optionLabel(w.id, w.code, w.name)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <button
                  type="button"
                  onClick={() => {
                    setFromWarehouseId(toWarehouseId);
                    setToWarehouseId(fromWarehouseId);
                  }}
                  className="mx-auto mt-0 flex size-10 items-center justify-center rounded-full border border-line-strong text-ink-2 hover:bg-surface-3 sm:mt-7"
                  aria-label="Swap source and destination"
                  title="Swap"
                >
                  <ArrowRight className="hidden size-4 sm:block" />
                  <ArrowDown className="size-4 sm:hidden" />
                </button>
                <Field label="To warehouse" htmlFor="to-wh" required error={errors.toWarehouseId}>
                  <Select id="to-wh" value={toWarehouseId} invalid={!!errors.toWarehouseId} onChange={(e) => setToWarehouseId(e.target.value)}>
                    {warehouses?.map((w) => (
                      <option key={w.id} value={w.id} disabled={w.id === fromWarehouseId}>
                        {optionLabel(w.id, w.code, w.name)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : (
              <Field label="Warehouse" htmlFor="wh" required error={errors.warehouseId}>
                <Select id="wh" value={warehouseId} invalid={!!errors.warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                  {warehouses?.map((w) => (
                    <option key={w.id} value={w.id}>
                      {optionLabel(w.id, w.code, w.name)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Quantity"
                htmlFor="qty"
                required
                error={errors.quantity}
                hint={tab !== 'in' && product ? `${formatNumber(available)} available in source warehouse` : 'Whole units'}
              >
                <div className="flex gap-2">
                  <Input
                    id="qty"
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={quantity}
                    invalid={!!errors.quantity || exceeds}
                    onChange={(e) => {
                      setQuantity(e.target.value);
                      setErrors((x) => ({ ...x, quantity: undefined }));
                    }}
                    placeholder="0"
                  />
                  {tab !== 'in' && product && available > 0 && (
                    <Button variant="secondary" className="h-10" onClick={() => setQuantity(String(available))}>
                      Max
                    </Button>
                  )}
                </div>
              </Field>
              <Field label="Reference" htmlFor="ref" error={errors.reference} hint={tab === 'in' ? 'e.g. PO / GRN number' : tab === 'out' ? 'e.g. invoice / challan number' : 'e.g. transfer note number'}>
                <Input id="ref" value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} placeholder={tab === 'in' ? 'PO-4521' : tab === 'out' ? 'INV-10233' : 'TRF-512'} />
              </Field>
            </div>

            <Field label="Notes" htmlFor="notes" error={errors.notes}>
              <Textarea id="notes" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional details: supplier, customer, reason…" />
            </Field>

            {exceeds && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200" role="alert">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                Requested quantity exceeds available stock ({formatNumber(available)}). Stock can never go negative — the server will reject this with 409 Conflict.
              </div>
            )}

            {preview && !exceeds && (
              <div className="rounded-lg border border-line px-4 py-3">
                <p className="mb-2 text-xs font-semibold tracking-wider text-ink-3 uppercase">Balance after this operation</p>
                <ul className="space-y-1.5">
                  {preview.map((p) => {
                    const w = warehouses?.find((x) => x.id === p.id);
                    return (
                      <li key={p.id} className="flex items-center justify-between text-sm">
                        <span className="text-ink-2">{w ? `${w.code} · ${w.name}` : '—'}</span>
                        <span className="tabular">
                          <span className="text-ink-3">{formatNumber(p.before)}</span>
                          <ArrowRight className="mx-1.5 inline size-3.5 text-ink-3" />
                          <span className="font-semibold text-ink">{formatNumber(p.after)}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" size="lg" loading={mutation.isPending} disabled={!allowed[tab]} icon={tab === 'in' ? <PackagePlus className="size-4" /> : tab === 'out' ? <PackageMinus className="size-4" /> : <ArrowLeftRight className="size-4" />}>
                {tabMeta[tab].verb}
              </Button>
            </div>
          </form>
        </Card>

        <div className="space-y-6 xl:col-span-2">
          {lastResult && (
            <div className="card border-emerald-200 p-5 dark:border-emerald-500/30">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--status-good)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">Operation recorded</p>
                  <p className="mt-0.5 text-sm text-ink-2">
                    {formatNumber(lastResult.movement.quantity)} × {lastResult.movement.product.name}
                  </p>
                  <ul className="mt-3 space-y-1 text-sm">
                    {lastResult.stockLevels.map((s) => (
                      <li key={s.warehouseId} className="flex justify-between">
                        <span className="text-ink-3">New balance at {s.warehouseCode}</span>
                        <span className="font-semibold text-ink tabular">{formatNumber(s.quantity)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 font-mono text-[11px] text-ink-3">Movement ID {lastResult.movement.id}</p>
                </div>
              </div>
            </div>
          )}

          <Card title="Recent operations" subtitle="Latest stock movements" bodyClassName="p-0">
            {recent.isLoading ? (
              <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : !recent.data?.data.length ? (
              <p className="px-5 py-10 text-center text-sm text-ink-3">No movements yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {recent.data.data.map((m) => (
                  <li key={m.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <MovementBadge type={m.type} />
                      <span className="text-xs text-ink-3" title={formatDateTime(m.createdAt)}>
                        {timeAgo(m.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-ink">
                      <span className="font-semibold tabular">{formatNumber(m.quantity)}</span> × {m.product.name}
                    </p>
                    <p className="text-xs text-ink-3">
                      {m.type === 'TRANSFER' ? `${m.fromWarehouse?.code} → ${m.toWarehouse?.code}` : m.type === 'STOCK_IN' ? `into ${m.toWarehouse?.code}` : `from ${m.fromWarehouse?.code}`} · {m.performedBy.name}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
