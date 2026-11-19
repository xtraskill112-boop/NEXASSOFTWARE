"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Checkbox, Pagination, Segmented } from "@naamdev/ui";
import { DataTable, Guard, PageHeader, SearchInput, Toolbar } from "@/components/kit";
import { dt } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

interface T { id: string; ticketNumber: string; subject: string; category: string; priority: string; status: string; lastActivityAt: string; guestName: string | null; user: { name: string; phone: string | null } | null; assignedTo: { name: string } | null; order: { orderNumber: string } | null }
const pr = (p: string) => (p === "URGENT" || p === "HIGH" ? "danger" : p === "MEDIUM" ? "warning" : "neutral") as "danger" | "warning" | "neutral";

export default function SupportPage() {
  const router = useRouter();
  const [status, setStatus] = useState("OPEN,IN_PROGRESS");
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading } = useResource<{ items: T[]; meta: { totalPages: number }; statusCounts: Record<string, number> }>("/admin/people/tickets", { status, mine: mine || undefined, q: q || undefined, page });
  const c = data?.statusCounts ?? {};
  return (
    <Guard any={["support.view"]}>
      <PageHeader title="Support tickets" />
      <Toolbar>
        <Segmented size="sm" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "OPEN,IN_PROGRESS", label: "Open", count: (c.OPEN ?? 0) + (c.IN_PROGRESS ?? 0) }, { value: "AWAITING_CUSTOMER", label: "Awaiting customer", count: c.AWAITING_CUSTOMER ?? 0 }, { value: "RESOLVED,CLOSED", label: "Resolved" }]} />
        <Checkbox checked={mine} onChange={setMine} label="Assigned to me" />
        <SearchInput value={q} onChange={setQ} placeholder="Ticket # or subject" className="sm:ml-auto" />
      </Toolbar>
      <DataTable<T> loading={loading} rows={data?.items} onRowClick={(t) => router.push(`/support/${t.id}`)} columns={[
        { key: "n", header: "Ticket", cell: (t) => <div><p className="font-mono text-xs font-bold text-muted">{t.ticketNumber}</p><p className="font-semibold text-ink">{t.subject}</p></div> },
        { key: "c", header: "Customer", cell: (t) => t.user?.name ?? `${t.guestName ?? "Guest"} (guest)` },
        { key: "cat", header: "Category", cell: (t) => <span className="text-xs">{t.category.replace(/_/g, " ").toLowerCase()}{t.order ? ` · ${t.order.orderNumber}` : ""}</span> },
        { key: "p", header: "Priority", cell: (t) => <Badge tone={pr(t.priority)}>{t.priority.toLowerCase()}</Badge> },
        { key: "s", header: "Status", cell: (t) => <Badge tone="info">{t.status.replace(/_/g, " ").toLowerCase()}</Badge> },
        { key: "a", header: "Assignee", cell: (t) => t.assignedTo?.name ?? "—" },
        { key: "l", header: "Last activity", cell: (t) => <span className="text-xs">{dt(t.lastActivityAt)}</span> },
      ]} />
      <Pagination page={page} totalPages={data?.meta.totalPages ?? 1} onChange={setPage} className="mt-4" />
    </Guard>
  );
}
