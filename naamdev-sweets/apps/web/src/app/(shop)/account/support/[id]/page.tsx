"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, Skeleton, Textarea, cn } from "@naamdev/ui";
import { PageTitle } from "@/components/account/nav";
import { api, errorMessage } from "@/lib/api";

interface Ticket { id: string; ticketNumber: string; subject: string; status: string; messages: { id: string; body: string; authorType: string; createdAt: string; author: { name: string } | null }[]; order: { orderNumber: string } | null }

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const [t, setT] = useState<Ticket | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => api.get<{ ticket: Ticket }>(`/support/tickets/${id}`).then((r) => setT(r.ticket));
  useEffect(() => { void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!t) return <Skeleton className="h-80" />;
  return (
    <div className="max-w-3xl">
      <PageTitle title={t.subject} subtitle={`${t.ticketNumber}${t.order ? ` · Order ${t.order.orderNumber}` : ""}`} action={<Badge tone="info">{t.status.replace(/_/g, " ").toLowerCase()}</Badge>} />
      <Card className="space-y-4 p-5">
        {t.messages.map((m) => (
          <div key={m.id} className={cn("max-w-[85%] rounded-2xl px-4 py-3", m.authorType === "CUSTOMER" ? "ml-auto bg-saffron-50 dark:bg-saffron-500/10" : "bg-surface-2")}>
            <p className="text-xs font-semibold text-muted">{m.authorType === "CUSTOMER" ? "You" : `${m.author?.name ?? "NAAMDEV"} · Support`} · {new Date(m.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</p>
            <p className="mt-1 whitespace-pre-line text-sm text-ink">{m.body}</p>
          </div>
        ))}
      </Card>
      {t.status !== "CLOSED" && (
        <form className="mt-4 flex gap-2" onSubmit={async (e) => {
          e.preventDefault(); if (!msg.trim()) return; setBusy(true);
          try { await api.post(`/support/tickets/${id}/messages`, { body: msg }); setMsg(""); void load(); } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
        }}>
          <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={2} placeholder="Write a reply…" className="min-h-[52px]" aria-label="Reply" />
          <Button type="submit" size="icon" loading={busy} aria-label="Send"><Send className="h-4 w-4" /></Button>
        </form>
      )}
    </div>
  );
}
