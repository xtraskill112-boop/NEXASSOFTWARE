"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatINR } from "@naamdev/shared";
import { Badge, Pagination, Segmented } from "@naamdev/ui";
import { DataTable, Guard, PageHeader, SearchInput, Toolbar } from "@/components/kit";
import { dt } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

interface C { id: string; name: string; email: string | null; phone: string | null; status: string; loyaltyPoints: number; createdAt: string; lastLoginAt: string | null; deletionRequestedAt: string | null; _count: { orders: number }; lifetimeSpendPaise: number }

export default function CustomersPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | "ACTIVE" | "SUSPENDED" | "DELETION_REQUESTED">("");
  const [page, setPage] = useState(1);
  const { data, loading, error } = useResource<{ items: C[]; meta: { totalPages: number; total: number } }>("/admin/people/customers", { q: q || undefined, status: status || undefined, page });
  return (
    <Guard any={["customers.view"]}>
      <PageHeader title="Customers" subtitle={data ? `${data.meta.total} customers` : undefined} />
      <Toolbar>
        <Segmented size="sm" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "", label: "All" }, { value: "ACTIVE", label: "Active" }, { value: "SUSPENDED", label: "Suspended" }, { value: "DELETION_REQUESTED", label: "Deletion requests" }]} />
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Name, email or phone" className="sm:ml-auto" />
      </Toolbar>
      <DataTable<C> loading={loading} error={error} rows={data?.items} onRowClick={(r) => router.push(`/customers/${r.id}`)} columns={[
        { key: "n", header: "Customer", cell: (c) => <div><p className="font-semibold text-ink">{c.name}</p><p className="text-xs text-muted">{c.phone} {c.email && `· ${c.email}`}</p></div> },
        { key: "o", header: "Orders", align: "right", cell: (c) => c._count.orders },
        { key: "s", header: "Lifetime spend", align: "right", cell: (c) => formatINR(c.lifetimeSpendPaise) },
        { key: "p", header: "Points", align: "right", cell: (c) => c.loyaltyPoints },
        { key: "j", header: "Joined", cell: (c) => <span className="text-xs">{dt(c.createdAt, false)}</span> },
        { key: "st", header: "Status", cell: (c) => <Badge tone={c.status === "ACTIVE" ? "success" : c.status === "SUSPENDED" ? "danger" : "warning"}>{c.status.replace("_", " ").toLowerCase()}</Badge> },
      ]} />
      <Pagination page={page} totalPages={data?.meta.totalPages ?? 1} onChange={setPage} className="mt-4" />
    </Guard>
  );
}
