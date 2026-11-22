"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Lock, Send } from "lucide-react";
import { toast } from "sonner";
import { TICKET_PRIORITIES, TICKET_STATUSES } from "@naamdev/shared";
import { Button, Card, Checkbox, Field, Select, Skeleton, Textarea, cn } from "@naamdev/ui";
import { Can, Guard, KeyValue, PageHeader } from "@/components/kit";
import { api, dt, errorMessage } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { useRouteParam } from "@/lib/route-param";

interface Tk { id: string; ticketNumber: string; subject: string; category: string; priority: string; status: string; guestName: string | null; guestEmail: string | null; guestPhone: string | null; createdAt: string;
  messages: { id: string; body: string; authorType: string; isInternal: boolean; createdAt: string; author: { name: string } | null }[]; user: { id: string; name: string; email: string | null; phone: string | null } | null; assignedTo: { id: string; name: string } | null; order: { id: string; orderNumber: string; status: string; totalPaise: number } | null }

export default function TicketPage() {
  const id = useRouteParam("id");
  const { data, reload } = useResource<{ ticket: Tk; agents: { id: string; name: string }[] }>(`/admin/people/tickets/${id}`);
  const [msg, setMsg] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!data) return <Skeleton className="h-[60vh]" />;
  const t = data.ticket;
  const patch = async (body: object) => { try { await api.patch(`/admin/people/tickets/${id}`, body); toast.success("Ticket updated"); void reload(); } catch (e) { toast.error(errorMessage(e)); } };
  return (
    <Guard any={["support.view"]}>
      <PageHeader back={<Link href="/support" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-muted"><ArrowLeft className="h-3.5 w-3.5" />Tickets</Link>} title={t.subject} subtitle={`${t.ticketNumber} · opened ${dt(t.createdAt)}`} />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div>
          <Card className="space-y-3 p-5">
            {t.messages.map((m) => (
              <div key={m.id} className={cn("max-w-[85%] rounded-2xl px-4 py-3", m.isInternal ? "ml-auto border border-dashed border-gold-400 bg-gold-300/15" : m.authorType === "STAFF" ? "ml-auto bg-surface-2 " : "bg-surface-2")}>
                <p className="flex items-center gap-1 text-xs font-semibold text-muted">{m.isInternal && <Lock className="h-3 w-3" />}{m.author?.name ?? (m.authorType === "SYSTEM" ? t.guestName ?? "Guest" : "Customer")} · {dt(m.createdAt)}</p>
                <p className="mt-1 whitespace-pre-line text-sm text-ink">{m.body}</p>
              </div>
            ))}
          </Card>
          <Can any={["support.manage"]}>
            <Card className="mt-4 p-4">
              <Textarea rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={internal ? "Internal note (customer won't see this)" : "Reply to customer…"} aria-label="Reply" />
              <div className="mt-3 flex items-center justify-between">
                <Checkbox checked={internal} onChange={setInternal} label="Internal note" />
                <Button loading={busy} disabled={!msg.trim()} onClick={async () => { setBusy(true); try { await api.post(`/admin/people/tickets/${id}/messages`, { body: msg, isInternal: internal }); setMsg(""); void reload(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); } }}><Send className="h-4 w-4" />{internal ? "Add note" : "Send reply"}</Button>
              </div>
            </Card>
          </Can>
        </div>
        <aside className="space-y-4">
          <Card className="space-y-4 p-5">
            <Field label="Status">{(p) => <Select {...p} value={t.status} onChange={(e) => void patch({ status: e.target.value })}>{TICKET_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ").toLowerCase()}</option>)}</Select>}</Field>
            <Field label="Priority">{(p) => <Select {...p} value={t.priority} onChange={(e) => void patch({ priority: e.target.value })}>{TICKET_PRIORITIES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</Select>}</Field>
            <Field label="Assignee">{(p) => <Select {...p} value={t.assignedTo?.id ?? ""} onChange={(e) => void patch({ assignedToId: e.target.value || null })}><option value="">Unassigned</option>{data.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>}</Field>
          </Card>
          <Card className="p-5">
            <KeyValue items={[["Customer", t.user ? <Link key="u" href={`/customers/${t.user.id}`} className="text-maroon-700">{t.user.name}</Link> : `${t.guestName} (guest)`], ["Contact", t.user?.phone ?? t.guestPhone ?? t.user?.email ?? t.guestEmail], ["Category", t.category.replace(/_/g, " ").toLowerCase()], ["Order", t.order ? <Link key="o" href={`/orders/${t.order.id}`} className="font-mono text-maroon-700">{t.order.orderNumber}</Link> : "—"]]} />
          </Card>
        </aside>
      </div>
    </Guard>
  );
}
