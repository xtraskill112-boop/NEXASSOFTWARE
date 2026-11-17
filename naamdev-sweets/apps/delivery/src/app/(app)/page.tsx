"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, Clock, IndianRupee, MapPin, Navigation, Package, Trophy } from "lucide-react";
import { toast } from "sonner";
import { formatINR } from "@naamdev/shared";
import { Button, Card, EmptyState, InlineAlert, Switch, cn } from "@naamdev/ui";
import { api, errorMessage } from "@/lib/api";
import { usePartner } from "@/lib/partner";
import type { Assignment } from "@/lib/types";

function Countdown({ until }: { until: string | null }) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!until) return;
    const tick = () => setS(Math.max(0, Math.round((new Date(until).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [until]);
  return <span className={cn("tabular-nums", s < 20 && "text-maroon-600")}>{s}s</span>;
}

function OfferCard({ o }: { o: Assignment }) {
  const { refresh } = usePartner();
  const [busy, setBusy] = useState<"a" | "r" | null>(null);
  const respond = async (accept: boolean) => {
    setBusy(accept ? "a" : "r");
    try { await api.post(`/delivery/assignments/${o.assignmentId}/${accept ? "accept" : "reject"}`, accept ? {} : { reason: "Declined by partner" }); toast.success(accept ? "Delivery accepted — head to the store" : "Request declined"); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); void refresh(); }
  };
  return (
    <Card className="overflow-hidden border-2 border-saffron-400">
      <div className="nd-gradient-saffron flex items-center justify-between px-4 py-2 text-white"><span className="text-sm font-bold">New delivery request</span><span className="flex items-center gap-1 text-sm font-bold"><Clock className="h-4 w-4" /><Countdown until={o.offerExpiresAt} /></span></div>
      <div className="space-y-3 p-4">
        <div className="flex items-end justify-between"><div><p className="text-xs font-semibold uppercase text-muted">You earn</p><p className="font-display text-3xl font-semibold text-ink">{formatINR(o.earningPaise)}</p></div><div className="text-right"><p className="text-xs text-muted">Distance</p><p className="text-lg font-bold text-ink">{o.distanceKm ?? "–"} km</p></div></div>
        <div className="space-y-2 text-sm">
          <p className="flex gap-2"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-maroon-700" /><span><b className="text-ink">Pickup</b> · {o.pickup?.name}</span></p>
          <p className="flex gap-2"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-pista-600" /><span><b className="text-ink">Drop</b> · {o.drop.area}</span></p>
          {o.collectPaise > 0 && <p className="rounded-lg bg-gold-300/20 px-3 py-1.5 text-xs font-bold text-gold-600">Cash on delivery: collect {formatINR(o.collectPaise)}</p>}
        </div>
        <div className="grid grid-cols-2 gap-2"><Button variant="outline" loading={busy === "r"} onClick={() => void respond(false)}>Decline</Button><Button loading={busy === "a"} onClick={() => void respond(true)}>Accept</Button></div>
      </div>
    </Card>
  );
}

const STEP_LABEL: Record<string, string> = { ACCEPTED: "Head to store", AT_STORE: "Waiting for handover", PICKED_UP: "Start delivery", OUT_FOR_DELIVERY: "Delivering" };

export default function Home() {
  const { me, partner, earnings, offers, active, setOnline, gps } = usePartner();
  if (!partner || !earnings) return <div className="space-y-4"><Card className="h-28 nd-shimmer" /><Card className="h-40 nd-shimmer" /></div>;
  const approved = partner.status === "APPROVED";
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted">Namaste,</p>
        <h1 className="font-display text-3xl font-semibold text-ink">{me?.name.split(" ")[0]} 👋</h1>
      </div>
      {!approved && (
        <InlineAlert tone={partner.status === "PENDING" ? "warning" : "danger"}>
          {partner.status === "PENDING" ? (partner.missingDocuments.length ? <>Upload your documents to get verified: {partner.missingDocuments.map((d) => d.replace("_", " ").toLowerCase()).join(", ")}. <Link href="/profile" className="font-bold underline">Upload now</Link></> : "Your documents are under review. You'll be notified once approved.")
            : `Account ${partner.status.toLowerCase()}${partner.statusReason ? `: ${partner.statusReason}` : ""}. Contact partner support.`}
        </InlineAlert>
      )}
      <Card className={cn("flex items-center justify-between gap-4 p-5", partner.isOnline && "ring-2 ring-pista-500")}>
        <div>
          <p className="font-display text-xl font-semibold text-ink">{partner.isOnline ? "You're online" : "You're offline"}</p>
          <p className="text-sm text-muted">{partner.isOnline ? (gps === "ok" ? "Live location is being shared" : gps === "denied" ? "Allow location access to receive orders" : "Getting your location…") : "Go online to receive delivery requests"}</p>
        </div>
        <Switch size="lg" checked={partner.isOnline} disabled={!approved} onChange={(v) => void setOnline(v)} label="Online" />
      </Card>
      {gps === "denied" && <InlineAlert tone="danger"><AlertTriangle className="mr-1 inline h-4 w-4" />Location permission is blocked. Enable it in your browser settings — customers need it to track their order.</InlineAlert>}

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center"><IndianRupee className="mx-auto h-4 w-4 text-saffron-600" /><p className="mt-1 font-bold text-ink">{formatINR(earnings.todayPaise)}</p><p className="text-[11px] text-muted">Today</p></Card>
        <Card className="p-3 text-center"><Package className="mx-auto h-4 w-4 text-saffron-600" /><p className="mt-1 font-bold text-ink">{earnings.deliveriesToday}</p><p className="text-[11px] text-muted">Deliveries</p></Card>
        <Card className="p-3 text-center"><Trophy className="mx-auto h-4 w-4 text-saffron-600" /><p className="mt-1 font-bold text-ink">{earnings.incentive.progress}/{earnings.incentive.target}</p><p className="text-[11px] text-muted">Bonus target</p></Card>
      </div>
      {earnings.incentive.target > 0 && (
        <div><div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full nd-gradient-saffron" style={{ width: `${(earnings.incentive.progress / earnings.incentive.target) * 100}%` }} /></div>
          <p className="mt-1 text-xs text-muted">{earnings.incentive.achieved ? `🎉 Daily bonus of ${formatINR(earnings.incentive.bonusPaise)} earned!` : `Complete ${earnings.incentive.target - earnings.incentive.progress} more to earn a ${formatINR(earnings.incentive.bonusPaise)} bonus`}</p></div>
      )}

      {offers.length > 0 && <div className="space-y-3">{offers.map((o) => <OfferCard key={o.assignmentId} o={o} />)}</div>}

      <section>
        <h2 className="mb-3 font-display text-xl font-semibold text-ink">Active deliveries</h2>
        {active.length === 0 ? (
          <EmptyState icon={<Navigation className="h-7 w-7" />} title={partner.isOnline ? "Waiting for requests" : "No active deliveries"} description={partner.isOnline ? "Stay near the store — new requests pop up here with a sound." : undefined} className="rounded-3xl border border-dashed border-line py-10" />
        ) : active.map((a) => (
          <Link key={a.assignmentId} href={`/delivery/${a.assignmentId}`}>
            <Card interactive className="mb-3 p-4">
              <div className="flex items-center justify-between"><span className="font-mono font-bold text-ink">{a.orderNumber}</span><span className="rounded-full bg-saffron-50 px-2.5 py-1 text-xs font-bold text-saffron-800 dark:bg-saffron-500/10 dark:text-saffron-200">{STEP_LABEL[a.status] ?? a.status}</span></div>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-soft"><MapPin className="h-4 w-4 text-pista-600" />{a.customer?.address ?? a.drop.area}</p>
              <div className="mt-2 flex items-center justify-between text-sm"><span className="font-semibold text-ink">{formatINR(a.earningPaise)}{a.collectPaise > 0 ? ` · collect ${formatINR(a.collectPaise)}` : ""}</span><ChevronRight className="h-4 w-4 text-muted" /></div>
            </Card>
          </Link>
        ))}
      </section>
    </div>
  );
}
