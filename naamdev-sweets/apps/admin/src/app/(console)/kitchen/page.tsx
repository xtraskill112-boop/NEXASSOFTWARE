"use client";
import Link from "next/link";
import { toast } from "sonner";
import { ORDER_STATUS_META, nextStatuses, type OrderStatus } from "@naamdev/shared";
import { Button, Card, EmptyState, Skeleton } from "@naamdev/ui";
import { ChefHat } from "lucide-react";
import { Guard, PageHeader } from "@/components/kit";
import { api, dt, errorMessage } from "@/lib/api";
import { useAdminRealtime } from "@/lib/realtime";
import { useResource } from "@/lib/use-resource";

interface Row { id: string; orderNumber: string; status: OrderStatus; createdAt: string; itemsSummary: string; customerName: string; partner: { name: string; status: string } | null }
const COLUMNS: { title: string; statuses: OrderStatus[] }[] = [
  { title: "New", statuses: ["CONFIRMED"] },
  { title: "Preparing", statuses: ["PROCESSING", "PREPARING"] },
  { title: "Packed", statuses: ["PACKED", "READY_FOR_PICKUP"] },
];
const NEXT: Partial<Record<OrderStatus, OrderStatus>> = { CONFIRMED: "PREPARING", PROCESSING: "PREPARING", PREPARING: "PACKED", PACKED: "READY_FOR_PICKUP" };

/** Touch-friendly kitchen display for packing staff. */
export default function KitchenBoard() {
  const { tick } = useAdminRealtime();
  const { data, reload } = useResource<{ items: Row[] }>("/admin/orders", { status: "CONFIRMED,PROCESSING,PREPARING,PACKED,READY_FOR_PICKUP", pageSize: 100, t: tick });
  const advance = async (o: Row) => {
    const to = NEXT[o.status];
    if (!to || !nextStatuses(o.status).includes(to)) return;
    try { await api.post(`/admin/orders/${o.id}/status`, { status: to }); toast.success(`${o.orderNumber} → ${ORDER_STATUS_META[to].label}`); void reload(); } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <Guard any={["orders.process"]}>
      <PageHeader title="Kitchen board" subtitle="Tap to move orders through preparation. Updates live." />
      {!data ? <Skeleton className="h-96" /> : (
        <div className="grid gap-4 lg:grid-cols-3">
          {COLUMNS.map((c) => {
            const rows = data.items.filter((o) => c.statuses.includes(o.status)).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
            return (
              <div key={c.title} className="rounded-3xl bg-surface-2/60 p-3">
                <h2 className="mb-3 flex items-center justify-between px-2 font-display text-lg font-semibold text-ink">{c.title}<span className="rounded-full bg-surface px-2.5 text-sm">{rows.length}</span></h2>
                {rows.length === 0 ? <EmptyState icon={<ChefHat className="h-6 w-6" />} title="All clear" className="py-8" /> : (
                  <div className="space-y-3">
                    {rows.map((o) => (
                      <Card key={o.id} className="p-4">
                        <div className="flex items-center justify-between"><Link href={`/orders/${o.id}`} className="font-mono font-bold text-ink hover:underline">{o.orderNumber}</Link><span className="text-xs text-muted">{dt(o.createdAt)}</span></div>
                        <p className="mt-2 text-sm text-ink-soft">{o.itemsSummary}</p>
                        <p className="mt-1 text-xs text-muted">{o.customerName}{o.partner ? ` · rider ${o.partner.name} (${o.partner.status.toLowerCase()})` : ""}</p>
                        <div className="mt-3 flex gap-2">
                          {NEXT[o.status] && <Button size="sm" onClick={() => void advance(o)}>Mark {ORDER_STATUS_META[NEXT[o.status]!].label.toLowerCase()}</Button>}
                          <Link href={`/orders/${o.id}/slip`} target="_blank" className="inline-flex h-9 items-center rounded-xl px-3 text-sm font-semibold text-ink-soft hover:bg-surface-2">Packing slip</Link>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Guard>
  );
}
