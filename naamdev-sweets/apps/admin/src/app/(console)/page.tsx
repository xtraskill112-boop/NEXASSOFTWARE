"use client";
import Link from "next/link";
import { AlertTriangle, BadgeIndianRupee, CalendarClock, ClipboardList, Clock, Package, ShoppingBag, Smartphone, Star, Truck, Users } from "lucide-react";
import { ORDER_STATUS_META, formatINR, type OrderStatus } from "@naamdev/shared";
import { Badge, Card, ErrorState, Skeleton, StatCard } from "@naamdev/ui";
import { CategoryBars, OrdersBars, RevenueArea } from "@/components/charts";
import { Guard, PageHeader } from "@/components/kit";
import { useAdmin } from "@/lib/auth";
import { useAdminRealtime } from "@/lib/realtime";
import { useResource } from "@/lib/use-resource";
import { dt } from "@/lib/api";

interface Dash {
  revenue: { totalPaise: number; todayPaise: number; weekPaise: number; monthPaise: number; averageOrderValuePaise: number } | null;
  orders: { total: number; pending: number; kitchen: number; delivered: number; cancelled: number; refunds: number; today: number; byStatus: Record<string, number>; unassigned: number };
  customers: { total: number; newLast30Days: number };
  attention: { openTickets: number; pendingReviews: number; pendingPartners: number };
  lowStock: { variantId: string; productName: string; label: string; available: number; threshold: number }[];
  expiring: { batchId: string; batchNumber: string; product: string; variant: string; remaining: number; expiresAt: string }[];
  bestsellers: { productId: string; name: string; quantity: number; revenuePaise: number | null }[];
  charts: { daily: { date: string; revenuePaise: number; orders: number }[]; categoryShare: { category: string; revenuePaise: number }[]; paymentSplit: { method: string; orders: number; amountPaise: number }[] } | null;
}

