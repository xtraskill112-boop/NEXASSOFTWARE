import type { Kind, StatusGroup } from "../types";

export interface GroupMeta {
  label: string;
  /** Returns use different wording for the same buckets. */
  reverseLabel: string;
  tone: "neutral" | "info" | "warn" | "good" | "serious" | "critical";
  hint: string;
}

export const GROUPS: Record<StatusGroup, GroupMeta> = {
  booked: { label: "Booked", reverseLabel: "Booked", tone: "neutral", hint: "Order created, waiting for pickup assignment" },
  pickup_pending: { label: "Pickup pending", reverseLabel: "Pickup pending", tone: "info", hint: "Rider assigned or out for pickup" },
  in_transit: { label: "In transit", reverseLabel: "On the way back", tone: "info", hint: "Picked up and moving through hubs" },
  out_for_delivery: { label: "Out for delivery", reverseLabel: "Out for delivery to you", tone: "warn", hint: "Rider is on the way" },
  delivered: { label: "Delivered", reverseLabel: "Returned to you", tone: "good", hint: "Completed" },
  ndr: { label: "Needs action (NDR)", reverseLabel: "Pickup failed / on hold", tone: "serious", hint: "Delivery failed — re-attempt or return" },
  rto: { label: "RTO / RTS", reverseLabel: "RTO / RTS", tone: "serious", hint: "Coming back to you" },
  cancelled: { label: "Cancelled", reverseLabel: "Cancelled", tone: "neutral", hint: "Cancelled" },
  lost: { label: "Lost", reverseLabel: "Lost", tone: "critical", hint: "Marked lost by Shadowfax" },
  other: { label: "Other", reverseLabel: "Other", tone: "neutral", hint: "Status not mapped yet" },
};

export const DASHBOARD_GROUPS: StatusGroup[] = [
  "booked",
  "pickup_pending",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "ndr",
  "rto",
  "cancelled",
];

export function groupLabel(group: StatusGroup, kind: Kind): string {
  const m = GROUPS[group] ?? GROUPS.other;
  return kind === "reverse" ? m.reverseLabel : m.label;
}

export const TONE_CLASSES: Record<GroupMeta["tone"], string> = {
  neutral: "bg-subtle text-ink-2 ring-line",
  info: "bg-info-soft text-info ring-info/20",
  warn: "bg-warn-soft text-warn ring-warn/25",
  good: "bg-good-soft text-good ring-good/20",
  serious: "bg-serious-soft text-serious ring-serious/20",
  critical: "bg-critical-soft text-critical ring-critical/20",
};

/** Forward statuses where editing delivery details is still allowed (before OFD). */
export function canEditDelivery(group: StatusGroup): boolean {
  return group === "booked" || group === "pickup_pending" || group === "in_transit" || group === "ndr";
}

/** Labels can only be generated before pickup. */
export function canPrintLabel(kind: Kind, group: StatusGroup): boolean {
  return kind === "forward" && (group === "booked" || group === "pickup_pending");
}

/** Reverse pickups cannot be cancelled once Out For Pickup / Picked. */
export function canCancel(kind: Kind, status: string, group: StatusGroup, isActive: boolean): boolean {
  if (!isActive || group === "cancelled" || group === "delivered") return false;
  if (kind === "reverse") return status === "new" || status === "assigned_for_pickup" || group === "ndr";
  return group !== "rto";
}
