/**
 * Shadowfax status codes → dashboard buckets.
 * Sources: Unified API "Order States" tables, developer.shadowfax.in OrderDetails.status enum,
 * Reverse Logistics webhook status list and PickupTrackingResponse.state display names.
 * Unknown codes are kept as-is and fall into "other" (the docs say to treat the set as open).
 */

export type Kind = "forward" | "reverse";

export type StatusGroup =
  | "booked"
  | "pickup_pending"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "ndr"
  | "rto"
  | "cancelled"
  | "lost"
  | "other";

export const STATUS_GROUPS: StatusGroup[] = [
  "booked",
  "pickup_pending",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "ndr",
  "rto",
  "cancelled",
  "lost",
  "other",
];

const FORWARD_GROUPS: Record<string, StatusGroup> = {
  new: "booked",
  assigned_for_pickup: "pickup_pending",
  assigned_for_seller_pickup: "pickup_pending",
  ofp: "pickup_pending",
  seller_initiated_delay: "pickup_pending",
  seller_not_contactable: "pickup_pending",
  pickup_not_attempted: "pickup_pending",
  pickup_on_hold: "pickup_pending",
  picked: "in_transit",
  received_from_client_warehouse: "in_transit",
  recd_at_rev_hub: "in_transit",
  item_manifested: "in_transit",
  bag_in_transit: "in_transit",
  bag_received: "in_transit",
  bag_received_at_via: "in_transit",
  recd_at_fwd_hub: "in_transit",
  recd_at_fwd_dc: "in_transit",
  assigned_for_delivery: "in_transit",
  pincode_updated: "in_transit",
  item_misrouted: "in_transit",
  pending_inscan: "in_transit",
  reopen_ndr: "in_transit",
  ofd: "out_for_delivery",
  delivered: "delivered",
  partially_delivered: "delivered",
  cid: "ndr",
  nc: "ndr",
  na: "ndr",
  on_hold: "ndr",
  ewb_on_hold: "ndr",
  qc_failed: "ndr",
  rts: "rto",
  rts_in_process: "rto",
  rts_ofd: "rto",
  rts_nd: "rto",
  rts_d: "rto",
  rto: "rto",
  rto_in_process: "rto",
  rto_d: "rto",
  rto_nd: "rto",
  in_transit_return: "rto",
  recd_at_dc_rts: "rto",
  cancelled_by_customer: "cancelled",
  cancelled_by_seller: "cancelled",
  lost: "lost",
};

/** For returns, "delivered" means the item came back to you (rts_d / rto_d). */
const REVERSE_GROUPS: Record<string, StatusGroup> = {
  new: "booked",
  assigned_for_pickup: "pickup_pending",
  ofp: "pickup_pending",
  cid: "ndr",
  nc: "ndr",
  na: "ndr",
  on_hold: "ndr",
  qc_failed: "ndr",
  picked: "in_transit",
  recd_at_rev_hub: "in_transit",
  recd_at_dc: "in_transit",
  pending_inscan: "in_transit",
  item_manifested: "in_transit",
  bag_in_transit: "in_transit",
  bag_received: "in_transit",
  bag_received_at_via: "in_transit",
  in_transit_return: "in_transit",
  rts: "in_transit",
  rts_in_process: "in_transit",
  rto_in_process: "in_transit",
  recd_at_rts_hub: "in_transit",
  item_misrouted: "in_transit",
  pincode_updated: "in_transit",
  reopen: "in_transit",
  rts_ofd: "out_for_delivery",
  rts_d: "delivered",
  rto_d: "delivered",
  rts_nd: "ndr",
  rto_nd: "ndr",
  cancelled_by_customer: "cancelled",
  lost: "lost",
};

export function groupFor(kind: Kind, statusId: string): StatusGroup {
  const table = kind === "reverse" ? REVERSE_GROUPS : FORWARD_GROUPS;
  return table[statusId] ?? "other";
}

/** Statuses after which nothing more happens to a shipment. */
const TERMINAL = new Set(["delivered", "partially_delivered", "rts_d", "rto_d", "lost"]);
const CANCELLED = new Set(["cancelled_by_customer", "cancelled_by_seller"]);

/** Statuses that mean the item physically left the pickup point (so a cancel turns into a return journey). */
const PICKED_UP = new Set([
  "picked",
  "received_from_client_warehouse",
  "recd_at_rev_hub",
  "item_manifested",
  "bag_in_transit",
  "recd_at_fwd_hub",
  "recd_at_fwd_dc",
  "ofd",
]);