export default function Dashboard() {
  const { tick } = useAdminRealtime();
  const { data: d, error } = useResource<Dash>("/admin/dashboard", { t: tick });
  const { canAny } = useAdmin();
  const upi = useResource<{ items: { orderId: string; orderNumber: string; totalPaise: number; customerName: string | null; reference: string | null; submittedAt: string | null }[] }>(
    canAny("payments.verify", "orders.view") ? "/admin/orders/upi/pending" : null, { t: tick },
  );
  return (
    <Guard any={["dashboard.view"]}>
      <PageHeader title="Store overview" subtitle={`Live as of ${dt(new Date())}`} />
      {error ? <ErrorState description={error} /> : !d ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-32" />)}</div> : (
        <div className="space-y-6">
          {d.revenue && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Today's revenue" value={formatINR(d.revenue.todayPaise)} icon={<BadgeIndianRupee className="h-5 w-5" />} hint={`${d.orders.today} paid orders today`} />
              <StatCard label="Last 7 days" value={formatINR(d.revenue.weekPaise)} icon={<BadgeIndianRupee className="h-5 w-5" />} />
              <StatCard label="Last 30 days" value={formatINR(d.revenue.monthPaise)} icon={<BadgeIndianRupee className="h-5 w-5" />} />
              <StatCard label="Total revenue" value={formatINR(d.revenue.totalPaise)} icon={<BadgeIndianRupee className="h-5 w-5" />} hint={`AOV ${formatINR(d.revenue.averageOrderValuePaise)}`} />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Link href="/orders?view=active"><StatCard label="Pending orders" value={d.orders.pending} icon={<ClipboardList className="h-5 w-5" />} hint={`${d.orders.kitchen} in kitchen · ${d.orders.unassigned} awaiting rider`} className="hover:shadow-lift" /></Link>
            <StatCard label="Delivered" value={d.orders.delivered} icon={<Truck className="h-5 w-5" />} hint={`${d.orders.total} orders all-time`} />
            <StatCard label="Cancelled" value={d.orders.cancelled} icon={<AlertTriangle className="h-5 w-5" />} hint={`${d.orders.refunds} refunded / refunding`} />
            <Link href="/customers"><StatCard label="Customers" value={d.customers.total} icon={<Users className="h-5 w-5" />} hint={`${d.customers.newLast30Days} new in 30 days`} /></Link>
          </div>

          {!!upi.data?.items.length && (
            <Card className="border-2 border-saffron-300 p-5 dark:border-saffron-500/40">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink"><Smartphone className="h-5 w-5 text-saffron-600" />{upi.data.items.length} UPI payment{upi.data.items.length > 1 ? "s" : ""} to check</h2>
              <p className="mb-3 text-sm text-muted">These orders are on hold until someone confirms the money reached the shop&apos;s UPI account.</p>
              <ul className="divide-y divide-line-soft text-sm">
                {upi.data.items.slice(0, 8).map((u) => (
                  <li key={u.orderId}><Link href={`/orders/${u.orderId}`} className="flex items-center justify-between gap-3 py-2 hover:text-saffron-700"><span className="font-mono font-bold">{u.orderNumber}</span><span className="truncate text-muted">{u.customerName}</span><span className="font-mono text-xs">UTR {u.reference}</span><span className="font-semibold tabular-nums">{formatINR(u.totalPaise)}</span></Link></li>
                ))}
              </ul>
            </Card>
          )}

          {(d.attention.openTickets > 0 || d.attention.pendingReviews > 0 || d.attention.pendingPartners > 0 || d.orders.unassigned > 0) && (
            <div className="flex flex-wrap gap-2">
              {d.orders.unassigned > 0 && <Link href="/orders?view=unassigned"><Badge tone="warning">{d.orders.unassigned} packed order{d.orders.unassigned > 1 ? "s" : ""} need{d.orders.unassigned > 1 ? "" : "s"} a rider</Badge></Link>}
              {d.attention.openTickets > 0 && <Link href="/support"><Badge tone="info">{d.attention.openTickets} open ticket{d.attention.openTickets > 1 ? "s" : ""}</Badge></Link>}
              {d.attention.pendingReviews > 0 && <Link href="/reviews"><Badge tone="brand">{d.attention.pendingReviews} review{d.attention.pendingReviews > 1 ? "s" : ""} to moderate</Badge></Link>}
              {d.attention.pendingPartners > 0 && <Link href="/delivery/partners?status=PENDING"><Badge tone="brand">{d.attention.pendingPartners} partner{d.attention.pendingPartners > 1 ? "s" : ""} awaiting verification</Badge></Link>}
            </div>
          )}

          {d.charts && (
            <div className="grid gap-4 xl:grid-cols-3">
              <Card className="p-5 xl:col-span-2">
                <h2 className="font-display text-lg font-semibold text-ink">Revenue · last 30 days</h2>
                <p className="mb-3 text-xs text-muted">Money received (paid online or COD collected), net of refunds</p>
                <RevenueArea data={d.charts.daily} />
              </Card>
              <Card className="p-5">
                <h2 className="mb-4 font-display text-lg font-semibold text-ink">Sales by category</h2>
                {d.charts.categoryShare.length ? <CategoryBars data={d.charts.categoryShare} /> : <p className="text-sm text-muted">No sales in the last 30 days yet.</p>}
                <div className="mt-6 grid grid-cols-3 gap-3 border-t border-line-soft pt-4">
                  {(["ONLINE", "UPI", "COD"] as const).map((m) => {
                    const p = d.charts!.paymentSplit.find((x) => x.method === m);
                    return <div key={m} className="rounded-2xl bg-surface-2 p-3"><p className="text-[11px] font-bold uppercase tracking-wider text-muted">{m === "ONLINE" ? "Razorpay" : m === "UPI" ? "UPI (direct)" : "Cash on delivery"}</p><p className="mt-1 font-bold tabular-nums text-ink">{formatINR(p?.amountPaise ?? 0)}</p><p className="text-xs text-muted">{p?.orders ?? 0} orders</p></div>;
                  })}
                </div>
              </Card>
              <Card className="p-5 xl:col-span-2">
                <h2 className="mb-3 font-display text-lg font-semibold text-ink">Orders per day</h2>
                <OrdersBars data={d.charts.daily} />
              </Card>
              <Card className="p-5">
                <h2 className="mb-3 font-display text-lg font-semibold text-ink">Order pipeline</h2>
                <ul className="space-y-2 text-sm">
                  {(["PENDING", "CONFIRMED", "PROCESSING", "PREPARING", "PACKED", "READY_FOR_PICKUP", "DISPATCHED", "OUT_FOR_DELIVERY"] as OrderStatus[]).map((s) => (
                    <li key={s}><Link href={`/orders?status=${s}`} className="flex items-center justify-between rounded-xl px-2 py-1.5 hover:bg-surface-2"><span className="text-ink-soft">{ORDER_STATUS_META[s].label}</span><span className="font-bold tabular-nums text-ink">{d.orders.byStatus[s] ?? 0}</span></Link></li>
                  ))}
                </ul>
              </Card>
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="p-5">
              <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-ink"><Star className="h-4 w-4 text-gold-500" />Bestsellers · 30 days</h2>
              {d.bestsellers.length === 0 ? <p className="text-sm text-muted">No sales yet.</p> : (
                <ol className="space-y-2.5 text-sm">{d.bestsellers.map((b, i) => <li key={b.productId} className="flex items-center gap-3"><span className="grid h-6 w-6 place-items-center rounded-full bg-saffron-50 text-xs font-bold text-saffron-700 dark:bg-saffron-500/10">{i + 1}</span><span className="flex-1 truncate text-ink">{b.name}</span><span className="text-xs text-muted">{b.quantity} sold</span></li>)}</ol>
              )}
            </Card>
            <Card className="p-5">
              <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-ink"><Package className="h-4 w-4 text-maroon-600" />Low stock</h2>
              {d.lowStock.length === 0 ? <p className="text-sm text-muted">All items are above their thresholds. 🎉</p> : (
                <ul className="space-y-2 text-sm">{d.lowStock.map((l) => <li key={l.variantId}><Link href={`/inventory/${l.variantId}`} className="flex items-center justify-between gap-2 rounded-lg px-1 hover:bg-surface-2"><span className="truncate text-ink">{l.productName} <span className="text-muted">· {l.label}</span></span><Badge tone={l.available <= 0 ? "danger" : "warning"}>{l.available} left</Badge></Link></li>)}</ul>
              )}
            </Card>
            <Card className="p-5">
              <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-ink"><CalendarClock className="h-4 w-4 text-saffron-600" />Expiring soon</h2>
              {d.expiring.length === 0 ? <p className="text-sm text-muted">No batches expiring soon.</p> : (
                <ul className="space-y-2 text-sm">{d.expiring.map((b) => <li key={b.batchId} className="flex items-center justify-between gap-2"><span className="truncate text-ink">{b.product} <span className="text-muted">· {b.variant} · {b.batchNumber}</span></span><span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-maroon-600"><Clock className="h-3 w-3" />{dt(b.expiresAt)}</span></li>)}</ul>
              )}
              <Link href="/inventory/expiry" className="mt-3 inline-block text-xs font-bold text-saffron-700">Manage expiry →</Link>
            </Card>
          </div>
          {!d.revenue && <p className="text-xs text-muted"><ShoppingBag className="mr-1 inline h-3 w-3" />Revenue figures are visible to roles with analytics access.</p>}
        </div>
      )}
    </Guard>
  );
}
