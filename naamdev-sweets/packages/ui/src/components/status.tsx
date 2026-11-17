import { ORDER_PAYMENT_STATUS_META, ORDER_STATUS_META, type OrderStatus } from "@naamdev/shared";
import { Badge } from "./display";

export function OrderStatusBadge({ status, locale = "en", className }: { status: OrderStatus; locale?: "en" | "hi"; className?: string }) {
  const m = ORDER_STATUS_META[status];
  return (
    <Badge tone={m.tone} dot className={className}>
      {locale === "hi" ? m.labelHi : m.label}
    </Badge>
  );
}

export function PaymentStatusBadge({ status, className }: { status: string; className?: string }) {
  const m = ORDER_PAYMENT_STATUS_META[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={m.tone} className={className}>{m.label}</Badge>;
}
