"use client";
import Link from "next/link";
import { useState } from "react";
import { formatINR } from "@naamdev/shared";
import { Badge, Segmented } from "@naamdev/ui";
import { DataTable, Guard, PageHeader } from "@/components/kit";
import { dt } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

interface Rf { id: string; amountPaise: number; status: string; method: string; reason: string; reference: string | null; createdAt: string; orderId: string; order: { orderNumber: string; customerName: string }; initiatedBy: { name: string } | null }
interface Rr { id: string; reason: string; status: string; createdAt: string; orderId: string; order: { orderNumber: string; totalPaise: number; paymentMethod: string }; user: { name: string } }

export default function ReturnsPage() {
  const [tab, setTab] = useState<"returns" | "refunds">("returns");
  const returns = useResource<{ items: Rr[] }>(tab === "returns" ? "/admin/payments/returns" : null, { pageSize: 50 });
  const refunds = useResource<{ items: Rf[] }>(tab === "refunds" ? "/admin/payments/refunds" : null, { pageSize: 50 });
  return (
    <Guard any={["refunds.manage"]}>
      <PageHeader title="Refunds & returns" subtitle="Open an order to approve a return or issue a refund." />
      <Segmented value={tab} onChange={setTab} className="mb-4" options={[{ value: "returns", label: "Return requests" }, { value: "refunds", label: "Refunds" }]} />
      {tab === "returns" ? (
        <DataTable<Rr> loading={returns.loading} rows={returns.data?.items} columns={[
          { key: "o", header: "Order", cell: (r) => <Link href={`/orders/${r.orderId}`} className="font-mono font-bold text-maroon-700">{r.order.orderNumber}</Link> },
          { key: "c", header: "Customer", cell: (r) => r.user.name }, { key: "r", header: "Reason", cell: (r) => r.reason },
          { key: "v", header: "Order value", align: "right", cell: (r) => `${formatINR(r.order.totalPaise)} · ${r.order.paymentMethod}` },
          { key: "d", header: "Requested", cell: (r) => dt(r.createdAt) },
          { key: "s", header: "Status", cell: (r) => <Badge tone={r.status === "REQUESTED" ? "warning" : r.status === "REJECTED" ? "danger" : "success"}>{r.status.toLowerCase()}</Badge> },
        ]} />
      ) : (
        <DataTable<Rf> loading={refunds.loading} rows={refunds.data?.items} columns={[
          { key: "o", header: "Order", cell: (r) => <Link href={`/orders/${r.orderId}`} className="font-mono font-bold text-maroon-700">{r.order.orderNumber}</Link> },
          { key: "c", header: "Customer", cell: (r) => r.order.customerName }, { key: "a", header: "Amount", align: "right", cell: (r) => formatINR(r.amountPaise) },
          { key: "m", header: "Method", cell: (r) => r.method.toLowerCase() }, { key: "r", header: "Reason", cell: (r) => <span className="text-xs">{r.reason}</span> },
          { key: "b", header: "By", cell: (r) => r.initiatedBy?.name ?? "System" }, { key: "d", header: "Date", cell: (r) => dt(r.createdAt) },
          { key: "s", header: "Status", cell: (r) => <Badge tone={r.status === "PROCESSED" ? "success" : r.status === "FAILED" ? "danger" : "warning"}>{r.status.toLowerCase()}</Badge> },
        ]} />
      )}
    </Guard>
  );
}
