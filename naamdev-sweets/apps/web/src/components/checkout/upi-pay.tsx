"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Copy, Hourglass, QrCode, Smartphone } from "lucide-react";
import { toast } from "sonner";
import type { Order, UpiSession } from "@naamdev/api-client";
import { formatINR } from "@naamdev/shared";
import { Button, Card, Field, InlineAlert, Input, buttonStyles } from "@naamdev/ui";
import { ApiError, api, errorMessage } from "@/lib/api";

export const onPhone = () => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export function useCountdown(until: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  if (!until) return null;
  const left = Math.max(0, new Date(until).getTime() - now);
  return { left, label: `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}` };
}

/**
 * Pay the shop's UPI ID directly. The order is accepted only after our team sees the money in the
 * shop's UPI account — the reference number just helps them find it.
 */
export function UpiPayPanel({ orderId, upi, onUpdated }: { orderId: string; upi: UpiSession; onUpdated: (r: { order: Order; upi: UpiSession }) => void }) {
  const [utr, setUtr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [phone, setPhone] = useState(false);
  const countdown = useCountdown(upi.status === "AWAITING_PAYMENT" ? upi.expiresAt : null);
  useEffect(() => setPhone(onPhone()), []);

  if (upi.status === "VERIFYING")
    return (
      <Card className="border-2 border-saffron-200 p-5 dark:border-saffron-500/30">
        <p className="flex items-center gap-2 font-display text-xl font-semibold text-ink"><Hourglass className="h-5 w-5 text-saffron-600" />Checking your UPI payment</p>
        <p className="mt-2 text-sm text-ink-soft">
          Thanks! Our team is matching your payment of <b>{formatINR(upi.amountPaise)}</b> (UPI ref <span className="font-mono">{upi.reference}</span>) with the shop&apos;s UPI account.
          Your order goes to the kitchen as soon as it&apos;s confirmed — you&apos;ll get a notification. Your items stay reserved meanwhile.
        </p>
      </Card>
    );
  if (upi.status !== "AWAITING_PAYMENT" || !upi.link) return null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ order: Order; upi: UpiSession }>(`/orders/${orderId}/upi-reference`, { utr });
      toast.success("Got it — we'll confirm your payment shortly");
      onUpdated(r);
    } catch (e) {
      setError(e instanceof ApiError && e.fieldErrors.utr ? e.fieldErrors.utr : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string, what: string) =>
    navigator.clipboard?.writeText(text).then(() => toast.success(`${what} copied`), () => toast.error("Couldn't copy"));

  const qr = upi.qrSvg ? <div className="mx-auto w-56 rounded-2xl bg-white p-3 shadow-soft [&>svg]:h-auto [&>svg]:w-full" aria-label="UPI QR code" dangerouslySetInnerHTML={{ __html: upi.qrSvg }} /> : null;

  return (
    <Card className="overflow-hidden border-2 border-saffron-300 dark:border-saffron-500/40">
      <div className="nd-gradient-maroon p-5 text-cream-100">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-saffron-200">Step 1 · Pay by UPI</p>
        <p className="mt-1 font-display text-3xl font-semibold">{formatINR(upi.amountPaise)}</p>
        <p className="mt-1 text-sm text-cream-200/85">to <b className="text-white">{upi.payeeName}</b> · {upi.vpa}</p>
        {countdown && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
            <Clock className="h-3.5 w-3.5" />{countdown.left > 0 ? `Pay within ${countdown.label} — your items are reserved` : "Payment window ended — the order will be cancelled shortly"}
          </p>
        )}
      </div>
      <div className="space-y-4 p-5">
        {upi.lastRejection && <InlineAlert tone="warning">We couldn&apos;t find your earlier payment ({upi.lastRejection.replace(/^Not found in the shop's UPI account:?\s*/, "")}). Please check the reference number, or pay again.</InlineAlert>}
        {phone ? (
          <>
            <a href={upi.link} className={buttonStyles({ size: "xl", block: true })}><Smartphone className="h-5 w-5" />Open UPI app &amp; pay</a>
            <button type="button" onClick={() => setShowQr((v) => !v)} className="flex w-full items-center justify-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><QrCode className="h-4 w-4" />{showQr ? "Hide QR code" : "Pay from another phone (QR code)"}</button>
            {showQr && qr}
          </>
        ) : (
          <div className="grid items-center gap-4 sm:grid-cols-[auto_1fr]">
            {qr}
            <div className="space-y-2 text-sm text-ink-soft">
              <p className="font-semibold text-ink">Scan with any UPI app</p>
              <p>Open Paytm, PhonePe, Google Pay or your bank&apos;s UPI app, scan the code and pay <b>{formatINR(upi.amountPaise)}</b>.</p>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2 text-xs">
          <button type="button" onClick={() => copy(upi.vpa, "UPI ID")} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 font-semibold text-ink-soft hover:text-ink"><Copy className="h-3.5 w-3.5" />UPI ID: {upi.vpa}</button>
          <button type="button" onClick={() => copy(upi.note, "Payment note")} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 font-semibold text-ink-soft hover:text-ink"><Copy className="h-3.5 w-3.5" />Note: {upi.note}</button>
        </div>

        <form className="space-y-3 border-t border-dashed border-line pt-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-saffron-700">Step 2 · After paying</p>
          <Field label="UPI reference number (UTR)" hint="12 digits — shown in your UPI app under the payment details" error={error ?? undefined}>
            {(p) => <Input {...p} value={utr} onChange={(e) => setUtr(e.target.value.replace(/[^\d ]/g, "").slice(0, 15))} inputMode="numeric" autoComplete="off" placeholder="e.g. 412345678901" className="font-mono tracking-wider" />}
          </Field>
          <Button type="submit" variant="outline" size="lg" block loading={busy} disabled={utr.replace(/\D/g, "").length !== 12}><CheckCircle2 className="h-4 w-4" />I&apos;ve paid — submit reference</Button>
          <p className="text-[11px] leading-relaxed text-muted">Your order is accepted once our team sees the payment in the shop&apos;s UPI account. If something goes wrong, the full amount is refunded to you by UPI.</p>
        </form>
      </div>
    </Card>
  );
}
