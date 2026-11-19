"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Check, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { REQUIRED_PARTNER_DOCUMENTS, formatINR } from "@naamdev/shared";
import { Badge, Button, Card, Skeleton } from "@naamdev/ui";
import { Can, DataTable, Guard, KeyValue, PageHeader } from "@/components/kit";
import { api, dt, errorMessage } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

interface P { id: string; status: string; statusReason: string | null; vehicleType: string; vehicleNumber: string | null; licenseNumber: string | null; city: string; isOnline: boolean; rating: number; totalDeliveries: number; bankAccountName: string | null; bankAccountLast4: string | null; bankIfsc: string | null; upiId: string | null; emergencyContact: string | null; approvedAt: string | null; lastLocationAt: string | null;
  user: { name: string; phone: string | null; email: string | null; createdAt: string };
  documents: { id: string; type: string; status: string; mimeType: string; rejectionReason: string | null; uploadedAt: string }[];
  assignments: { id: string; status: string; earningPaise: number; distanceKm: number | null; createdAt: string; order: { orderNumber: string } }[];
  earnings: { id: string; type: string; amountPaise: number; description: string; isSettled: boolean; createdAt: string }[] }

export default function PartnerPage() {
  const { id } = useParams<{ id: string }>();
  const { data, reload } = useResource<{ partner: P; unsettledPaise: number }>(`/admin/people/partners/${id}`);
  if (!data) return <Skeleton className="h-[60vh]" />;
  const p = data.partner;
  const run = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast.success(msg); void reload(); } catch (e) { toast.error(errorMessage(e)); } };
  const setStatus = (status: string, needReason: boolean) => {
    const reason = needReason ? prompt("Reason (shared with the partner)") : undefined;
    if (needReason && !reason) return;
    void run(() => api.post(`/admin/people/partners/${id}/status`, { status, reason }), `Partner ${status.toLowerCase()}`);
  };
  const viewDoc = async (docId: string) => {
    // Opened synchronously so pop-up blockers allow it, then filled once the private file downloads.
    const win = window.open("", "_blank");
    try {
      const blob = await api.download(`/admin/people/partners/${id}/documents/${docId}/file`);
      const url = URL.createObjectURL(blob);
      if (win) win.location.href = url;
      else window.open(url, "_blank", "noopener");
    } catch (e) {
      win?.close();
      toast.error(errorMessage(e, "Couldn't open document"));
    }
  };
  const missing = REQUIRED_PARTNER_DOCUMENTS.filter((t) => !p.documents.some((d) => d.type === t && d.status === "VERIFIED"));
  return (
    <Guard any={["partners.manage", "delivery.manage"]}>
      <PageHeader back={<Link href="/delivery/partners" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-muted"><ArrowLeft className="h-3.5 w-3.5" />Partners</Link>} title={p.user.name}
        subtitle={<span className="flex items-center gap-2"><Badge tone={p.status === "APPROVED" ? "success" : p.status === "PENDING" ? "warning" : "danger"}>{p.status.toLowerCase()}</Badge>{p.isOnline && <Badge tone="success" dot>Online</Badge>}{p.statusReason && <span className="text-xs">{p.statusReason}</span>}</span>}
        actions={<Can any={["partners.manage"]}>
          {p.status !== "APPROVED" && <Button disabled={missing.length > 0} title={missing.length ? `Verify ${missing.join(", ")} first` : undefined} onClick={() => setStatus("APPROVED", false)}><Check className="h-4 w-4" />Approve</Button>}
          {p.status === "PENDING" && <Button variant="outline" onClick={() => setStatus("REJECTED", true)}>Reject</Button>}
          {p.status === "APPROVED" && <Button variant="danger" onClick={() => setStatus("SUSPENDED", true)}>Suspend</Button>}
        </Can>} />
      {missing.length > 0 && p.status !== "APPROVED" && <p className="mb-4 text-sm text-maroon-600">Required documents still to verify: {missing.map((m) => m.replace("_", " ").toLowerCase()).join(", ")}</p>}
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="p-5"><KeyValue items={[["Phone", p.user.phone], ["Email", p.user.email], ["City", p.city], ["Vehicle", `${p.vehicleType.replace("_", " ").toLowerCase()} ${p.vehicleNumber ?? ""}`], ["Licence", p.licenseNumber], ["Rating", p.rating.toFixed(1)], ["Deliveries", p.totalDeliveries], ["Joined", dt(p.user.createdAt, false)], ["Bank", p.bankAccountLast4 ? `${p.bankAccountName ?? ""} ••••${p.bankAccountLast4} ${p.bankIfsc ?? ""}` : "—"], ["UPI", p.upiId], ["Emergency", p.emergencyContact], ["Last GPS", dt(p.lastLocationAt)]]} /></Card>
        <Card className="p-5 xl:col-span-2">
          <h2 className="mb-3 font-display text-lg font-semibold">KYC documents</h2>
          {p.documents.length === 0 ? <p className="text-sm text-muted">No documents uploaded yet.</p> : (
            <ul className="space-y-2">{p.documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line-soft p-3 text-sm">
                <b className="w-40 text-ink">{d.type.replace("_", " ").toLowerCase()}</b>
                <Badge tone={d.status === "VERIFIED" ? "success" : d.status === "REJECTED" ? "danger" : "warning"}>{d.status.toLowerCase()}</Badge>
                <span className="text-xs text-muted">{dt(d.uploadedAt)}{d.rejectionReason ? ` · ${d.rejectionReason}` : ""}</span>
                <span className="ml-auto flex gap-1">
                  <Can any={["partners.manage"]}><Button size="xs" variant="ghost" onClick={() => void viewDoc(d.id)}><ExternalLink className="h-3.5 w-3.5" />View</Button>
                  {d.status !== "VERIFIED" && <Button size="xs" onClick={() => void run(() => api.post(`/admin/people/partners/${id}/documents/${d.id}/review`, { status: "VERIFIED" }), "Document verified")}><Check className="h-3.5 w-3.5" />Verify</Button>}
                  {d.status !== "REJECTED" && <Button size="xs" variant="outline" onClick={() => { const r = prompt("Why is it rejected?"); if (r) void run(() => api.post(`/admin/people/partners/${id}/documents/${d.id}/review`, { status: "REJECTED", reason: r }), "Document rejected"); }}><X className="h-3.5 w-3.5" />Reject</Button>}</Can>
                </span>
              </li>
            ))}</ul>
          )}
        </Card>
        <Card className="p-5 xl:col-span-3">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-lg font-semibold">Earnings</h2>
            <Can any={["partners.manage"]}>{data.unsettledPaise > 0 && <Button size="sm" onClick={() => { const ref = prompt(`Payout reference for ${formatINR(data.unsettledPaise)} (UTR / UPI ref)`); if (ref) void run(() => api.post(`/admin/people/partners/${id}/settle`, { reference: ref }), "Payout recorded"); }}>Mark {formatINR(data.unsettledPaise)} as paid</Button>}</Can>
          </div>
          <DataTable rows={p.earnings} columns={[
            { key: "d", header: "Date", cell: (e) => dt(e.createdAt) }, { key: "t", header: "Type", cell: (e) => e.type.replace("_", " ").toLowerCase() },
            { key: "x", header: "Details", cell: (e) => e.description }, { key: "a", header: "Amount", align: "right", cell: (e) => formatINR(e.amountPaise) },
            { key: "s", header: "Payout", cell: (e) => <Badge tone={e.isSettled ? "success" : "warning"}>{e.isSettled ? "paid" : "due"}</Badge> },
          ]} />
        </Card>
      </div>
    </Guard>
  );
}
