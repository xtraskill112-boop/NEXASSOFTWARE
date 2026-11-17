"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Bike, ExternalLink, MapPin, Phone, Printer, RefreshCw, Send, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { ORDER_STATUS_META, SOCKET_EVENTS, formatINR, googleMapsDirectionsUrl, type OrderStatus } from "@naamdev/shared";
import { Badge, Button, Card, ErrorState, Field, Input, Modal, OrderStatusBadge, PaymentStatusBadge, Select, Skeleton, Textarea } from "@naamdev/ui";
import { Can, Guard, KeyValue, PageHeader, confirmAction } from "@/components/kit";
import { api, dt, errorMessage, toPaise } from "@/lib/api";
import { useAdmin } from "@/lib/auth";
import { useAdminRealtime } from "@/lib/realtime";
import { useResource } from "@/lib/use-resource";

interface AdminOrder {
  id: string; orderNumber: string; invoiceNumber: string | null; status: OrderStatus; paymentMethod: string; paymentStatus: string; placedAt: string; estimatedDeliveryAt: string | null;
  customerName: string; customerPhone: string; customerEmail: string | null; address: Record<string, string | null>; deliveryInstructions: string | null; customerNote: string | null; deliveryOtp: string | null;
  totals: Record<string, number>; couponCode: string | null; pointsRedeemed: number; cancelReason: string | null;
  items: { id: string; name: string; variantLabel: string; sku: string; quantity: number; unitPricePaise: number; lineTotalPaise: number; discountPaise: number; gstRate: number; taxPaise: number }[];
  customer: { id: string; name: string; email: string | null; phone: string | null; createdAt: string; _count: { orders: number } };
  notes: { id: string; body: string; createdAt: string; author: { name: string } }[];
  history: { id: string; from: string | null; to: OrderStatus; note: string | null; actorType: string; actor: string | null; at: string }[];
  allocations: { itemId: string; batches: { batchNumber: string; expiresAt: string; quantity: number; released: boolean }[] }[];
  assignments: { id: string; status: string; partnerId: string; partnerName: string; partnerPhone: string | null; distanceKm: number | null; earningPaise: number; offeredAt: string; pickedUpAt: string | null; deliveredAt: string | null; rejectionReason: string | null }[];
  payments: { id: string; method: string; provider: string; status: string; amountPaise: number; gatewayOrderId: string | null; gatewayPaymentId: string | null; methodDetail: string | null; failureReason: string | null; createdAt: string }[];
  refunds: { id: string; amountPaise: number; status: string; method: string; reason: string; gatewayRefundId: string | null; reference: string | null; failureReason: string | null; createdAt: string }[];
  returnRequests: { id: string; reason: string; description: string | null; images: string[]; status: string; createdAt: string }[];
}
interface Resp { order: AdminOrder; allowedTransitions: OrderStatus[]; tracking: { partnerLocation: { lat: number; lng: number; at: string } | null; drop: { lat: number; lng: number } | null; etaMinutes: number | null } }

