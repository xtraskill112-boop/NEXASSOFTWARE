"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Clock, MapPin } from "lucide-react";
import type { Order } from "@naamdev/api-client";
import { formatINR } from "@naamdev/shared";
import { BrandLoader, Card, Emblem, OrderStatusBadge, buttonStyles } from "@naamdev/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useRouteParam } from "@/lib/route-param";

const CONFETTI = ["#F57F0E", "#8F1D34", "#F3C969", "#8DB255", "#E17080"];

export default function OrderPlacedPage() {
  const id = useRouteParam("id", 1);
  const [order, setOrder] = useState<Order | null>(null);
  const { t } = useI18n();
  useEffect(() => { api.get<{ order: Order }>(`/orders/${id}`).then((r) => setOrder(r.order)).catch(() => undefined); }, [id]);
  if (!order) return <BrandLoader className="min-h-[70dvh]" />;
  const pending = order.status === "PENDING";
  return (
    <div className="relative mx-auto max-w-xl overflow-hidden px-4 pb-24 pt-10 text-center">
      {!pending && Array.from({ length: 28 }, (_, i) => (
        <motion.span key={i} className="pointer-events-none absolute top-0 h-3 w-2 rounded-sm" style={{ left: `${(i * 37) % 100}%`, background: CONFETTI[i % CONFETTI.length] }}
          initial={{ y: -20, rotate: 0, opacity: 1 }} animate={{ y: 700, rotate: 360 * (i % 2 ? 1 : -1), opacity: 0 }} transition={{ duration: 2.2 + (i % 5) * 0.3, delay: (i % 7) * 0.08, ease: "easeIn" }} />
      ))}
      <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", damping: 12 }} className="mx-auto w-fit">
        <div className="relative">
          <span className="absolute inset-0 animate-pulse-ring rounded-full bg-maroon-400/40" />
          <Emblem size={120} />
        </div>
      </motion.div>
      <h1 className="mt-6 font-display text-4xl font-semibold text-ink">{pending ? "Awaiting payment" : t("order.placed")}</h1>
      <p className="mt-2 text-ink-soft">{pending ? "Your order is reserved. Complete the payment to confirm it." : t("order.thanks")}</p>
      <Card className="mt-8 p-5 text-left">
        <div className="flex items-center justify-between">
          <div><p className="text-[13px] font-semibold text-muted">Order</p><p className="font-mono text-lg font-bold text-ink">{order.orderNumber}</p></div>
          <OrderStatusBadge status={order.status} />
        </div>
        <div className="mt-4 space-y-2 text-sm text-ink-soft">
          {order.estimatedDeliveryAt && <p className="flex items-center gap-2"><Clock className="h-4 w-4 text-maroon-700" />Arriving around {new Date(order.estimatedDeliveryAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</p>}
          <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-maroon-700" />{[order.address.line1, order.address.line2, order.address.city, order.address.pincode].filter(Boolean).join(", ")}</p>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-dashed border-line pt-4">
          <span className="text-sm text-muted">{order.items.reduce((s, i) => s + i.quantity, 0)} items · {order.paymentMethod === "COD" ? "Cash on delivery" : order.paymentMethod === "UPI" ? (order.paymentStatus === "PAID" ? "Paid by UPI" : "UPI payment pending") : "Paid online"}</span>
          <span className="text-lg font-extrabold text-ink">{formatINR(order.totals.totalPaise)}</span>
        </div>
      </Card>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Link href={`/account/orders/${order.id}`} className={buttonStyles({ size: "lg" })}>{pending ? t("order.retryPayment") : t("order.track")}</Link>
        <Link href="/" className={buttonStyles({ size: "lg", variant: "outline" })}>Keep shopping</Link>
      </div>
    </div>
  );
}
