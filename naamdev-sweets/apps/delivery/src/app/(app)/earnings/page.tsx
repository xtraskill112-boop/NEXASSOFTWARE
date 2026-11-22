"use client";
import { useEffect, useState } from "react";
import { formatINR } from "@naamdev/shared";
import { Badge, Card, Pagination, Skeleton } from "@naamdev/ui";
import { api, time } from "@/lib/api";
import type { Earnings } from "@/lib/types";

interface E { id: string; type: string; amountPaise: number; description: string; isSettled: boolean; createdAt: string }

export default function EarningsPage() {
  const [page, setPage] = useState(1);
  const [d, setD] = useState<{ summary: Earnings; items: E[]; meta: { totalPages: number } } | null>(null);
  useEffect(() => { api.get<typeof d & object>("/delivery/earnings", { query: { page } }).then(setD); }, [page]);
  if (!d) return <Skeleton className="h-96" />;
  const s = d.summary;
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-semibold text-ink">Earnings</h1>
      <Card className="nd-gradient-maroon border-0 p-5 text-cream-100">
        <p className="text-[13px] font-semibold text-cream-200">Payout due</p>
        <p className="mt-1 font-display text-4xl font-semibold">{formatINR(s.unsettledPaise)}</p>
        <p className="mt-1 text-xs text-cream-200/75">Settled weekly to your bank/UPI by the store.</p>
      </Card>
      <div className="grid grid-cols-3 gap-3">{[["Today", s.todayPaise], ["7 days", s.last7DaysPaise], ["30 days", s.last30DaysPaise]].map(([l, v]) => <Card key={l as string} className="p-3 text-center"><p className="font-bold text-ink">{formatINR(v as number)}</p><p className="text-[11px] text-muted">{l}</p></Card>)}</div>
      <Card className="divide-y divide-line-soft">
        {d.items.length === 0 ? <p className="p-5 text-sm text-muted">No earnings yet — complete deliveries to start earning.</p> : d.items.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{e.description}</p><p className="text-xs text-muted">{time(e.createdAt)} · {e.type.replace("_", " ").toLowerCase()}</p></div>
            <div className="text-right"><p className="font-bold text-pista-600">+{formatINR(e.amountPaise)}</p><Badge tone={e.isSettled ? "success" : "warning"}>{e.isSettled ? "paid" : "due"}</Badge></div>
          </div>
        ))}
      </Card>
      <Pagination page={page} totalPages={d.meta.totalPages} onChange={setPage} />
    </div>
  );
}