export default function AdminOrderPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAdmin();
  const { socket } = useAdminRealtime();
  const { data, error, reload } = useResource<Resp>(`/admin/orders/${id}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);

  useEffect(() => {
    if (!socket) return;
    socket.emit(SOCKET_EVENTS.subscribeOrder, { orderId: id });
    const h = (p: { orderId: string }) => p.orderId === id && void reload();
    socket.on(SOCKET_EVENTS.orderStatus, h);
    socket.on(SOCKET_EVENTS.trackingLocation, h);
    return () => { socket.off(SOCKET_EVENTS.orderStatus, h); socket.off(SOCKET_EVENTS.trackingLocation, h); };
  }, [socket, id, reload]);

  if (error) return <ErrorState description={error} />;
  if (!data) return <Skeleton className="h-[70vh]" />;
  const o = data.order;
  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try { await fn(); toast.success(label); await reload(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };
  const move = (s: OrderStatus) => s === "CANCELLED" ? setCancelOpen(true) : void act(`Moved to ${ORDER_STATUS_META[s].label}`, () => api.post(`/admin/orders/${id}/status`, { status: s }));
  const activeAssignment = o.assignments.find((a) => ["OFFERED", "ACCEPTED", "AT_STORE", "PICKED_UP", "OUT_FOR_DELIVERY"].includes(a.status));
  const T = o.totals;

  return (
    <Guard any={["orders.view"]}>
      <PageHeader
        back={<Link href="/orders" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />Orders</Link>}
        title={<span className="font-mono">{o.orderNumber}</span>}
        subtitle={<span className="flex flex-wrap items-center gap-2">Placed {dt(o.placedAt)} <OrderStatusBadge status={o.status} /> <PaymentStatusBadge status={o.paymentStatus} />{o.invoiceNumber && <span className="text-xs">Invoice {o.invoiceNumber}</span>}</span>}
        actions={<><Link href={`/orders/${id}/slip`} target="_blank" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold"><Printer className="h-4 w-4" />Packing slip</Link><Button variant="ghost" size="sm" onClick={() => void reload()}><RefreshCw className="h-4 w-4" /></Button></>}
      />
      {data.allowedTransitions.length > 0 && (
        <Card className="mb-6 flex flex-wrap items-center gap-2 p-4">
          <span className="mr-2 text-sm font-semibold text-ink-soft">Move order to:</span>
          {data.allowedTransitions.map((s) => <Button key={s} size="sm" variant={s === "CANCELLED" ? "danger" : "primary"} loading={busy === `Moved to ${ORDER_STATUS_META[s].label}`} onClick={() => move(s)}>{ORDER_STATUS_META[s].label}</Button>)}
        </Card>
      )}
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Items</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-muted"><tr><th className="py-2">Item</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Price</th><th className="py-2 text-right">Total</th></tr></thead>
              <tbody className="divide-y divide-line-soft">
                {o.items.map((i) => {
                  const alloc = o.allocations.find((a) => a.itemId === i.id);
                  return (
                    <tr key={i.id}>
                      <td className="py-3"><p className="font-semibold text-ink">{i.name} <span className="font-normal text-muted">· {i.variantLabel}</span></p><p className="text-xs text-muted">{i.sku} · GST {i.gstRate}%</p>
                        {alloc && alloc.batches.length > 0 && <p className="mt-1 text-xs text-muted">Batches: {alloc.batches.map((b) => `${b.batchNumber} ×${b.quantity}${b.released ? " (released)" : ""}`).join(", ")}</p>}</td>
                      <td className="py-3 text-right font-bold">{i.quantity}</td>
                      <td className="py-3 text-right">{formatINR(i.unitPricePaise)}</td>
                      <td className="py-3 text-right font-semibold">{formatINR(i.lineTotalPaise)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm">
              {([["Subtotal", T.subtotalPaise], ["Coupon" + (o.couponCode ? ` (${o.couponCode})` : ""), -T.couponDiscountPaise], [`Points (${o.pointsRedeemed})`, -T.loyaltyDiscountPaise], ["Delivery", T.deliveryFeePaise]] as [string, number][]).filter(([l, v]) => v !== 0 || l === "Subtotal").map(([l, v]) => <div key={l} className="flex justify-between"><span className="text-muted">{l}</span><span>{v < 0 ? `−${formatINR(-v)}` : formatINR(v)}</span></div>)}
              <div className="flex justify-between text-xs text-muted"><span>GST</span><span>{formatINR(T.taxPaise)}</span></div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><span>Total</span><span>{formatINR(T.totalPaise)}</span></div>
              {T.refundedPaise > 0 && <div className="flex justify-between text-pista-600"><span>Refunded</span><span>{formatINR(T.refundedPaise)}</span></div>}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Timeline</h2>
            <ol className="space-y-3 border-l-2 border-line pl-5 text-sm">
              {o.history.map((h) => (
                <li key={h.id} className="relative"><span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full bg-saffron-500 ring-4 ring-surface" />
                  <p className="font-semibold text-ink">{ORDER_STATUS_META[h.to].label}</p>
                  <p className="text-xs text-muted">{dt(h.at)} · {h.actor ?? h.actorType.toLowerCase()}{h.note ? ` — ${h.note}` : ""}</p></li>
              ))}
            </ol>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Internal notes</h2>
            <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (note.trim()) void act("Note added", async () => { await api.post(`/admin/orders/${id}/notes`, { body: note }); setNote(""); }); }}>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Visible to staff only" className="h-10" aria-label="Internal note" />
              <Button type="submit" size="icon-sm" aria-label="Add note"><Send className="h-4 w-4" /></Button>
            </form>
            {o.notes.length === 0 ? <p className="text-sm text-muted">No notes yet.</p> : <ul className="space-y-2">{o.notes.map((n) => <li key={n.id} className="rounded-xl bg-surface-2 px-3 py-2 text-sm"><p className="text-ink">{n.body}</p><p className="mt-0.5 text-xs text-muted">{n.author.name} · {dt(n.createdAt)}</p></li>)}</ul>}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Customer</h2>
            <KeyValue items={[["Name", <Link key="n" href={`/customers/${o.customer.id}`} className="font-semibold text-saffron-700">{o.customerName}</Link>], ["Phone", <a key="p" href={`tel:${o.customerPhone}`}>{o.customerPhone}</a>], ["Orders", o.customer._count.orders], ["Since", dt(o.customer.createdAt, false)]]} />
            <div className="mt-4 rounded-2xl bg-surface-2 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-semibold text-ink"><MapPin className="h-4 w-4 text-saffron-600" />{o.address.fullName}</p>
              <p className="text-muted">{[o.address.line1, o.address.line2, o.address.landmark, o.address.city, o.address.pincode].filter(Boolean).join(", ")}</p>
              {o.deliveryInstructions && <p className="mt-1 text-xs italic text-ink-soft">“{o.deliveryInstructions}”</p>}
            </div>
            {o.customerNote && <p className="mt-3 rounded-xl bg-gold-300/20 px-3 py-2 text-sm"><b>Kitchen note:</b> {o.customerNote}</p>}
            {o.deliveryOtp && <p className="mt-3 text-xs text-muted">Delivery OTP: <b className="font-mono text-ink">{o.deliveryOtp}</b> (share only to resolve disputes)</p>}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-lg font-semibold text-ink">Delivery</h2>
              <Can any={["delivery.manage"]}>{!["DISPATCHED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "REFUNDED", "REFUND_INITIATED", "PENDING"].includes(o.status) && <Button size="sm" variant="soft" onClick={() => setAssignOpen(true)}><Bike className="h-4 w-4" />{activeAssignment ? "Reassign" : "Assign"}</Button>}</Can>
            </div>
            {o.assignments.length === 0 ? <p className="text-sm text-muted">No rider assigned yet. Packing an order automatically offers it to the nearest online partner.</p> : (
              <ul className="space-y-2">{o.assignments.map((a) => (
                <li key={a.id} className="rounded-xl border border-line-soft p-3 text-sm">
                  <div className="flex items-center justify-between"><b className="text-ink">{a.partnerName}</b><Badge tone={["DELIVERED"].includes(a.status) ? "success" : ["REJECTED", "EXPIRED", "CANCELLED"].includes(a.status) ? "neutral" : "brand"}>{a.status.toLowerCase().replace(/_/g, " ")}</Badge></div>
                  <p className="text-xs text-muted">{a.distanceKm ?? "–"} km · earns {formatINR(a.earningPaise)} · offered {dt(a.offeredAt)}</p>
                  {a.rejectionReason && <p className="text-xs text-maroon-600">{a.rejectionReason}</p>}
                  {a.partnerPhone && ["ACCEPTED", "AT_STORE", "PICKED_UP", "OUT_FOR_DELIVERY"].includes(a.status) && <a href={`tel:${a.partnerPhone}`} className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-saffron-700"><Phone className="h-3 w-3" />Call rider</a>}
                </li>
              ))}</ul>
            )}
            {data.tracking.partnerLocation && (
              <a href={googleMapsDirectionsUrl(data.tracking.partnerLocation)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-saffron-700"><ExternalLink className="h-3 w-3" />Rider live location (updated {dt(data.tracking.partnerLocation.at)}){data.tracking.etaMinutes ? ` · ETA ${data.tracking.etaMinutes} min` : ""}</a>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-lg font-semibold text-ink">Payments & refunds</h2>
              <Can any={["refunds.manage"]}>{["PAID", "PARTIALLY_REFUNDED", "COD_COLLECTED"].includes(o.paymentStatus) && <Button size="sm" variant="outline" onClick={() => setRefundOpen(true)}><Undo2 className="h-4 w-4" />Refund</Button>}</Can>
            </div>
            <ul className="space-y-2 text-sm">
              {o.payments.map((p) => <li key={p.id} className="rounded-xl bg-surface-2 p-3"><div className="flex justify-between"><b>{p.method === "COD" ? "Cash on delivery" : `Razorpay${p.methodDetail ? ` · ${p.methodDetail}` : ""}`}</b><span>{formatINR(p.amountPaise)}</span></div><p className="text-xs text-muted">{p.status.toLowerCase()} · {dt(p.createdAt)}{p.gatewayPaymentId ? ` · ${p.gatewayPaymentId}` : ""}</p>{p.failureReason && <p className="text-xs text-maroon-600">{p.failureReason}</p>}</li>)}
              {o.refunds.map((r) => (
                <li key={r.id} className="rounded-xl border border-line-soft p-3"><div className="flex justify-between"><b>Refund · {r.method.toLowerCase()}</b><span>{formatINR(r.amountPaise)}</span></div><p className="text-xs text-muted">{r.status.toLowerCase()} · {r.reason}{r.reference ? ` · ref ${r.reference}` : ""}</p>{r.failureReason && <p className="text-xs text-maroon-600">{r.failureReason}</p>}
                  {r.gatewayRefundId && r.status === "PROCESSING" && <button type="button" className="mt-1 text-xs font-bold text-saffron-700" onClick={() => void act("Refund status synced", () => api.post(`/admin/orders/refunds/${r.id}/sync`))}>Sync status from Razorpay</button>}</li>
              ))}
            </ul>
          </Card>

          {o.returnRequests.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 font-display text-lg font-semibold text-ink">Return requests</h2>
              {o.returnRequests.map((r) => (
                <div key={r.id} className="space-y-2 rounded-xl border border-line-soft p-3 text-sm">
                  <div className="flex justify-between"><b>{r.reason}</b><Badge tone={r.status === "REQUESTED" ? "warning" : r.status === "REJECTED" ? "danger" : "success"}>{r.status.toLowerCase()}</Badge></div>
                  {r.description && <p className="text-ink-soft">{r.description}</p>}
                  {r.images.length > 0 && <div className="flex gap-2">{r.images.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={u} alt="Customer photo" className="h-14 w-14 rounded-lg object-cover" /></a>)}</div>}
                  {r.status === "REQUESTED" && can("refunds.manage") && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => confirmAction("Approve and refund the remaining order amount?") && void act("Return approved & refunded", () => api.post(`/admin/orders/returns/${r.id}/decision`, { decision: "APPROVE" }))}>Approve & refund</Button>
                      <Button size="sm" variant="outline" onClick={() => { const n = prompt("Reason for rejection (shared with customer)"); if (n) void act("Return rejected", () => api.post(`/admin/orders/returns/${r.id}/decision`, { decision: "REJECT", note: n })); }}>Reject</Button>
                    </div>
                  )}
                </div>
              ))}
            </Card>
          )}
        </aside>
      </div>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel order" description="Stock is released, coupons and points are restored, and paid orders are refunded automatically."
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setCancelOpen(false)}>Back</Button><Button variant="danger" disabled={cancelReason.trim().length < 3} loading={busy === "Order cancelled"} onClick={() => void act("Order cancelled", async () => { await api.post(`/admin/orders/${id}/status`, { status: "CANCELLED", note: cancelReason }); setCancelOpen(false); })}>Cancel order</Button></div>}>
        <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason (shared with the customer)" />
      </Modal>
      {assignOpen && <AssignModal orderId={id} onClose={() => setAssignOpen(false)} onDone={() => { setAssignOpen(false); void reload(); }} />}
      {refundOpen && <RefundModal order={o} onClose={() => setRefundOpen(false)} onDone={() => { setRefundOpen(false); void reload(); }} />}
    </Guard>
  );
}

function AssignModal({ orderId, onClose, onDone }: { orderId: string; onClose: () => void; onDone: () => void }) {
  const { data } = useResource<{ items: { id: string; user: { name: string; phone: string }; isOnline: boolean; activeDeliveries: number; vehicleType: string; lastLocationAt: string | null }[] }>("/admin/people/partners", { status: "APPROVED", pageSize: 100 });
  const [partnerId, setPartnerId] = useState("");
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (body: object) => {
    setBusy(true);
    try { await api.post(`/admin/orders/${orderId}/assign`, body); toast.success("Delivery offered"); onDone(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Assign delivery partner" footer={<div className="flex flex-wrap justify-between gap-2"><Button variant="outline" loading={busy} onClick={() => void run({})}>Auto-assign nearest</Button><Button disabled={!partnerId} loading={busy} onClick={() => void run({ partnerId, force })}>{force ? "Assign directly" : "Send offer"}</Button></div>}>
      <Field label="Partner">{(p) => <Select {...p} value={partnerId} onChange={(e) => setPartnerId(e.target.value)}><option value="">Choose…</option>{data?.items.map((x) => <option key={x.id} value={x.id}>{x.user.name} · {x.isOnline ? "online" : "offline"} · {x.activeDeliveries} active · {x.vehicleType.toLowerCase()}</option>)}</Select>}</Field>
      <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />Assign directly without asking (e.g. arranged by phone)</label>
    </Modal>
  );
}

function RefundModal({ order, onClose, onDone }: { order: AdminOrder; onClose: () => void; onDone: () => void }) {
  const remaining = order.totals.totalPaise - order.totals.refundedPaise;
  const online = order.payments.some((p) => p.method === "ONLINE" && p.status === "CAPTURED");
  const [f, setF] = useState({ amount: String(remaining / 100), reason: "", method: online ? "GATEWAY" : "MANUAL", reference: "" });
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Issue refund" description={`Up to ${formatINR(remaining)} can be refunded.`}
      footer={<div className="flex justify-end"><Button loading={busy} disabled={!f.reason || Number(f.amount) <= 0} onClick={async () => {
        setBusy(true);
        try { await api.post(`/admin/orders/${order.id}/refunds`, { amountPaise: toPaise(f.amount), reason: f.reason, method: f.method, reference: f.reference || undefined }); toast.success("Refund created"); onDone(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Refund {formatINR(toPaise(f.amount))}</Button></div>}>
      <div className="space-y-4">
        <Field label="Amount (₹)">{(p) => <Input {...p} type="number" min="1" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />}</Field>
        <Field label="Method">{(p) => <Select {...p} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{online && <option value="GATEWAY">Razorpay (original payment method)</option>}<option value="MANUAL">Manual (UPI / bank transfer already done)</option></Select>}</Field>
        {f.method === "MANUAL" && <Field label="Transfer reference">{(p) => <Input {...p} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="UTR / UPI reference" />}</Field>}
        <Field label="Reason">{(p) => <Textarea {...p} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />}</Field>
      </div>
    </Modal>
  );
}
