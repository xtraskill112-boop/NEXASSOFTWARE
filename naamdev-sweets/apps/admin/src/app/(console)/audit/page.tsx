"use client";
import { useState } from "react";
import { Pagination } from "@naamdev/ui";
import { DataTable, Guard, PageHeader, SearchInput, Toolbar } from "@/components/kit";
import { dt } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

interface A { id: string; action: string; entity: string; entityId: string | null; metadata: unknown; ip: string | null; createdAt: string; actor: { name: string; email: string | null } | null }

export default function AuditPage() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading } = useResource<{ items: A[]; meta: { totalPages: number } }>("/admin/audit", { action: action || undefined, page, pageSize: 50 });
  return (
    <Guard any={["audit.view"]}>
      <PageHeader title="Audit log" subtitle="Every sensitive staff action is recorded with actor, IP and details." />
      <Toolbar><SearchInput value={action} onChange={setAction} placeholder="Filter by action, e.g. refund" /></Toolbar>
      <DataTable<A> loading={loading} rows={data?.items} columns={[
        { key: "t", header: "When", cell: (a) => <span className="whitespace-nowrap text-xs">{dt(a.createdAt)}</span> },
        { key: "u", header: "Actor", cell: (a) => a.actor?.name ?? "System" },
        { key: "a", header: "Action", cell: (a) => <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{a.action}</code> },
        { key: "e", header: "Entity", cell: (a) => <span className="text-xs">{a.entity}{a.entityId ? ` · ${a.entityId.slice(0, 10)}…` : ""}</span> },
        { key: "m", header: "Details", cell: (a) => <code className="block max-w-md truncate text-[11px] text-muted" title={JSON.stringify(a.metadata)}>{a.metadata ? JSON.stringify(a.metadata) : ""}</code> },
        { key: "i", header: "IP", cell: (a) => <span className="text-xs">{a.ip}</span> },
      ]} />
      <Pagination page={page} totalPages={data?.meta.totalPages ?? 1} onChange={setPage} className="mt-4" />
    </Guard>
  );
}
