import { httpsCallable } from "firebase/functions";
import { FirebaseError } from "firebase/app";
import { functions } from "./firebase";
import type { AppInfo } from "./types";

function call<Req, Res>(name: string, timeout = 70_000) {
  return async (data: Req): Promise<Res> => {
    const fn = httpsCallable<Req, Res>(functions, name, { timeout });
    const res = await fn(data);
    return res.data;
  };
}

export interface AddressPayload {
  name?: string;
  contact?: string;
  alternateContact?: string;
  address1: string;
  address2?: string;
  city: string;
  state?: string;
  pincode: string | number;
  email?: string;
  uniqueCode?: string;
}

export interface ForwardOrderPayload {
  orderType: "marketplace" | "warehouse";
  clientOrderId: string;
  paymentMode: "prepaid" | "cod";
  codAmount: number | string;
  productValue: number | string;
  totalAmount?: number | string;
  actualWeightKg?: number | string;
  volumetricWeightKg?: number | string;
  ewayBill?: string;
  sellerGstin?: string;
  customer: AddressPayload & { name: string; contact: string; locationType?: "residential" | "commercial" };
  pickup: AddressPayload & { pickupDate?: string; pickupSlot?: string };
  returnType: "seller" | "origin";
  returnAddress: AddressPayload;
  products: { name: string; skuId: string; price: number | string; quantity?: number | string; category?: string; hsnCode?: string; invoiceNo?: string }[];
}

export interface ReverseOrderPayload {
  clientOrderId: string;
  customer: AddressPayload & { name: string; contact: string };
  returnType: "seller" | "origin";
  returnAddress: AddressPayload;
  price?: number | string;
  totalAmount?: number | string;
  ewayBill?: string;
  actualWeightKg?: number | string;
  items: { name: string; price: number | string; skuId?: string; returnReason?: string; qcRequired?: boolean; quantity?: number | string; brand?: string; category?: string; color?: string; size?: string }[];
}

export type BookResult =
  | { ok: true; awb: string; duplicate: false }
  | { ok: false; duplicate: true; awb: string; errors: string[] }
  | { ok: false; duplicate: false; errors: string[] };

export interface LegResult {
  leg: "pickup" | "delivery" | "return";
  service: string;
  pincode: number;
  tiers: string[];
  expectedTier: string;
  serviceable: boolean;
}

export interface ServiceabilityResult {
  supplyChain: "regular" | "surface";
  legs: LegResult[];
  serviceable: boolean;
}

export interface RateQuote {
  available: boolean;
  message: string;
  zone: string | null;
  shippingRate: number | null;
  gst: number | null;
}

type Msg = { ok: boolean; message: string };

export const api = {
  appInfo: call<Record<string, never>, AppInfo>("appInfo"),
  checkServiceability: call<
    {
      kind: "forward" | "reverse";
      orderType?: "marketplace" | "warehouse";
      returnType?: "seller" | "origin";
      pickupPincode?: string | number;
      customerPincode: string | number;
      returnPincode?: string | number;
    },
    ServiceabilityResult
  >("checkServiceability"),
  getRate: call<{ originPincode: string | number; destinationPincode: string | number; service: "forward" | "reverse" | "reverse_qc"; weightKg?: number | string }, RateQuote>("getRate"),
  createShipment: call<ForwardOrderPayload, BookResult>("createShipment"),
  createReturn: call<ReverseOrderPayload, { ok: true; awb: string } | { ok: false; errors: string[] }>("createReturn"),
  bulkCreateShipments: call<{ jobId: string; fileName?: string; orders: ForwardOrderPayload[] }, { jobId: string; total: number; succeeded: number; failed: number }>(
    "bulkCreateShipments",
    560_000,
  ),
  refreshShipment: call<{ awb: string }, { ok: boolean; status?: string; message?: string }>("refreshShipment"),
  updateShipment: call<
    {
      awb: string;
      delivery?: { contact?: string; alternateContact?: string; address?: string; pincode?: string | number };
      pickup?: { contact?: string; alternateContact?: string; address?: string; pincode?: string | number };
      returnDetails?: { contact?: string; address?: string; pincode?: string | number; email?: string };
      order?: { codAmount?: number | string; ewayBillNumber?: string; invoiceNumber?: string; actualWeightKg?: number | string };
    },
    Msg
  >("updateShipment"),
  ndrAction: call<{ awb: string; action: "reopen_ndr" | "rts" | "rto"; delivery?: { contact?: string; address?: string; pincode?: string | number } }, Msg>("ndrAction"),
  cancelShipment: call<{ awb: string; remarks: string }, Msg & { queued?: boolean }>("cancelShipment"),
  getLabel: call<{ awb: string; fileType: "pdf" | "prn" }, { ok: true; url: string; cached: boolean } | { ok: false; message: string }>("getLabel"),
  getPod: call<{ awb: string }, { ok: true; pod: Record<string, unknown> | null } | { ok: false; message: string }>("getPod"),
  getWebhookInfo: call<Record<string, never>, { headerName: string; headerValue: string; path: string }>("getWebhookInfo"),
  recountStats: call<Record<string, never>, { shipments: number }>("recountStats", 310_000),
};

/** Readable message for any callable error. */
export function errorMessage(err: unknown): string {
  if (err instanceof FirebaseError) {
    if (err.code === "functions/deadline-exceeded") return "This is taking too long. Check the list in a minute — it may still have gone through.";
    if (err.code === "functions/unavailable" && !err.message) return "Could not reach the server. Check your internet connection.";
    return err.message || err.code;
  }
  return err instanceof Error ? err.message : String(err);
}

/** Field-level problems returned by the server's validation (details.issues). */
export function errorIssues(err: unknown): { path: string; message: string }[] {
  if (err instanceof FirebaseError) {
    const details = (err as FirebaseError & { details?: { issues?: { path: string; message: string }[] } }).details;
    if (details?.issues) return details.issues;
  }
  return [];
}
