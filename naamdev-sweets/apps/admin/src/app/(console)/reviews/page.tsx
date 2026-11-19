"use client";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Pagination, Segmented, Stars } from "@naamdev/ui";
import { DataTable, Guard, PageHeader } from "@/components/kit";
import { api, dt, errorMessage } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

interface R { id: string; rating: number; title: string | null; body: string | null; status: string; createdAt: string; user: { name: string }; product: { name: string; slug: string } }

export default function ReviewsPage() {
  const [status, setStatus] = useState<"PENDING" | "APPROVED" | "REJECTED">("PENDING");
  const [page, setPage] = useState(1);
  const { data, loading, reload } = useResource<{ items: R[]; meta: { totalPages: number } }>("/admin/people/reviews", { status, page });
  const moderate = async (id: string, s: "APPROVED" | "REJECTED") => {
    const reason = s === "REJECTED" ? prompt("Reason (shown to the customer)") ?? undefined : undefined;
    try { await api.post(`/admin/people/reviews/${id}/moderate`, { status: s, reason }); toast.success(s === "APPROVED" ? "Published" : "Rejected"); void reload(); } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <Guard any={["reviews.moderate"]}>
      <PageHeader title="Review moderation" subtitle="Only verified buyers can review. Approved reviews update product ratings instantly." />
      <Segmented size="sm" className="mb-4" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "PENDING", label: "Pending" }, { value: "APPROVED", label: "Approved" }, { value: "REJECTED", label: "Rejected" }]} />
      <DataTable<R> loading={loading} rows={data?.items} columns={[
        { key: "p", header: "Product", cell: (r) => <div><p className="font-semibold text-ink">{r.product.name}</p><p className="text-xs text-muted">{r.user.name} · {dt(r.createdAt)}</p></div> },
        { key: "r", header: "Review", cell: (r) => <div className="max-w-md"><Stars value={r.rating} size={13} />{r.title && <p className="font-semibold text-ink">{r.title}</p>}<p className="text-xs">{r.body}</p></div> },
        { key: "s", header: "Status", cell: (r) => <Badge tone={r.status === "APPROVED" ? "success" : r.status === "REJECTED" ? "danger" : "warning"}>{r.status.toLowerCase()}</Badge> },
        { key: "a", header: "", align: "right", cell: (r) => <div className="flex justify-end gap-1">{r.status !== "APPROVED" && <Button size="xs" onClick={() => void moderate(r.id, "APPROVED")}><Check className="h-3.5 w-3.5" />Approve</Button>}{r.status !== "REJECTED" && <Button size="xs" variant="outline" onClick={() => void moderate(r.id, "REJECTED")}><X className="h-3.5 w-3.5" />Reject</Button>}</div> },
      ]} />
      <Pagination page={page} totalPages={data?.meta.totalPages ?? 1} onChange={setPage} className="mt-4" />
    </Guard>
  );
}
