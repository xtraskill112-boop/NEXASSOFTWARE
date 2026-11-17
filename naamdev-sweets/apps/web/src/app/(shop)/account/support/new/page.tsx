"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import type { Order, Paged } from "@naamdev/api-client";
import { TICKET_CATEGORIES } from "@naamdev/shared";
import { Button, Card, Field, Input, Select, Textarea } from "@naamdev/ui";
import { PageTitle } from "@/components/account/nav";
import { ApiError, api, errorMessage } from "@/lib/api";

function NewTicket() {
  const router = useRouter();
  const sp = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [f, setF] = useState({ subject: "", category: sp.get("orderId") ? "ORDER" : "OTHER", orderId: sp.get("orderId") ?? "", message: "" });
  const [fe, setFe] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get<Paged<Order>>("/orders", { query: { pageSize: 20 } }).then((r) => setOrders(r.items)); }, []);
  return (
    <div className="max-w-2xl">
      <PageTitle title="Raise a ticket" />
      <Card className="p-6">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setFe({});
          try { const r = await api.post<{ ticket: { id: string } }>("/support/tickets", { ...f, orderId: f.orderId || null }); toast.success("Ticket created"); router.replace(`/account/support/${r.ticket.id}`); }
          catch (err) { if (err instanceof ApiError) setFe(err.fieldErrors); toast.error(errorMessage(err)); } finally { setBusy(false); }
        }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Topic">{(p) => <Select {...p} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{TICKET_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ").toLowerCase().replace(/^\w/, (x) => x.toUpperCase())}</option>)}</Select>}</Field>
            <Field label="Related order (optional)">{(p) => <Select {...p} value={f.orderId} onChange={(e) => setF({ ...f, orderId: e.target.value })}><option value="">None</option>{orders.map((o) => <option key={o.id} value={o.id}>{o.orderNumber}</option>)}</Select>}</Field>
          </div>
          <Field label="Subject" error={fe.subject}>{(p) => <Input {...p} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />}</Field>
          <Field label="How can we help?" error={fe.message}>{(p) => <Textarea {...p} rows={5} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />}</Field>
          <Button type="submit" size="lg" loading={busy}>Submit</Button>
        </form>
      </Card>
    </div>
  );
}
export default function Page() { return <Suspense><NewTicket /></Suspense>; }
