"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Banknote, CheckCircle2, ChevronDown, Clock, Copy, CreditCard, Hourglass, Lock, QrCode, ShieldCheck, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import type { Order, PaymentSession, Quote, UpiSession } from "@naamdev/api-client";
import { formatINR } from "@naamdev/shared";
import { Button, Emblem, Field, InlineAlert, Input, Modal, buttonStyles, cn } from "@naamdev/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import { onPhone, useCountdown } from "./upi-pay";

export type PayMethod = "UPI" | "COD" | "ONLINE";
export type PlaceResult = { order: Order; payment: PaymentSession | null };

interface Props {
  open: boolean;
  amountPaise: number;
  options: Quote["paymentOptions"];
  /** Shown in the header so the customer sees which account is paying. */
  contact: string;
  /** Places the order on the server (totals are calculated there); throws on failure. */
  place: (method: PayMethod) => Promise<PlaceResult>;
  onCodPlaced: (orderId: string) => void;
  /** Razorpay (only offered when real Razorpay keys are configured). */
  onOnline: (session: PaymentSession) => void;
  /** Called with the order id once an order exists (UPI), so the caller can open the order page. */
  onClose: (placedOrderId: string | null) => void;
}

/**
 * NAAMDEV's own payment sheet: pick UPI (paid straight to the shop's UPI ID, confirmed by staff) or
 * cash on delivery — plus Razorpay when it is configured. Nothing here marks a payment as done: UPI
 * orders wait for staff to find the money in the shop's account.
 */
