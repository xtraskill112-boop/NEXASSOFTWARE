"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Clock, FileText, HelpCircle, MapPin, PackageX, RotateCcw, Star, Undo2, Wallet } from "lucide-react";
import { toast } from "sonner";
import type { Order, OrderActions, Tracking, UpiSession } from "@naamdev/api-client";
import { CANCELLATION_REASONS, ORDER_STATUS_META, RETURN_REASONS, formatINR, type OrderStatus } from "@naamdev/shared";
import { BrandLoader, Button, Card, ErrorState, Field, InlineAlert, Modal, OrderStatusBadge, PaymentStatusBadge, Select, Stars, Textarea, buttonStyles } from "@naamdev/ui";
import { ProductImage } from "@/components/common/product-image";
import { payWithRazorpay } from "@/components/checkout/razorpay";
import { TrackingCard } from "@/components/orders/tracking";
import { UpiPayPanel } from "@/components/checkout/upi-pay";
import { api, errorMessage } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { useOrderLive } from "@/lib/realtime";

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { refresh: refreshCart } = useCart();
  const { t, locale } = useI18n();
  const [order, setOrder] = useState<Order | null>(null);
  const [actions, setActions] = useState<OrderActions | null>(null);
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [upi, setUpi] = useState<UpiSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "cancel" | "return" | { review: { productId: string; name: string } }>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ order: Order; actions: OrderActions; upi: UpiSession | null }>(`/orders/${id}`);
      setOrder(r.order);
      setActions(r.actions);
      setUpi(r.upi);
      if (!["PENDING", "CANCELLED", "REFUNDED", "REFUND_INITIATED"].includes(r.order.status))
        api.get<{ tracking: Tracking }>(`/orders/${id}/tracking`).then((x) => setTracking(x.tracking)).catch(() => undefined);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  // Realtime (Firestore live signal): status changes and the rider's position.
  useOrderLive(id, (live) => {
    if (!live) return;
    if (live.event === "location") {
      const p = live.location as { lat: number; lng: number; at?: { toDate?: () => Date } | string; etaMinutes: number | null } | undefined;
      if (!p) return;
      const at = typeof p.at === "string" ? p.at : (p.at?.toDate?.() ?? new Date()).toISOString();
      setTracking((tr) => (tr ? { ...tr, partnerLocation: { lat: p.lat, lng: p.lng, heading: null, at }, etaMinutes: p.etaMinutes, path: [...tr.path, { lat: p.lat, lng: p.lng }].slice(-60) } : tr));
      return;
    }
    const status = live.status as OrderStatus | undefined;
    if (status && status !== order?.status) toast(ORDER_STATUS_META[status]?.label ?? "Order updated", { icon: "📦" });
    void load();
  });

  if (error) return <ErrorState description={error} action={<Button onClick={() => router.push("/account/orders")}>Back to orders</Button>} />;
  if (!order || !actions) return <BrandLoader className="py-24" />;

  const completePayment = async () => {
    setBusy(true);
    try {
      const { payment } = await api.get<{ payment: Parameters<typeof payWithRazorpay>[0] }>(`/orders/${id}/payment-session`);
      const r = await payWithRazorpay(payment);
      await api.post("/payments/razorpay/verify", { orderId: id, ...r });
      toast.success("Payment successful!");
      void load();
    } catch (e) {
      if ((e as Error).message !== "DISMISSED") toast.error(errorMessage(e));
    } finally { setBusy(false); }
  };

  const reorder = async () => {
    const r = await api.post<{ added: string[]; skipped: string[] }>(`/orders/${id}/reorder`);
    await refreshCart();
    if (r.skipped.length) toast.warning(`Some items are unavailable: ${r.skipped.join(", ")}`);
    if (r.added.length) router.push("/cart");
  };

  const T = order.totals;
  const minsLeft = order.reservationExpiresAt ? Math.max(0, Math.round((new Date(order.reservationExpiresAt).getTime() - Date.now()) / 60000)) : 0;
  const reviewed = new Set(actions.reviewedProductIds);

  return (
    <div className="max-w-4xl">
      <Link href="/account/orders" className="mb-3 inline-block text-xs font-semibold text-muted hover:text-ink">← All orders</Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">Order <span className="font-mono">{order.orderNumber}</span></h1>
          <p className="mt-1 text-sm text-muted">Placed {new Date(order.placedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
        </div>
        <div className="flex gap-2"><OrderStatusBadge status={order.status} locale={locale} /><PaymentStatusBadge status={order.paymentStatus} /></div>
      </div>

      {actions.canPay && (
        <InlineAlert tone="warning" className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2"><Clock className="h-4 w-4" />Complete payment within {minsLeft} min to confirm this order — your items are reserved.</span>
          <Button size="sm" loading={busy} onClick={completePayment}><Wallet className="h-4 w-4" />{t("order.retryPayment")} · {formatINR(T.totalPaise)}</Button>
        </InlineAlert>
      )}
      {order.status === "CANCELLED" && <InlineAlert tone="danger" className="mb-5">Cancelled{order.cancelReason ? `: ${order.cancelReason}` : ""}. {order.paymentStatus === "PAID" || order.refunds.length ? (order.paymentMethod === "UPI" ? "We'll send the refund to the UPI account you paid from." : "Your refund is being processed to the original payment method.") : ""}</InlineAlert>}
      {upi && order.status === "PENDING" && <div className="mb-6"><UpiPayPanel orderId={order.id} upi={upi} onUpdated={(r) => { setOrder(r.order); setUpi(r.upi); }} /></div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {!["PENDING", "CANCELLED", "REFUND_INITIATED", "REFUNDED"].includes(order.status) && <TrackingCard order={order} tracking={tracking} />}

          <Card className="p-5">
            <h2 className="mb-3 font-display text-xl font-semibold text-ink">Items</h2>
            <ul className="divide-y divide-line-soft">
              {order.items.map((i) => (
                <li key={i.id} className="flex items-center gap-4 py-3">
                  <Link href={`/product/${i.productSlug}`}><ProductImage src={i.imageUrl} alt={i.name} className="h-16 w-16 rounded-2xl" sizes={128} /></Link>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{i.name}</p>
                    <p className="text-xs text-muted">{i.variantLabel} × {i.quantity} · {formatINR(i.unitPricePaise)} each</p>
                    {actions.canReview && (reviewed.has(i.productId) ? <p className="mt-1 text-xs font-semibold text-pista-600">✓ Reviewed</p> : <button type="button" onClick={() => setModal({ review: { productId: i.productId, name: i.name } })} className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-saffron-700"><Star className="h-3.5 w-3.5" />Rate & review</button>)}
                  </div>
                  <span className="font-bold tabular-nums">{formatINR(i.lineTotalPaise)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 font-display text-xl font-semibold text-ink">{t("order.timeline")}</h2>
            <ol className="relative space-y-5 border-l-2 border-line pl-6">
              {order.timeline.map((h, k) => (
                <li key={k} className="relative">
                  <span className="absolute -left-[33px] top-0.5 grid h-4 w-4 place-items-center rounded-full bg-saffron-500 ring-4 ring-surface" />
                  <p className="text-sm font-semibold text-ink">{ORDER_STATUS_META[h.status].label}</p>
                  <p className="text-xs text-muted">{new Date(h.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}{h.note ? ` · ${h.note}` : ""}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="p-5 text-sm">
            <h3 className="mb-2 font-display text-lg font-semibold text-ink">Bill details</h3>
            {([
              ["Item total", formatINR(T.subtotalPaise), false],
              ...(T.couponDiscountPaise ? [[`Coupon${order.couponCode ? ` (${order.couponCode})` : ""}`, `−${formatINR(T.couponDiscountPaise)}`, true]] : []),
              ...(T.loyaltyDiscountPaise ? [[`Mithaas points (${order.pointsRedeemed})`, `−${formatINR(T.loyaltyDiscountPaise)}`, true]] : []),
              ["Delivery fee", T.deliveryFeePaise ? formatINR(T.deliveryFeePaise) : "FREE", !T.deliveryFeePaise],
            ] as [string, string, boolean][]).map(([l, v, green]) => (
              <div key={l} className="flex justify-between py-1"><span className="text-ink-soft">{l}</span><span className={green ? "font-semibold text-pista-600" : "font-semibold"}>{v}</span></div>
            ))}
            <div className="flex justify-between py-1 text-xs text-muted"><span>GST</span><span>{formatINR(T.taxPaise)}</span></div>
            <div className="mt-2 flex justify-between border-t border-dashed border-line pt-3 text-base"><span className="font-semibold">Total</span><span className="font-extrabold">{formatINR(T.totalPaise)}</span></div>
            {T.refundedPaise > 0 && <div className="mt-1 flex justify-between text-pista-600"><span>Refunded</span><span className="font-semibold">{formatINR(T.refundedPaise)}</span></div>}
            {order.pointsEarned > 0 && <p className="mt-3 rounded-xl bg-gold-300/20 px-3 py-2 text-xs font-semibold text-gold-600">✨ You earned {order.pointsEarned} Mithaas points</p>}
          </Card>
          <Card className="p-5 text-sm">
            <h3 className="mb-2 flex items-center gap-2 font-semibold text-ink"><MapPin className="h-4 w-4 text-saffron-600" />Delivery address</h3>
            <p className="text-ink-soft">{order.address.fullName} · {order.address.phone}</p>
            <p className="text-muted">{[order.address.line1, order.address.line2, order.address.landmark, order.address.city, order.address.pincode].filter(Boolean).join(", ")}</p>
            <h3 className="mb-1 mt-4 font-semibold text-ink">Payment</h3>
            <p className="text-muted">{order.paymentMethod === "COD" ? "Cash on delivery" : order.paymentMethod === "UPI" ? `UPI (direct)${upi?.reference ? ` · ref ${upi.reference}` : ""}` : `Online${order.payments[0]?.methodDetail ? ` · ${order.payments[0].methodDetail.toUpperCase()}` : ""}`}</p>
            {order.refunds.map((r) => <p key={r.id} className="mt-1 text-xs text-muted">Refund {formatINR(r.amountPaise)} · {r.status.toLowerCase()}</p>)}
          </Card>
          <div className="grid gap-2">
            {order.invoiceNumber && <Link href={`/invoice/${order.id}`} target="_blank" className={buttonStyles({ variant: "outline", block: true })}><FileText className="h-4 w-4" />{t("order.invoice")}</Link>}
            <Button variant="outline" block onClick={reorder}><RotateCcw className="h-4 w-4" />{t("order.reorder")}</Button>
            {actions.canReturn && <Button variant="outline" block onClick={() => setModal("return")}><Undo2 className="h-4 w-4" />Report an issue / return</Button>}
            <Link href={`/account/support/new?orderId=${order.id}`} className={buttonStyles({ variant: "ghost", block: true })}><HelpCircle className="h-4 w-4" />{t("order.help")}</Link>
            {actions.canCancel && <Button variant="ghost" block className="text-maroon-700" onClick={() => setModal("cancel")}><PackageX className="h-4 w-4" />{t("order.cancel")}</Button>}
          </div>
        </aside>
      </div>

      <CancelModal open={modal === "cancel"} onClose={() => setModal(null)} onDone={() => { setModal(null); void load(); }} orderId={order.id} />
      <ReturnModal open={modal === "return"} onClose={() => setModal(null)} onDone={() => { setModal(null); void load(); }} orderId={order.id} />
      {modal && typeof modal === "object" && <ReviewModal product={modal.review} onClose={() => setModal(null)} onDone={() => { setModal(null); void load(); }} />}
    </div>
  );
}


function CancelModal({ open, onClose, onDone, orderId }: { open: boolean; onClose: () => void; onDone: () => void; orderId: string }) {
  const [reason, setReason] = useState<string>(CANCELLATION_REASONS[0]);
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="Cancel this order?" description="Stock is released immediately. Paid orders are refunded to the original payment method."
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Keep order</Button><Button variant="danger" loading={busy} onClick={async () => {
        setBusy(true);
        try { await api.post(`/orders/${orderId}/cancel`, { reason: reason === "Other" ? other || "Other" : reason }); toast.success("Order cancelled"); onDone(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Cancel order</Button></div>}>
      <Field label="Reason">{(p) => <Select {...p} value={reason} onChange={(e) => setReason(e.target.value)}>{CANCELLATION_REASONS.map((r) => <option key={r}>{r}</option>)}</Select>}</Field>
      {reason === "Other" && <Textarea className="mt-3" value={other} onChange={(e) => setOther(e.target.value)} placeholder="Tell us more" />}
    </Modal>
  );
}

function ReturnModal({ open, onClose, onDone, orderId }: { open: boolean; onClose: () => void; onDone: () => void; orderId: string }) {
  const [reason, setReason] = useState<string>(RETURN_REASONS[0]);
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="Report an issue" description="Sweets are perishable, so returns are accepted for damaged, wrong or poor-quality items only."
      footer={<div className="flex justify-end"><Button loading={busy} onClick={async () => {
        setBusy(true);
        try { await api.post(`/orders/${orderId}/return`, { reason, description, images }); toast.success("Request submitted. Our team will review it shortly."); onDone(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Submit request</Button></div>}>
      <div className="space-y-4">
        <Field label="What went wrong?">{(p) => <Select {...p} value={reason} onChange={(e) => setReason(e.target.value)}>{RETURN_REASONS.map((r) => <option key={r}>{r}</option>)}</Select>}</Field>
        <Field label="Details">{(p) => <Textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the issue" />}</Field>
        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink-soft">Photos (optional, up to 4)</p>
          <div className="flex flex-wrap gap-2">
            {images.map((u) => <ProductImage key={u} src={u} alt="Uploaded" className="h-16 w-16 rounded-xl" sizes={128} />)}
            {images.length < 4 && (
              <label className="grid h-16 w-16 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-line text-xl text-muted">+
                <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try { const r = await api.upload<{ file: { url: string } }>("/uploads/return-image", f); setImages((x) => [...x, r.file.url]); } catch (err) { toast.error(errorMessage(err)); }
                }} />
              </label>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ReviewModal({ product, onClose, onDone }: { product: { productId: string; name: string }; onClose: () => void; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={`Review ${product.name}`} description="Your review appears after a quick moderation check."
      footer={<div className="flex justify-end"><Button loading={busy} onClick={async () => {
        setBusy(true);
        try { await api.post("/reviews", { productId: product.productId, rating, title: title || undefined, body: body || undefined }); toast.success("Thanks for your review!"); onDone(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Submit review</Button></div>}>
      <div className="space-y-4">
        <Stars value={rating} onChange={setRating} size={32} />
        <Field label="Headline">{(p) => <input {...p} className="h-12 w-full rounded-2xl border border-line bg-surface px-4" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />}</Field>
        <Field label="Your review">{(p) => <Textarea {...p} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder="How did it taste? Was it fresh?" />}</Field>
      </div>
    </Modal>
  );
}
