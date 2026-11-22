"use client";
import { motion } from "framer-motion";
import { Bike, Phone, ShieldCheck, Star } from "lucide-react";
import type { Order, Tracking } from "@naamdev/api-client";
import { TRACKING_MILESTONES, ORDER_STATUS_META } from "@naamdev/shared";
import { Avatar, Card, cn } from "@naamdev/ui";
import { useI18n } from "@/lib/i18n";
import { LiveMap } from "./live-map";

export function TrackingCard({ order, tracking }: { order: Order; tracking: Tracking | null }) {
  const { t } = useI18n();
  const idx = TRACKING_MILESTONES.findIndex((m) => m.statuses.includes(order.status));
  const active = idx >= 0 && order.status !== "DELIVERED";
  const eta = tracking?.etaMinutes ?? (order.estimatedDeliveryAt ? Math.max(1, Math.round((new Date(order.estimatedDeliveryAt).getTime() - Date.now()) / 60000)) : null);
  return (
    <Card className="overflow-hidden">
      <div className="nd-gradient-maroon p-5 text-cream-100 sm:p-6">
        <p className="text-[13px] font-semibold text-cream-200">{ORDER_STATUS_META[order.status].label}</p>
        <p className="mt-1 font-display text-2xl font-semibold">{ORDER_STATUS_META[order.status].description}</p>
        {active && eta != null && eta > 0 && <p className="mt-1 text-sm text-cream-200/85">{t("order.eta")} <b className="text-white">~{eta} min</b></p>}
        <div className="mt-5 flex items-center">
          {TRACKING_MILESTONES.map((m, i) => (
            <div key={m.key} className="flex flex-1 items-center last:flex-none">
              <div className="relative flex flex-col items-center">
                <motion.span initial={false} animate={{ scale: i === idx ? 1.15 : 1 }} className={cn("grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold", i <= idx ? "bg-maroon-700 text-maroon-900" : "bg-white/15 text-cream-200/60")}>{i < idx || order.status === "DELIVERED" ? "✓" : i + 1}</motion.span>
                {i === idx && order.status !== "DELIVERED" && <span className="absolute h-7 w-7 animate-pulse-ring rounded-full bg-maroon-400/40" />}
                <span className="absolute top-8 hidden w-24 text-center text-[10px] font-semibold text-cream-200/80 sm:block">{m.label}</span>
              </div>
              {i < TRACKING_MILESTONES.length - 1 && <div className="mx-1 h-1 flex-1 overflow-hidden rounded-full bg-white/15"><motion.div className="h-full bg-maroon-700" initial={false} animate={{ width: i < idx ? "100%" : "0%" }} /></div>}
            </div>
          ))}
        </div>
        <div className="h-4 sm:h-6" />
      </div>
      <div className="space-y-4 p-5 sm:p-6">
        {order.deliveryOtp && (
          <div className="flex items-center justify-between rounded-2xl border-2 border-dashed border-maroon-300 bg-surface-2 p-4">
            <div><p className="flex items-center gap-1.5 text-sm font-bold text-ink"><ShieldCheck className="h-4 w-4 text-maroon-700" />{t("order.deliveryOtp")}</p><p className="mt-0.5 text-xs text-muted">{t("order.otpHint")}</p></div>
            <p className="font-mono text-3xl font-bold tracking-[0.3em] text-maroon-800 dark:text-maroon-200">{order.deliveryOtp}</p>
          </div>
        )}
        {tracking && (tracking.partnerLocation || ["DISPATCHED", "OUT_FOR_DELIVERY"].includes(order.status)) && (
          tracking.partnerLocation || tracking.path.length ? <LiveMap tracking={tracking} /> : <p className="rounded-2xl bg-surface-2 p-4 text-sm text-muted">Live location will appear here as soon as your delivery partner&apos;s GPS updates.</p>
        )}
        {order.deliveryPartner && (
          <div className="flex items-center gap-4 rounded-2xl bg-surface-2 p-4">
            <Avatar name={order.deliveryPartner.name} src={order.deliveryPartner.avatarUrl} size={48} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-muted">{t("order.partner")}</p>
              <p className="font-semibold text-ink">{order.deliveryPartner.name}</p>
              <p className="flex items-center gap-2 text-xs text-muted"><Bike className="h-3.5 w-3.5" />{order.deliveryPartner.vehicleNumber ?? order.deliveryPartner.vehicleType.replace("_", " ").toLowerCase()} <Star className="h-3 w-3 fill-gold-400 text-gold-400" />{order.deliveryPartner.rating.toFixed(1)}</p>
            </div>
            {order.deliveryPartner.phone && <a href={`tel:${order.deliveryPartner.phone}`} aria-label="Call delivery partner" className="grid h-11 w-11 place-items-center rounded-full bg-pista-600 text-white shadow"><Phone className="h-5 w-5" /></a>}
          </div>
        )}
      </div>
    </Card>
  );
}
