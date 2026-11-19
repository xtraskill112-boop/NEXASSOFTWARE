import type { OrderStatus } from "./constants";

/** Allowed transitions in the order lifecycle. */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "PREPARING", "CANCELLED"],
  PROCESSING: ["PREPARING", "PACKED", "CANCELLED"],
  PREPARING: ["PACKED", "CANCELLED"],
  PACKED: ["READY_FOR_PICKUP", "CANCELLED"],
  READY_FOR_PICKUP: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: ["OUT_FOR_DELIVERY", "DELIVERED"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: ["REFUND_INITIATED"],
  CANCELLED: ["REFUND_INITIATED"],
  REFUND_INITIATED: ["REFUNDED"],
  REFUNDED: [],
};

/** Kitchen/packing transitions that require only `orders.process`. */
export const PROCESS_TRANSITIONS: OrderStatus[] = ["PROCESSING", "PREPARING", "PACKED", "READY_FOR_PICKUP"];

/** Statuses during which stock is reserved (not yet shipped). */
export const PRE_DISPATCH_STATUSES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "PREPARING",
  "PACKED",
  "READY_FOR_PICKUP",
];

export const ACTIVE_STATUSES: OrderStatus[] = [...PRE_DISPATCH_STATUSES, "DISPATCHED", "OUT_FOR_DELIVERY"];

/** A customer may self-cancel only before the kitchen starts preparing. */
export const CUSTOMER_CANCELLABLE: OrderStatus[] = ["PENDING", "CONFIRMED", "PROCESSING"];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextStatuses(from: OrderStatus): OrderStatus[] {
  return ORDER_TRANSITIONS[from] ?? [];
}

/** Orders that no longer need operational attention. */
export const CLOSED_STATUSES: OrderStatus[] = ["DELIVERED", "CANCELLED", "REFUND_INITIATED", "REFUNDED"];

export function isClosed(status: OrderStatus): boolean {
  return CLOSED_STATUSES.includes(status);
}
