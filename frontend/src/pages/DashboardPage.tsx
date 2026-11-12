import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Activity,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  IndianRupee,
  Package,
  PackagePlus,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
  UserCog,
  Warehouse as WarehouseIcon,
  XCircle,
} from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { qk } from '@/lib/queries';
import type { DashboardSummary } from '@/lib/types';
import { formatAxisCurrency, formatAxisNumber, formatCompact, formatCurrency, formatCurrencyCompact, formatNumber, timeAgo } from '@/lib/format';
import { useAuth } from '@/context/AuthContext';
import { Card, ErrorState, PageHeader } from '@/components/ui/Common';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Spinner';
import { StockStatusBadge } from '@/components/ui/Badge';
import { MovementTrendChart } from '@/components/charts/MovementTrendChart';
import { HorizontalBarChart } from '@/components/charts/HorizontalBarChart';

function StatTile({ label, value, sub, icon, tone = 'brand', to }: { label: string; value: string; sub: ReactNode; icon: ReactNode; tone?: 'brand' | 'warning' | 'good' | 'info'; to?: string }) {
  const toneClass = {
    brand: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
    warning: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
    good: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
    info: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
  }[tone];
  const body = (
    <div className="card group h-full p-5 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-2">{label}</p>
        <span className={clsx('flex size-9 items-center justify-center rounded-lg', toneClass)}>{icon}</span>
      </div>
      <p className="mt-3 text-[28px] leading-none font-semibold tracking-tight text-ink">{value}</p>
      <div className="mt-2.5 text-xs text-ink-3">{sub}</div>
    </div>
  );
  return to ? (
    <Link to={to} className="block rounded-xl focus-visible:outline-2">
      {body}
    </Link>
  ) : (
    body
  );
}

