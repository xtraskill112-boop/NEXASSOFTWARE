"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRouteParam } from "@/lib/route-param";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, MapPin, Navigation, Phone, Store } from "lucide-react";
import { toast } from "sonner";
import { formatINR } from "@naamdev/shared";
import { Button, Card, Checkbox, InlineAlert, Skeleton, cn } from "@naamdev/ui";
import { api, errorMessage, time } from "@/lib/api";
import { usePartner } from "@/lib/partner";
import type { Assignment } from "@/lib/types";

const STEPS = ["ACCEPTED", "AT_STORE", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED"];
const STEP_NAMES = ["Accepted", "At store", "Picked up", "On the way", "Delivered"];

export default function DeliveryPage() {
  const id = useRouteParam("id");
  const router = useRouter();
  const { refresh } = usePartner();
  const [a, setA] = useState<Assignment | null>(null);
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState("");
  const [cash, setCash] = useState(false);
  const load = () => api.get<{ assignment: Assignment }>(`/delivery/assignments/${id}`).then((r) => setA(r.assignment)).catch((e) => toast.error(errorMessage(e)));
  useEffect(() => { void load(); const t = setInterval(() => void load(), 15000); return () => clearInterval(t); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!a) return <Skeleton className="h-96" />;
  const step = STEPS.indexOf(a.status);
  const act = async (path: string, body: object = {}, msg = "Updated") => {
    setBusy(true);
    try { const r = await api.post<{ assignment: Assignment }>(`/delivery/assignments/${id}/${path}`, body); setA(r.assignment); toast.success(msg); void refresh(); if (r.assignment.status === "DELIVERED") setTimeout(() => router.push("/"), 1500); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <Link href="/" className="inline-flex items-center gap-1 text-sm font-semibold text-muted"><ArrowLeft className="h-4 w-4" />Home</Link>
      <div className="flex items-center justify-between"><h1 className="font-mono text-2xl font-bold text-ink">{a.orderNumber}</h1><span className="text-lg font-bold text-ink">{formatINR(a.earningPaise)}</span></div>
      <div className="flex items-center">
        {STEP_NAMES.map((n, i) => (
          <div key={n} className="flex flex-1 flex-col items-center gap-1 text-center">
            <span className={cn("grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold", i <= step ? "bg-maroon-700 text-white" : "bg-surface-2 text-muted")}>{i < step || a.status === "DELIVERED" ? "✓" : i + 1}</span>
            <span className="text-[10px] font-semibold text-muted">{n}</span>
          </div>
        ))}
      </div>

      {a.status === "DELIVERED" && <InlineAlert tone="success"><CheckCircle2 className="mr-1 inline h-4 w-4" />Delivered at {time(a.deliveredAt)}. Great job!</InlineAlert>}

      <Card className="p-4">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-muted"><Store className="h-4 w-4" />Pickup</p>
        <p className="mt-1 font-semibold text-ink">{a.pickup?.name}</p>
        <p className="text-sm text-muted">{a.pickup?.address}</p>
        {a.navigation.toStore && step <= 1 && <a href={a.navigation.toStore} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-surface-2 px-3 py-2 text-sm font-bold text-ink"><Navigation className="h-4 w-4" />Navigate to store</a>}
        <ul className="mt-3 space-y-1 border-t border-line-soft pt-3 text-sm">{a.items.map((i, k) => <li key={k} className="flex justify-between"><span className="text-ink-soft">{i.productName} · {i.variantLabel}</span><b>×{i.quantity}</b></li>)}</ul>
      </Card>

      {a.customer && (
        <Card className="p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-muted"><MapPin className="h-4 w-4" />Deliver to</p>
          <p className="mt-1 font-semibold text-ink">{a.customer.name}</p>
          <p className="text-sm text-muted">{a.customer.address}</p>
          {a.customer.instructions && <p className="mt-2 rounded-lg bg-gold-300/20 px-3 py-2 text-sm">“{a.customer.instructions}”</p>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a href={`tel:${a.customer.phone}`} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-pista-600 px-3 py-2.5 text-sm font-bold text-white"><Phone className="h-4 w-4" />Call</a>
            <a href={a.navigation.toCustomer} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-surface-2 px-3 py-2.5 text-sm font-bold text-ink"><Navigation className="h-4 w-4" />Navigate</a>
          </div>
        </Card>
      )}

      {a.collectPaise > 0 && a.status !== "DELIVERED" && <InlineAlert tone="warning">Cash on delivery — collect <b>{formatINR(a.collectPaise)}</b> (cash or UPI) before completing.</InlineAlert>}

      <div className="nd-glass sticky bottom-20 space-y-3 rounded-3xl border border-line-soft p-4 shadow-lift">
        {a.status === "ACCEPTED" && <Button size="xl" block loading={busy} onClick={() => void act("arrived", {}, "Marked as arrived at store")}>I&apos;ve arrived at the store</Button>}
        {(a.status === "ACCEPTED" || a.status === "AT_STORE") && <Button size="xl" block variant={a.status === "ACCEPTED" ? "outline" : "primary"} loading={busy} onClick={() => void act("pickup", {}, "Order picked up")}>Confirm pickup</Button>}
        {a.status === "PICKED_UP" && <Button size="xl" block loading={busy} onClick={() => void act("start", {}, "Customer notified you're on the way")}>Start delivery</Button>}
        {(a.status === "PICKED_UP" || a.status === "OUT_FOR_DELIVERY") && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void act("deliver", { otp, codCollected: a.collectPaise > 0 ? cash : undefined }, "Delivered! 🎉"); }}>
            <label className="block text-sm font-semibold text-ink">Customer&apos;s 4-digit delivery OTP</label>
            <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="one-time-code" placeholder="••••" aria-label="Delivery OTP" className="h-16 w-full rounded-2xl border-2 border-line bg-surface text-center font-mono text-3xl tracking-[0.6em] outline-none focus:border-ink-soft" />
            {a.collectPaise > 0 && <Checkbox checked={cash} onChange={setCash} label={`I have collected ${formatINR(a.collectPaise)}`} />}
            <Button type="submit" size="xl" block loading={busy} disabled={otp.length !== 4 || (a.collectPaise > 0 && !cash)}>Complete delivery</Button>
          </form>
        )}
        {a.status === "AT_STORE" && <p className="text-center text-xs text-muted">Pickup is enabled once the store marks the order packed.</p>}
      </div>
    </div>
  );
}
