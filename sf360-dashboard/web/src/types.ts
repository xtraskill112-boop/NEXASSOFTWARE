import type { Timestamp } from "firebase/firestore";

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

export interface PartyAddress {
  name: string | null;
  contact: string | null;
  alternateContact: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  pincode: number | null;
  email: string | null;
}

export interface TrackEvent {
  at: string;
  statusId: string;
  status: string;
  location: string | null;
  remarks: string | null;
  source: "track" | "webhook" | "app";
}

export interface Shipment {
  awb: string;
  kind: Kind;
  env: "staging" | "production";
  orderType: "marketplace" | "warehouse" | null;
  clientOrderId: string | null;
  status: string;
  statusDisplay: string;
  statusGroup: StatusGroup;
  isActive: boolean;
  paymentMode: "cod" | "prepaid" | null;
  codAmount: number;
  productValue: number;
  totalAmount: number | null;
  weightKg: number | null;
  customer: PartyAddress;
  pickup: PartyAddress | null;
  returnAddress: PartyAddress | null;
  returnType: "seller" | "origin" | null;
  products: { name: string; skuId: string | null; price: number; quantity: number | null }[];
  pickupDate: string | null;
  pickupSlot: string | null;
  orderDate: string;
  trackUrl: string | null;
  sortCode: string | null;
  events: TrackEvent[];
  lastEventAt: Timestamp | null;
  riderName: string | null;
  riderContact: string | null;
  label: { url: string; fileType: string; expiresAt: Timestamp } | null;
  pod: Record<string, unknown> | null;
  source: "app" | "bulk" | "webhook";
  createdBy: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastSyncedAt: Timestamp | null;
  syncError: string | null;
  cancelRequested: { at: Timestamp; message: string; queued: boolean } | null;
  history: { at: Timestamp; by: string; action: string; detail: string }[];
}

export interface SavedAddress {
  id: string;
  label: string;
  name?: string | null;
  contact?: string | null;
  alternateContact?: string | null;
  address1: string;
  address2?: string | null;
  city: string;
  state?: string | null;
  pincode: number;
  email?: string | null;
  uniqueCode?: string | null;
}

export interface AppSettings {
  supplyChain: "regular" | "surface";
  defaultOrderType: "marketplace" | "warehouse";
  defaultReturnType: "seller" | "origin";
  defaultPickupId: string | null;
  defaultReturnId: string | null;
  pickupSlots: string[];
  sellerGstin: string | null;
}

export interface AppInfo {
  email: string;
  env: "staging" | "production";
  panelUrl: string;
  region: string;
}

export interface BulkJob {
  status: "running" | "done";
  env: string;
  fileName: string | null;
  total: number;
  done: number;
  succeeded: number;
  failed: number;
  stopReason?: string | null;
  rows: { row: number; ok: boolean; clientOrderId: string | null; awb: string | null; message: string }[];
}
