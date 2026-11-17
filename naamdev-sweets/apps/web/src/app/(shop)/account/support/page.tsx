"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LifeBuoy, Plus } from "lucide-react";
import { Badge, Card, EmptyState, Skeleton, buttonStyles } from "@naamdev/ui";
import { PageTitle } from "@/components/account/nav";
import { api } from "@/lib/api";

interface T { id: string; ticketNumber: string; subject: string; status: string; category: string; lastActivityAt: string; order: { orderNumber: string } | null }
const tone = (s: string) => (s === "RESOLVED" || s === "CLOSED" ? "success" : s === "AWAITING_CUSTOMER" ? "warning" : "info") as "success" | "warning" | "info";

export default function SupportPage() {
  const [list, setList] = useState<T[] | null>(null);
  useEffect(() => { api.get<{ items: T[] }>("/support/tickets").then((r) => setList(r.items)); }, []);
  return (
    <div className="max-w-3xl">
      <PageTitle title="Help & support" subtitle="We usually reply within a few hours" action={<Link href="/account/support/new" className={buttonStyles()}><Plus className="h-4 w-4" />New ticket</Link>} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[["Where is my order?", "/account/orders"], ["Refund & returns", "/pages/refund-policy"], ["FAQs", "/faqs"]].map(([l, h]) => <Link key={h} href={h!} className="rounded-2xl border border-line-soft bg-surface p-4 text-sm font-semibold text-ink shadow-sm hover:shadow-card">{l} →</Link>)}
      </div>
      {!list ? <Skeleton className="h-40" /> : list.length === 0 ? <EmptyState icon={<LifeBuoy className="h-8 w-8" />} title="No tickets yet" description="Raise a ticket and our team will get back to you." /> : (
        <div className="space-y-3">
          {list.map((t) => (
            <Link key={t.id} href={`/account/support/${t.id}`}>
              <Card interactive className="mb-3 p-4">
                <div className="flex items-center justify-between gap-3"><span className="font-mono text-xs font-bold text-muted">{t.ticketNumber}</span><Badge tone={tone(t.status)}>{t.status.replace(/_/g, " ").toLowerCase()}</Badge></div>
                <p className="mt-1 font-semibold text-ink">{t.subject}</p>
                <p className="text-xs text-muted">{t.category.replace(/_/g, " ").toLowerCase()}{t.order ? ` · ${t.order.orderNumber}` : ""} · updated {new Date(t.lastActivityAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
