"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ORDER_STATUSES, ORDER_STATUS_META, formatINR, type OrderStatus } from "@naamdev/shared";
import { OrderStatusBadge, Pagination, PaymentStatusBadge, Segmented, Select } from "@naamdev/ui";
import { DataTable, Guard, PageHeader, SearchInput, Toolbar } from "@/components/kit";
import { dt } from "@/lib/api";
import { useAdminRealtime } from "@/lib/realtime";
import { useResource } from "@/lib/use-resource";

interface Row { id: string; orderNumber: string; status: OrderStatus; paymentMethod: string; paymentStatus: string; totalPaise: number; customerName: string; customerPhone: string; pincode: string; createdAt: string; itemCount: number; itemsSummary: string; partner: { name: string; status: string } | null }

function OrdersInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const { tick } = useAdminRealtime();
  const [view, setView] = useState<"all" | "active" | "kitchen" | "unassigned">((sp.get("view") as never) ?? "all");
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [payment, setPayment] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  // "UPI_VERIFY" is a shortcut for UPI orders whose payment reference staff still need to check.
  const paymentFilter = payment === "UPI_VERIFY" ? { payment: "UPI", paymentStatus: "VERIFYING" } : { payment: payment || undefined };
  const { data, loading, error } = useResource<{ items: Row[]; meta: { totalPages: number; total: number }; statusCounts: Record<string, number> }>("/admin/orders", { view, status: status || undefined, ...paymentFilter, q: q || undefined, page, pageSize: 25, t: tick });
  return (
    <Guard any={["orders.view"]}>
      <PageHeader title="Orders" subtitle={data ? `${data.meta.total} orders` : undefined} />
      <Toolbar>
        <Segmented value={view} onChange={(v) => { setView(v); setPage(1); }} size="sm" options={[{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "kitchen", label: "Kitchen" }, { value: "unassigned", label: "Needs rider" }]} />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-10 w-48" aria-label="Status">
          <option value="">Any status</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_META[s].label} ({data?.statusCounts[s] ?? 0})</option>)}
        </Select>
        <Select value={payment} onChange={(e) => setPayment(e.target.value)} className="h-10 w-40" aria-label="Payment"><option value="">Any payment</option><option value="ONLINE">Online (Razorpay)</option><option value="UPI">UPI (direct)</option><option value="UPI_VERIFY">UPI — to verify</option><option value="COD">COD</option></Select>
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Order #, name or phone" className="sm:ml-auto" />
      </Toolbar>
      <DataTable<Row> loading={loading} error={error} rows={data?.items} onRowClick={(r) => router.push(`/orders/${r.id}`)} columns={[
        { key: "no", header: "Order", cell: (r) => <div><p className="font-mono font-bold text-ink">{r.orderNumber}</p><p className="text-xs text-muted">{dt(r.createdAt)}</p></div> },
        { key: "c", header: "Customer", cell: (r) => <div><p className="font-semibold text-ink">{r.customerName}</p><p className="text-xs text-muted">{r.customerPhone} · {r.pincode}</p></div> },
        { key: "i", header: "Items", cell: (r) => <p className="max-w-[260px] truncate text-xs" title={r.itemsSummary}>{r.itemCount} · {r.itemsSummary}</p> },
        { key: "s", header: "Status", cell: (r) => <OrderStatusBadge status={r.status} /> },
        { key: "p", header: "Payment", cell: (r) => <div className="space-y-1"><PaymentStatusBadge status={r.paymentStatus} /></div> },
        { key: "r", header: "Rider", cell: (r) => r.partner ? <span className="text-xs"><b className="text-ink">{r.partner.name}</b><br />{r.partner.status.toLowerCase().replace(/_/g, " ")}</span> : <span className="text-xs text-muted">—</span> },
        { key: "t", header: "Total", align: "right", cell: (r) => <b className="text-ink">{formatINR(r.totalPaise)}</b> },
      ]} />
      <Pagination page={page} totalPages={data?.meta.totalPages ?? 1} onChange={setPage} className="mt-4" />
    </Guard>
  );
}
export default function OrdersPage() { return <Suspense><OrdersInner /></Suspense>; }