const activityIcon: Record<string, ReactNode> = {
  STOCK_IN: <ArrowDownLeft className="size-4 text-emerald-600 dark:text-emerald-400" />,
  STOCK_OUT: <ArrowUpRight className="size-4 text-red-600 dark:text-red-400" />,
  STOCK_TRANSFER: <ArrowLeftRight className="size-4 text-sky-600 dark:text-sky-400" />,
  STOCK_OPERATION_REJECTED: <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400" />,
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function DashboardPage() {
  const { user, can } = useAuth();
  const [warehouseMetric, setWarehouseMetric] = useState<'units' | 'value'>('units');
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: qk.dashboard,
    queryFn: () => api.get<{ data: DashboardSummary }>('/dashboard/summary').then((r) => r.data),
    refetchInterval: 60_000,
  });

  const canOperate = can('inventory:stock-in') || can('inventory:stock-out');

  return (
    <div>
      <PageHeader
        title={`${greeting()}, ${user?.name.split(' ')[0] ?? ''}`}
        description={`Live inventory overview · ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => refetch()} loading={isFetching && !isLoading} icon={<RefreshCw className="size-4" />}>
              Refresh
            </Button>
            {canOperate && (
              <ButtonLink to="/inventory/operations" icon={<PackagePlus className="size-4" />}>
                New stock operation
              </ButtonLink>
            )}
          </>
        }
      />

      {isError ? (
        <div className="card">
          <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
        </div>
      ) : (
        <div className={clsx('space-y-6 transition-opacity', isFetching && !isLoading && 'opacity-80')}>
          {/* KPI tiles */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {isLoading || !data ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[134px] rounded-xl" />)
            ) : (
              <>
                <StatTile
                  label="Total SKUs"
                  value={formatNumber(data.kpis.totalSkus)}
                  icon={<Package className="size-[18px]" />}
                  sub={
                    <>
                      Active products{data.kpis.inactiveProducts > 0 && <> · {formatNumber(data.kpis.inactiveProducts)} inactive</>}
                    </>
                  }
                  to="/products"
                />
                <StatTile
                  label="Total inventory"
                  value={formatNumber(data.kpis.totalInventory)}
                  icon={<Boxes className="size-[18px]" />}
                  tone="info"
                  sub={
                    <>
                      Units on hand across {data.kpis.warehouseCount} warehouses · {formatNumber(data.kpis.todayMovements)} movements today
                    </>
                  }
                  to="/warehouses"
                />
                <StatTile
                  label="Low-stock products"
                  value={formatNumber(data.kpis.lowStockCount)}
                  icon={<TriangleAlert className="size-[18px]" />}
                  tone="warning"
                  sub={
                    data.kpis.outOfStockCount > 0 ? (
                      <span className="inline-flex items-center gap-1 font-medium text-red-600 dark:text-red-400">
                        <XCircle className="size-3.5" /> {formatNumber(data.kpis.outOfStockCount)} out of stock
                      </span>
                    ) : (
                      'At or below reorder level'
                    )
                  }
                  to={can('reports:view') ? '/reports/low-stock' : undefined}
                />
                <StatTile
                  label="Total stock value"
                  value={formatCurrencyCompact(data.kpis.totalStockValue)}
                  icon={<IndianRupee className="size-[18px]" />}
                  tone="good"
                  sub={<>Valued at unit price · {formatCurrency(data.kpis.totalStockValue)}</>}
                />
              </>
            )}
          </div>

          {/* Trend + warehouses */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2" title="Stock movement trend" subtitle={`Units moved per day · last 14 days (${data?.timezone ?? 'local time'})`}>
              {isLoading || !data ? <Skeleton className="h-80" /> : <MovementTrendChart data={data.movementTrend} />}
            </Card>

            <Card
              title="Warehouse-wise stock"
              subtitle={warehouseMetric === 'units' ? 'Units on hand' : 'Stock value (INR)'}
              actions={
                <div className="inline-flex rounded-lg border border-line p-0.5" role="group" aria-label="Metric">
                  {(['units', 'value'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setWarehouseMetric(m)}
                      aria-pressed={warehouseMetric === m}
                      className={clsx('rounded-md px-2 py-1 text-xs font-medium', warehouseMetric === m ? 'bg-surface-3 text-ink' : 'text-ink-3 hover:text-ink')}
                    >
                      {m === 'units' ? 'Units' : 'Value'}
                    </button>
                  ))}
                </div>
              }
            >
              {isLoading || !data ? (
                <Skeleton className="h-80" />
              ) : (
                <div className="space-y-5">
                  <HorizontalBarChart
                    data={data.warehouses.map((w) => ({ ...w, label: w.code }))}
                    categoryKey="label"
                    valueKey={warehouseMetric === 'units' ? 'totalUnits' : 'stockValue'}
                    formatValue={warehouseMetric === 'units' ? formatCompact : formatCurrencyCompact}
                    formatAxis={warehouseMetric === 'units' ? formatAxisNumber : formatAxisCurrency}
                    labelWidth={76}
                    ariaLabel="Stock per warehouse"
                    tooltipTitle={(w) => w.name}
                    tooltipRows={(w) => [
                      { label: 'Units on hand', value: formatNumber(w.totalUnits) },
                      { label: 'Stock value', value: formatCurrency(w.stockValue) },
                      { label: 'SKUs stocked', value: formatNumber(w.skuCount) },
                      ...(w.utilization !== null ? [{ label: 'Capacity used', value: `${w.utilization}%` }] : []),
                    ]}
                  />
                  <ul className="space-y-3">
                    {data.warehouses.map((w) => (
                      <li key={w.id}>
                        <Link to={`/warehouses/${w.id}`} className="block rounded-lg px-2 py-1.5 -mx-2 hover:bg-surface-2">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="flex min-w-0 items-center gap-2">
                              <WarehouseIcon className="size-4 shrink-0 text-ink-3" />
                              <span className="truncate font-medium text-ink">{w.name}</span>
                            </span>
                            <span className="shrink-0 text-xs text-ink-3 tabular">{w.utilization !== null ? `${w.utilization}% used` : `${formatNumber(w.totalUnits)} units`}</span>
                          </div>
                          {w.utilization !== null && (
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--series-1)_14%,transparent)]" aria-hidden>
                              <div className="h-full rounded-full bg-series-1" style={{ width: `${Math.max(2, w.utilization)}%` }} />
                            </div>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </div>

          {/* Low stock + activities + categories */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card
              title="Low-stock alerts"
              subtitle="Most urgent first"
              bodyClassName="p-0"
              actions={
                can('reports:view') && (
                  <Link to="/reports/low-stock" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
                    Full report <ArrowRight className="size-3.5" />
                  </Link>
                )
              }
            >
              {isLoading || !data ? (
                <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
              ) : data.lowStockItems.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-ink-3">All products are above their reorder levels.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.lowStockItems.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{i.name}</p>
                        <p className="text-xs text-ink-3">
                          {i.sku} · reorder at {formatNumber(i.reorderLevel)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-ink tabular">{formatNumber(i.totalStock)}</p>
                        <StockStatusBadge status={i.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Recent activities" subtitle="Latest operations across the system" bodyClassName="p-0">
              {isLoading || !data ? (
                <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
              ) : data.recentActivities.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-ink-3">No activity recorded yet.</p>
              ) : (
                <ul className="scrollbar-thin max-h-[420px] divide-y divide-line overflow-y-auto">
                  {data.recentActivities.map((a) => (
                    <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-3">
                        {activityIcon[a.action] ?? (a.entityType === 'User' ? <UserCog className="size-4 text-ink-3" /> : <Activity className="size-4 text-ink-3" />)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-ink">{a.description}</p>
                        <p className="mt-0.5 text-xs text-ink-3">
                          {a.user?.name ?? 'System'} · {timeAgo(a.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Stock value by category" subtitle="Active products, INR">
              {isLoading || !data ? (
                <Skeleton className="h-72" />
              ) : data.categoryBreakdown.length === 0 ? (
                <p className="py-10 text-center text-sm text-ink-3">No products yet.</p>
              ) : (
                <HorizontalBarChart
                  data={data.categoryBreakdown}
                  categoryKey="category"
                  valueKey="value"
                  formatValue={formatCurrencyCompact}
                  formatAxis={formatAxisCurrency}
                  labelWidth={108}
                  ariaLabel="Stock value by product category"
                  tooltipRows={(c) => [
                    { label: 'Stock value', value: formatCurrency(c.value) },
                    { label: 'Units on hand', value: formatNumber(c.units) },
                    { label: 'Products', value: formatNumber(c.productCount) },
                  ]}
                />
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
