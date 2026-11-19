"use client";
import { useEffect, useState } from "react";
import { formatINR } from "@naamdev/shared";
import { Badge, Card, EmptyState, Pagination, Skeleton } from "@naamdev/ui";
import { History } from "lucide-react";
import { api, time } from "@/lib/api";
import type { Assignment } from "@/lib/types";

export default function HistoryPage() {
  const [page, setPage] = useState(1);
  const [d, setD] = useState<{ items: Assignment[]; meta: { totalPages: number } } | null>(null);
  useEffect(() => { api.get<{ items: Assignment[]; meta: { totalPages: number } }>("/delivery/assignments/history", { query: { page } }).then(setD); }, [page]);
  if (!d) return <Skeleton className="h-96" />;
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-semibold text-ink">Delivery history</h1>
      {d.items.length === 0 ? <EmptyState icon={<History className="h-7 w-7" />} title="No deliveries yet" /> : d.items.map((a) => (
        <Card key={a.assignmentId} className="p-4">
          <div className="flex items-center justify-between"><span className="font-mono font-bold text-ink">{a.orderNumber}</span><Badge tone={a.status === "DELIVERED" ? "success" : "neutral"}>{a.status.toLowerCase()}</Badge></div>
          <p className="mt-1 text-sm text-muted">{a.drop.area}</p>
          <p className="mt-1 flex justify-between text-sm"><span className="text-muted">{time(a.deliveredAt ?? a.acceptedAt)}</span>{a.status === "DELIVERED" && <b className="text-ink">{formatINR(a.earningPaise)} · {a.distanceKm} km</b>}</p>
        </Card>
      ))}
      <Pagination page={page} totalPages={d.meta.totalPages} onChange={setPage} />
    </div>
  );
}