/**
 * Should the backup sync keep polling this shipment?
 * A cancelled shipment stays active if it was already picked up — Shadowfax then sends it back (RTS/RTO).
 */
export function isActiveStatus(statusId: string, history: string[] = []): boolean {
  if (TERMINAL.has(statusId)) return false;
  if (CANCELLED.has(statusId)) return history.some((s) => PICKED_UP.has(s));
  return true;
}

/** Labels used when Shadowfax only sends a code (e.g. bulk tracking) — taken from the docs' status tables. */
export const STATUS_LABELS: Record<string, string> = {
  new: "New",
  assigned_for_pickup: "Assigned For Pickup",
  assigned_for_seller_pickup: "Assigned For Pickup",
  ofp: "Out For Pickup",
  picked: "Picked",
  qc_failed: "QC Failed",
  received_from_client_warehouse: "Received from Client Warehouse",
  seller_initiated_delay: "Seller Initiated Delay",
  seller_not_contactable: "Seller Not Contactable",
  pickup_not_attempted: "Pickup Not Attempted",
  pickup_on_hold: "Pickup On Hold",
  recd_at_rev_hub: "Received At Reverse Hub",
  recd_at_fwd_hub: "Received At Forward Hub",
  recd_at_fwd_dc: "Received At DC",
  recd_at_dc: "Received at Return DC",
  item_manifested: "Item added to Bag",
  bag_in_transit: "Bag In Transit",
  bag_received: "Bag Received",
  bag_received_at_via: "Bag Received at Via",
  assigned_for_delivery: "Assigned for Customer Delivery",
  ofd: "Out For Delivery",
  delivered: "Delivered",
  partially_delivered: "Partially Delivered",
  cid: "Customer Initiated Delay",
  nc: "Not Contactable",
  na: "Not Attempted",
  on_hold: "On Hold",
  ewb_on_hold: "E-way Bill On Hold",
  pincode_updated: "Pincode Updated",
  item_misrouted: "Item Misrouted",
  reopen_ndr: "Require Delivery - NDR",
  reopen: "ReOpen",
  cancelled_by_customer: "Cancelled",
  cancelled_by_seller: "Cancelled By Seller",
  rts: "Return to Seller initiated",
  rts_in_process: "RTS In Progress",
  rts_ofd: "Out for Delivery for RTS",
  rts_d: "Returned To Seller",
  rts_nd: "RTS Undelivered",
  rto: "Return to Origin initiated",
  rto_in_process: "RTO In Progress",
  rto_d: "Returned to Origin",
  rto_nd: "RTO Undelivered",
  in_transit_return: "In Transit for Return",
  recd_at_dc_rts: "Received at RTS DC",
  recd_at_rts_hub: "Received at RTS destination hub",
  lost: "Lost",
  pending_inscan: "Pending Inscan",
};

export function labelFor(statusId: string): string {
  return (
    STATUS_LABELS[statusId] ??
    statusId
      .split("_")
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" ")
  );
}

/**
 * Reverse tracking returns display names (e.g. "Out For Pickup"), webhooks return codes (e.g. "ofp").
 * Map display names to the same codes so both sources agree.
 */
export function reverseCodeFromDisplay(display: string, returnType: "seller" | "origin" | null): string {
  const d = display.trim().toLowerCase();
  const returnedCode = returnType === "seller" ? "rts" : "rto";
  const map: Record<string, string> = {
    new: "new",
    assigned: "assigned_for_pickup",
    "out for pickup": "ofp",
    picked: "picked",
    received: "recd_at_rev_hub",
    cancelled: "cancelled_by_customer",
    cid: "cid",
    "not contactable": "nc",
    "not attempted": "na",
    undelivered: `${returnedCode}_nd`,
    "on hold": "on_hold",
    "returned to client": `${returnedCode}_d`,
    "qc failed": "qc_failed",
    lost: "lost",
    "pending inscan": "pending_inscan",
    "item added to bag": "item_manifested",
    "bag in transit": "bag_in_transit",
    "bag received": "bag_received",
    "bag received at via": "bag_received_at_via",
    "received at return dc": "recd_at_dc",
    "in transit for rts": "rts_in_process",
    "in transit for rto": "rto_in_process",
    "bag in transit for return": "in_transit_return",
    "received at rts destination hub": "recd_at_rts_hub",
    "return shipment out for delivery": "rts_ofd",
    "return to seller initiated": "rts",
    "item misrouted": "item_misrouted",
    "pincode updated": "pincode_updated",
    reopen: "reopen",
  };
  return map[d] ?? toCode(display);
}

/** Any free text → a stable lower_snake code. */
export function toCode(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}