export function PaySheet({ open, amountPaise, options, contact, place, onCodPlaced, onOnline, onClose }: Props) {
  const firstAvailable: PayMethod | null = options.upi.available ? "UPI" : options.cod.available ? "COD" : options.online.available ? "ONLINE" : null;
  const [expanded, setExpanded] = useState<PayMethod | null>(firstAvailable);
  const [busy, setBusy] = useState<PayMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upiOrder, setUpiOrder] = useState<{ id: string; number: string; upi: UpiSession | null } | null>(null);

  useEffect(() => {
    if (open && !upiOrder) {
      setExpanded(firstAvailable);
      setError(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    if (busy) return;
    onClose(upiOrder?.id ?? null);
  };

  const run = async (method: PayMethod) => {
    setBusy(method);
    setError(null);
    try {
      const r = await place(method);
      if (method === "UPI") {
        const d = await api.get<{ order: Order; upi: UpiSession | null }>(`/orders/${r.order.id}`);
        setUpiOrder({ id: r.order.id, number: r.order.orderNumber, upi: d.upi });
      } else if (r.payment) onOnline(r.payment);
      else onCodPlaced(r.order.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={open} onClose={close} size="sm" label="Payment" bodyClassName="p-0">
      <div className="nd-gradient-maroon px-5 pb-5 pt-4 text-cream-100">
        <div className="flex items-center gap-3">
          <Emblem size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-semibold leading-tight text-white">NAAMDEV SWEETS</p>
            <p className="flex items-center gap-1 text-[11px] font-semibold text-cream-200/80"><Lock className="h-3 w-3" />Secure checkout</p>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-cream-200 transition hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[12.5px] font-semibold text-cream-200">{upiOrder ? `Order ${upiOrder.number}` : "Order total"}</p>
            <p className="font-display text-3xl font-semibold tabular-nums text-white">{formatINR(amountPaise)}</p>
          </div>
          {contact && <p className="max-w-[45%] truncate rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-cream-100">{contact}</p>}
        </div>
      </div>

      <div className="p-4">
        {upiOrder ? (
          upiOrder.upi ? (
            <UpiCompact orderId={upiOrder.id} upi={upiOrder.upi} onUpdated={(upi) => setUpiOrder({ ...upiOrder, upi })} onDone={close} />
          ) : (
            <div className="space-y-3 py-2 text-center">
              <p className="text-sm text-ink-soft">Your order is reserved. Open it to pay by UPI.</p>
              <Button block onClick={close}>Open my order</Button>
            </div>
          )
        ) : (
          <>
            <p className="mb-2 px-1 text-[13px] font-semibold text-muted">Payment options</p>
            <div className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line">
              <MethodRow
                icon={<Smartphone className="h-5 w-5" />} title="UPI" badge="Recommended" subtitle="Google Pay, PhonePe, Paytm, BHIM & more"
                option={options.upi} expanded={expanded === "UPI"} onToggle={() => setExpanded((m) => (m === "UPI" ? null : "UPI"))}
              >
                <p className="text-xs leading-relaxed text-muted">Pay the shop directly from any UPI app. Your order is confirmed as soon as our team sees the payment.</p>
                <Button block loading={busy === "UPI"} disabled={!!busy} onClick={() => void run("UPI")}>Pay {formatINR(amountPaise)} with UPI</Button>
              </MethodRow>
              <MethodRow
                icon={<Banknote className="h-5 w-5" />} title="Cash on Delivery" subtitle="Pay in cash or by UPI when your order arrives"
                option={options.cod} expanded={expanded === "COD"} onToggle={() => setExpanded((m) => (m === "COD" ? null : "COD"))}
              >
                <Button block loading={busy === "COD"} disabled={!!busy} onClick={() => void run("COD")}>Place order · {formatINR(amountPaise)}</Button>
              </MethodRow>
              {options.online.available && (
                <MethodRow
                  icon={<CreditCard className="h-5 w-5" />} title="Cards, Netbanking & Wallets" subtitle="Processed securely by Razorpay"
                  option={options.online} expanded={expanded === "ONLINE"} onToggle={() => setExpanded((m) => (m === "ONLINE" ? null : "ONLINE"))}
                >
                  <Button block loading={busy === "ONLINE"} disabled={!!busy} onClick={() => void run("ONLINE")}>Pay {formatINR(amountPaise)}</Button>
                </MethodRow>
              )}
            </div>
            {error && <InlineAlert tone="danger" className="mt-3">{error}</InlineAlert>}
          </>
        )}
        <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-muted"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />Payments go directly to NAAMDEV SWEETS · no card details needed</p>
      </div>
    </Modal>
  );
}

function MethodRow({ icon, title, subtitle, badge, option, expanded, onToggle, children }: {
  icon: React.ReactNode; title: string; subtitle: string; badge?: string; option: { available: boolean; reason: string | null };
  expanded: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className={cn("bg-bg-elevated", expanded && option.available && "bg-surface-2/60 ")}>
      <button type="button" onClick={onToggle} disabled={!option.available} aria-expanded={option.available ? expanded : undefined}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition disabled:cursor-not-allowed disabled:opacity-55">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-maroon-700 dark:text-maroon-200">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-bold text-ink">{title}{badge && option.available && <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[12px] font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">{badge}</span>}</span>
          <span className="block text-xs leading-snug text-muted">{option.available ? subtitle : option.reason}</span>
        </span>
        {option.available && <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition", expanded && "rotate-180")} />}
      </button>
      <AnimatePresence initial={false}>
        {expanded && option.available && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-3 px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The compact UPI step: pay the shop's UPI ID (app button on phones, QR on computers), then give the reference. */
function UpiCompact({ orderId, upi, onUpdated, onDone }: { orderId: string; upi: UpiSession; onUpdated: (upi: UpiSession) => void; onDone: () => void }) {
  const [utr, setUtr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const countdown = useCountdown(upi.status === "AWAITING_PAYMENT" ? upi.expiresAt : null);
  useEffect(() => setPhone(onPhone()), []);

  if (upi.status === "VERIFYING" || upi.status === "PAID")
    return (
      <div className="space-y-3 py-2 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-maroon-700 dark:text-maroon-200">
          {upi.status === "PAID" ? <CheckCircle2 className="h-6 w-6" /> : <Hourglass className="h-6 w-6" />}
        </span>
        <p className="font-display text-xl font-semibold text-ink">{upi.status === "PAID" ? "Payment confirmed" : "Checking your payment"}</p>
        <p className="text-sm text-ink-soft">
          {upi.status === "PAID" ? "Your order is on its way to the kitchen." : <>We&apos;re matching UPI ref <span className="font-mono">{upi.reference}</span> with the shop&apos;s account. Your items stay reserved, and you&apos;ll be notified when it&apos;s confirmed.</>}
        </p>
        <Button block onClick={onDone}>View order status</Button>
      </div>
    );
  if (upi.status !== "AWAITING_PAYMENT" || !upi.link)
    return (
      <div className="space-y-3 py-2 text-center">
        <p className="text-sm text-ink-soft">This payment window has closed.</p>
        <Button block onClick={onDone}>View order</Button>
      </div>
    );

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ order: Order; upi: UpiSession }>(`/orders/${orderId}/upi-reference`, { utr });
      toast.success("Got it — we'll confirm your payment shortly");
      onUpdated(r.upi);
    } catch (e) {
      setError(e instanceof ApiError && e.fieldErrors.utr ? e.fieldErrors.utr : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const copy = (text: string, what: string) =>
    navigator.clipboard?.writeText(text).then(() => toast.success(`${what} copied`), () => toast.error("Couldn't copy"));
  const qr = upi.qrSvg ? (
    <div className="mx-auto w-40 shrink-0 rounded-xl bg-white p-2 shadow-soft [&>svg]:h-auto [&>svg]:w-full" aria-label="UPI QR code" dangerouslySetInnerHTML={{ __html: upi.qrSvg }} />
  ) : null;

  return (
    <div className="space-y-3">
      {countdown && (
        <p className={cn("flex items-center justify-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", countdown.left > 0 ? "bg-surface-2 text-ink-soft" : "bg-maroon-50 text-maroon-700 dark:bg-maroon-500/15 dark:text-maroon-200")}>
          <Clock className="h-3.5 w-3.5" />{countdown.left > 0 ? `Pay within ${countdown.label} — items reserved` : "Payment window ended"}
        </p>
      )}
      {upi.lastRejection && <InlineAlert tone="warning">We couldn&apos;t find your earlier payment. Check the reference number, or pay again.</InlineAlert>}

      {phone ? (
        <>
          <a href={upi.link} className={buttonStyles({ size: "lg", block: true })}><Smartphone className="h-5 w-5" />Pay with UPI app</a>
          <button type="button" onClick={() => setShowQr((v) => !v)} className="flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-muted hover:text-ink"><QrCode className="h-3.5 w-3.5" />{showQr ? "Hide QR code" : "Pay from another phone (QR)"}</button>
          {showQr && qr}
        </>
      ) : (
        <div className="flex items-center gap-3">
          {qr}
          <div className="text-xs leading-relaxed text-ink-soft">
            <p className="text-sm font-semibold text-ink">Scan &amp; pay</p>
            <p className="mt-1">Use Google Pay, PhonePe, Paytm or any UPI app. The amount and note are filled in for you.</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-muted">Paying to</p>
          <p className="truncate text-sm font-bold text-ink">{upi.payeeName}</p>
          <p className="truncate font-mono text-xs text-ink-soft">{upi.vpa}</p>
        </div>
        <button type="button" onClick={() => copy(upi.vpa, "UPI ID")} aria-label="Copy UPI ID" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"><Copy className="h-4 w-4" /></button>
      </div>

      <form className="space-y-2 border-t border-dashed border-line pt-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Field label="UPI reference number (UTR)" hint="12 digits, shown in your UPI app after paying" error={error ?? undefined}>
          {(p) => <Input {...p} value={utr} onChange={(e) => setUtr(e.target.value.replace(/[^\d ]/g, "").slice(0, 15))} inputMode="numeric" autoComplete="off" placeholder="e.g. 412345678901" className="font-mono tracking-wider" />}
        </Field>
        <Button type="submit" variant="outline" block loading={busy} disabled={utr.replace(/\D/g, "").length !== 12}><CheckCircle2 className="h-4 w-4" />I&apos;ve paid — submit reference</Button>
      </form>
    </div>
  );
}
