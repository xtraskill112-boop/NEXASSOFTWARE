"use client";
import Link from "next/link";
import { useEffect } from "react";
import { Bike, Store } from "lucide-react";
import { haversineKm } from "@naamdev/shared";
import { Badge, Card, EmptyState } from "@naamdev/ui";
import { Guard, PageHeader } from "@/components/kit";
import { dt } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

interface Live { partners: { id: string; name: string; phone: string | null; lat: number | null; lng: number | null; lastLocationAt: string | null; vehicleType: string; assignments: { id: string; status: string; orderId: string; orderNumber: string }[] }[]; store: { lat: number; lng: number; name: string } | null }

/** Live fleet view: online partners plotted to scale around the kitchen using real GPS. */
export default function LiveDelivery() {
  const { data, reload } = useResource<Live>("/admin/people/partners/live");
  // Riders report GPS every few seconds; the board refreshes every 10 s.
  useEffect(() => {
    const id = setInterval(() => void reload(), 10_000);
    return () => clearInterval(id);
  }, [reload]);
  if (!data) return null;
  const store = data.store;
  const partners = data.partners.filter((p) => p.lat != null && p.lng != null);
  const R = Math.max(2, ...partners.map((p) => (store ? haversineKm(store, { lat: p.lat!, lng: p.lng! }) : 0))) * 1.15;
  const place = (lat: number, lng: number) => {
    if (!store) return { x: 50, y: 50 };
    const kmX = (lng - store.lng) * 111.32 * Math.cos((store.lat * Math.PI) / 180), kmY = (lat - store.lat) * 110.57;
    return { x: 50 + (kmX / R) * 46, y: 50 - (kmY / R) * 46 };
  };
  return (
    <Guard any={["delivery.manage"]}>
      <PageHeader title="Live delivery" subtitle={`${data.partners.length} partner(s) online · positions refresh every 10 seconds`} />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="relative aspect-square overflow-hidden bg-[radial-gradient(circle,var(--nd-surface-2)_0%,var(--nd-surface)_70%)] xl:aspect-[4/3]">
          {[0.25, 0.5, 0.75, 1].map((f) => <div key={f} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-line" style={{ width: `${f * 92}%`, height: `${f * 92}%` }}><span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-surface px-1 text-[10px] text-muted">{(R * f).toFixed(1)} km</span></div>)}
          <div className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-maroon-700 text-saffron-100 shadow-lg ring-4 ring-white dark:ring-black/40" title={store?.name}><Store className="h-5 w-5" /></div>
          {partners.map((p) => {
            const { x, y } = place(p.lat!, p.lng!);
            const busy = p.assignments.some((a) => a.status !== "OFFERED");
            return (
              <div key={p.id} className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-700" style={{ left: `${x}%`, top: `${y}%` }}>
                <span className={`grid h-9 w-9 place-items-center rounded-full text-white shadow-lg ring-4 ring-white dark:ring-black/40 ${busy ? "bg-saffron-600" : "bg-pista-600"}`} title={p.name}><Bike className="h-4 w-4" /></span>
                <span className="absolute left-1/2 top-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink/80 px-1.5 text-[10px] font-semibold text-bg">{p.name.split(" ")[0]}</span>
              </div>
            );
          })}
          {!store && <p className="absolute bottom-3 left-3 text-xs text-muted">Set the store location in Settings to anchor this view.</p>}
          <div className="absolute bottom-3 right-3 flex gap-3 rounded-xl bg-surface/90 px-3 py-2 text-[11px] font-semibold"><span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-pista-600" />Free</span><span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-saffron-600" />On delivery</span></div>
        </Card>
        <div className="space-y-3">
          {data.partners.length === 0 ? <EmptyState icon={<Bike className="h-7 w-7" />} title="No partners online" description="Partners appear here when they go online in the delivery app." /> : data.partners.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-center justify-between"><Link href={`/delivery/partners/${p.id}`} className="font-semibold text-ink hover:underline">{p.name}</Link><span className="text-xs text-muted">GPS {dt(p.lastLocationAt)}</span></div>
              <p className="text-xs text-muted">{p.phone} · {p.vehicleType.toLowerCase()}</p>
              <div className="mt-2 flex flex-wrap gap-1">{p.assignments.length === 0 ? <Badge tone="success">Available</Badge> : p.assignments.map((a) => <Link key={a.id} href={`/orders/${a.orderId}`}><Badge tone="brand">{a.orderNumber} · {a.status.toLowerCase().replace(/_/g, " ")}</Badge></Link>)}</div>
            </Card>
          ))}
        </div>
      </div>
    </Guard>
  );
}
