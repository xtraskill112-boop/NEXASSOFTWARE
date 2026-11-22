"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Order } from "@naamdev/api-client";
import { formatINR } from "@naamdev/shared";
import { Card, OrderStatusBadge } from "@naamdev/ui";
import { useI18n } from "@/lib/i18n";
import { ProductImage } from "../common/product-image";

export function OrderCard({ order }: { order: Order }) {
  const { locale } = useI18n();
  return (
    <Link href={`/account/orders/${order.id}`}>
      <Card interactive className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div><p className="font-mono text-sm font-bold text-ink">{order.orderNumber}</p><p className="text-xs text-muted">{new Date(order.placedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p></div>
          <OrderStatusBadge status={order.status} locale={locale} />
        </div>
        <div className="mt-4 flex items-center gap-2">
          <div className="flex -space-x-3">{order.items.slice(0, 4).map((i) => <ProductImage key={i.id} src={i.imageUrl} alt={i.name} className="h-12 w-12 rounded-xl ring-2 ring-surface" sizes={96} />)}</div>
          <p className="min-w-0 flex-1 truncate text-sm text-ink-soft">{order.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</p>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-line-soft pt-3">
          <span className="font-bold text-ink">{formatINR(order.totals.totalPaise)}</span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-maroon-700 dark:text-maroon-200">Details <ChevronRight className="h-4 w-4" /></span>
        </div>
      </Card>
    </Link>
  );
}
