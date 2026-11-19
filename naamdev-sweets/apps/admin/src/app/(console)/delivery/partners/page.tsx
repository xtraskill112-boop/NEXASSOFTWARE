"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Badge, Pagination, Segmented } from "@naamdev/ui";
import { DataTable, Guard, PageHeader, SearchInput, Toolbar } from "@/components/kit";
import { dt } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

interface P { id: string; status: string; vehicleType: string; vehicleNumber: string | null; city: string; isOnline: boolean; totalDeliveries: number; rating: number; createdAt: string; lastLocationAt: string | null; activeDeliveries: number; user: { name: string; phone: string | null }; documents: { type: string; status: string }[] }
const tone = (s: string) => (s === "APPROVED" ? "success" : s === "PENDING" ? "warning" : "danger") as "success" | "warning" | "danger";

function Inner() {
  const router = useRouter();
  const [status, setStatus] = useState(useSearchParams().get("status") ?? "");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading } = useResource<{ items: P[]; meta: { totalPages: number } }>("/admin/people/partners", { status: status || undefined, q: q || undefined, page });
  return (
    <Guard any={["partners.manage", "delivery.manage"]}>
      <PageHeader title="Delivery partners" />
      <Toolbar>
        <Segmented size="sm" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "", label: "All" }, { value: "PENDING", label: "Pending verification" }, { value: "APPROVED", label: "Approved" }, { value: "SUSPENDED", label: "Suspended" }, { value: "REJECTED", label: "Rejected" }]} />
        <SearchInput value={q} onChange={setQ} placeholder="Name or phone" className="sm:ml-auto" />
      </Toolbar>
      <DataTable<P> loading={loading} rows={data?.items} onRowClick={(p) => router.push(`/delivery/partners/${p.id}`)} columns={[
        { key: "n", header: "Partner", cell: (p) => <div><p className="font-semibold text-ink">{p.user.name}</p><p className="text-xs text-muted">{p.user.phone} · {p.city}</p></div> },
        { key: "v", header: "Vehicle", cell: (p) => <span className="text-xs">{p.vehicleType.replace("_", " ").toLowerCase()} {p.vehicleNumber ?? ""}</span> },
        { key: "d", header: "Documents", cell: (p) => <span className="text-xs">{p.documents.filter((d) => d.status === "VERIFIED").length}/{p.documents.length} verified</span> },
        { key: "o", header: "Online", cell: (p) => p.isOnline ? <Badge tone="success" dot>Online</Badge> : <Badge>Offline</Badge> },
        { key: "a", header: "Active", align: "right", cell: (p) => p.activeDeliveries },
        { key: "t", header: "Deliveries", align: "right", cell: (p) => p.totalDeliveries },
        { key: "s", header: "Status", cell: (p) => <Badge tone={tone(p.status)}>{p.status.toLowerCase()}</Badge> },
        { key: "j", header: "Joined", cell: (p) => <span className="text-xs">{dt(p.createdAt, false)}</span> },
      ]} />
      <Pagination page={page} totalPages={data?.meta.totalPages ?? 1} onChange={setPage} className="mt-4" />
    </Guard>
  );
}
export default function Page() { return <Suspense><Inner /></Suspense>; }
