"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { formatINR, tierFor } from "@naamdev/shared";
import { Badge, Button, Card, Field, Input, InlineAlert, Modal, OrderStatusBadge, Skeleton } from "@naamdev/ui";
import { Can, Guard, KeyValue, PageHeader, confirmAction } from "@/components/kit";
import { api, dt, errorMessage } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

interface Cust { id: string; name: string; email: string | null; phone: string | null; status: string; loyaltyPoints: number; lifetimePoints: number; referralCode: string; createdAt: string; lastLoginAt: string | null; deletionRequestedAt: string | null; emailVerifiedAt: string | null; phoneVerifiedAt: string | null;
  profile: { dateOfBirth: string | null; marketingOptIn: boolean } | null; addresses: { id: string; type: string; line1: string; city: string; pincode: string }[];
  orders: { id: string; orderNumber: string; status: never; totalPaise: number; createdAt: string; paymentMethod: string }[]; loyaltyTransactions: { id: string; points: number; description: string; createdAt: string }[];
  tickets: { id: string; ticketNumber: string; subject: string; status: string }[]; reviews: { id: string; rating: number; status: string; product: { name: string } }[] }

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const { data, reload } = useResource<{ customer: Cust }>(`/admin/people/customers/${id}`);
  const [pts, setPts] = useState({ open: false, points: "", reason: "" });
  if (!data) return <Skeleton className="h-[60vh]" />;
  const c = data.customer;
  const run = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast.success(msg); void reload(); } catch (e) { toast.error(errorMessage(e)); } };
  return (
    <Guard any={["customers.view"]}>
      <PageHeader back={<Link href="/customers" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-muted"><ArrowLeft className="h-3.5 w-3.5" />Customers</Link>} title={c.name} subtitle={<Badge tone={c.status === "ACTIVE" ? "success" : "danger"}>{c.status.replace("_", " ").toLowerCase()}</Badge>}
        actions={<Can any={["customers.manage"]}>
          <Button variant="outline" onClick={() => setPts({ ...pts, open: true })}>Adjust points</Button>
          {c.status === "SUSPENDED" ? <Button variant="outline" onClick={() => run(() => api.post(`/admin/people/customers/${id}/status`, { status: "ACTIVE" }), "Customer reactivated")}>Reactivate</Button>
            : c.status !== "DELETED" && <Button variant="danger" onClick={() => { const r = prompt("Reason for suspension"); if (r) void run(() => api.post(`/admin/people/customers/${id}/status`, { status: "SUSPENDED", reason: r }), "Customer suspended"); }}>Suspend</Button>}
        </Can>} />
      {c.status === "DELETION_REQUESTED" && (
        <InlineAlert tone="warning" className="mb-6 flex flex-wrap items-center justify-between gap-3">Account deletion requested on {dt(c.deletionRequestedAt)}.
          <Can any={["customers.manage"]}><Button size="sm" variant="danger" onClick={() => confirmAction("Anonymise this customer's personal data? Orders are kept for accounting. This cannot be undone.") && void run(() => api.post(`/admin/people/customers/${id}/anonymize`), "Customer anonymised")}>Process deletion</Button></Can>
        </InlineAlert>
      )}
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="p-5"><KeyValue items={[["Phone", `${c.phone ?? "—"} ${c.phoneVerifiedAt ? "✓" : ""}`], ["Email", `${c.email ?? "—"} ${c.emailVerifiedAt ? "✓" : ""}`], ["Joined", dt(c.createdAt, false)], ["Last login", dt(c.lastLoginAt)], ["Points", `${c.loyaltyPoints} (${tierFor(c.lifetimePoints).name})`], ["Referral code", c.referralCode], ["Marketing", c.profile?.marketingOptIn ? "Opted in" : "Opted out"], ["Birthday", dt(c.profile?.dateOfBirth ?? null, false)]]} /></Card>
        <Card className="p-5 xl:col-span-2">
          <h2 className="mb-3 font-display text-lg font-semibold">Recent orders</h2>
          <ul className="divide-y divide-line-soft text-sm">{c.orders.map((o) => <li key={o.id}><Link href={`/orders/${o.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-surface-2"><span className="font-mono font-semibold text-ink">{o.orderNumber}</span><span className="text-xs text-muted">{dt(o.createdAt)}</span><OrderStatusBadge status={o.status} /><b>{formatINR(o.totalPaise)}</b></Link></li>)}</ul>
          {c.orders.length === 0 && <p className="text-sm text-muted">No orders yet.</p>}
        </Card>
        <Card className="p-5"><h2 className="mb-3 font-display text-lg font-semibold">Addresses</h2>{c.addresses.map((a) => <p key={a.id} className="mb-2 text-sm text-ink-soft"><b>{a.type.toLowerCase()}</b> · {a.line1}, {a.city} {a.pincode}</p>)}</Card>
        <Card className="p-5"><h2 className="mb-3 font-display text-lg font-semibold">Points activity</h2>{c.loyaltyTransactions.map((t) => <p key={t.id} className="flex justify-between text-sm"><span className="truncate text-ink-soft">{t.description}</span><b className={t.points > 0 ? "text-pista-600" : "text-maroon-600"}>{t.points > 0 ? "+" : ""}{t.points}</b></p>)}</Card>
        <Card className="p-5"><h2 className="mb-3 font-display text-lg font-semibold">Support & reviews</h2>{c.tickets.map((t) => <Link key={t.id} href={`/support/${t.id}`} className="block text-sm text-ink-soft hover:underline">{t.ticketNumber} · {t.subject} <Badge>{t.status.toLowerCase()}</Badge></Link>)}{c.reviews.map((r) => <p key={r.id} className="text-sm text-ink-soft">{r.rating}★ {r.product.name} <Badge>{r.status.toLowerCase()}</Badge></p>)}</Card>
      </div>
      <Modal open={pts.open} onClose={() => setPts({ ...pts, open: false })} title="Adjust Mithaas points" footer={<div className="flex justify-end"><Button onClick={() => void run(async () => { await api.post(`/admin/people/customers/${id}/points`, { points: Number(pts.points), reason: pts.reason }); setPts({ open: false, points: "", reason: "" }); }, "Points adjusted")}>Apply</Button></div>}>
        <div className="space-y-4"><Field label="Points (+ to add, − to deduct)">{(p) => <Input {...p} type="number" value={pts.points} onChange={(e) => setPts({ ...pts, points: e.target.value })} />}</Field><Field label="Reason">{(p) => <Input {...p} value={pts.reason} onChange={(e) => setPts({ ...pts, reason: e.target.value })} />}</Field></div>
      </Modal>
    </Guard>
  );
}
