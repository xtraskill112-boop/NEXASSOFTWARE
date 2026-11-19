"use client";
import Link from "next/link";
import { useState } from "react";
import { formatINR } from "@naamdev/shared";
import { Badge, Pagination, Segmented } from "@naamdev/ui";
import { DataTable, Guard, PageHeader } from "@/components/kit";
import { dt } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

interface Pm { id: string; orderId: string; method: string; provider: string; status: string; amountPaise: number; gatewayOrderId: string | null; gatewayPaymentId: string | null; methodDetail: string | null; failureReason: string | null; createdAt: string; order: { orderNumber: string; customerName: string } }

export default function PaymentsPage() {
  const [method, setMethod] = useState<"" | "ONLINE" | "UPI" | "COD">("");
  const [page, setPage] = useState(1);
  const { data, loading } = useResource<{ items: Pm[]; meta: { totalPages: number } }>("/admin/payments", { method: method || undefined, page });
  return (
    <Guard any={["payments.view"]}>
      <PageHeader title="Payments" subtitle="Razorpay payments are verified server-side with signatures and webhooks. Direct UPI payments are confirmed by staff against the shop's UPI account." />
      <Segmented size="sm" className="mb-4" value={method} onChange={(v) => { setMethod(v); setPage(1); }} options={[{ value: "", label: "All" }, { value: "ONLINE", label: "Razorpay" }, { value: "UPI", label: "UPI (direct)" }, { value: "COD", label: "Cash on delivery" }]} />
      <DataTable<Pm> loading={loading} rows={data?.items} columns={[
        { key: "o", header: "Order", cell: (p) => <Link href={`/orders/${p.orderId}`} className="font-mono font-bold text-saffron-700">{p.order.orderNumber}</Link> },
        { key: "c", header: "Customer", cell: (p) => p.order.customerName },
        { key: "m", header: "Method", cell: (p) => p.method === "COD" ? "COD" : p.method === "UPI" ? "UPI (direct)" : `Razorpay${p.methodDetail ? ` · ${p.methodDetail}` : ""}` },
        { key: "g", header: "Reference", cell: (p) => <span className="font-mono text-[11px]">{p.gatewayPaymentId ?? p.gatewayOrderId ?? "—"}</span> },
        { key: "a", header: "Amount", align: "right", cell: (p) => formatINR(p.amountPaise) },
        { key: "s", header: "Status", cell: (p) => <Badge tone={p.status === "CAPTURED" ? "success" : p.status === "FAILED" ? "danger" : p.status === "REFUNDED" ? "neutral" : "warning"}>{p.status.toLowerCase()}</Badge> },
        { key: "d", header: "Date", cell: (p) => <span className="text-xs">{dt(p.createdAt)}{p.failureReason ? ` · ${p.failureReason}` : ""}</span> },
      ]} />
      <Pagination page={page} totalPages={data?.meta.totalPages ?? 1} onChange={setPage} className="mt-4" />
    </Guard>
  );
}
