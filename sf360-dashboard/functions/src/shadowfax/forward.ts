/**
 * Forward Logistics endpoints (developer.shadowfax.in → API Reference → Forward Logistics).
 * Field names follow the docs exactly; nothing here is invented.
 */
import type { SfEnv } from "../config";
import type { ForwardOrderInput, UpdateInput } from "../validation";
import { flattenErrors, pickMessage, sfRequest } from "./http";
import { labelFor } from "./status";
import type { TrackEvent, TrackSnapshot } from "./types";

/** Drops undefined / empty-string values so we only send what the user filled in. */
export function clean<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

/** POST /v3/clients/orders/ body. */
export function buildForwardOrderBody(o: ForwardOrderInput): Record<string, unknown> {
  const marketplace = o.orderType === "marketplace";
  return {
    order_type: o.orderType,
    order_details: clean({
      client_order_id: o.clientOrderId,
      product_value: o.productValue,
      payment_mode: o.paymentMode,
      cod_amount: o.paymentMode === "cod" ? o.codAmount : 0,
      total_amount: o.totalAmount,
      actual_weight: o.actualWeightKg,
      volumetric_weight: o.volumetricWeightKg,
      eway_bill: o.ewayBill,
    }),
    customer_details: clean({
      name: o.customer.name,
      contact: o.customer.contact,
      alternate_contact: o.customer.alternateContact,
      address_line_1: o.customer.address1,
      // The current schema calls line 2 "address2"; the Unified API docs and every response use "address_line_2".
      address_line_2: o.customer.address2,
      address2: o.customer.address2,
      city: o.customer.city,
      state: o.customer.state,
      pincode: o.customer.pincode,
      location_type: o.customer.locationType,
    }),
    pickup_details: clean({
      pickup_type: marketplace ? "seller" : "warehouse",
      name: o.pickup.name,
      contact: o.pickup.contact,
      address_line_1: o.pickup.address1,
      address_line_2: o.pickup.address2,
      city: o.pickup.city,
      state: o.pickup.state,
      pincode: o.pickup.pincode,
      unique_code: o.pickup.uniqueCode,
      // pickup_date / pickup_slot are only honoured on marketplace orders.
      pickup_date: marketplace ? o.pickup.pickupDate : undefined,
      pickup_slot: marketplace ? o.pickup.pickupSlot : undefined,
    }),
    return_details: clean({
      return_type: marketplace ? o.returnType : "origin",
      name: o.returnAddress.name,
      contact: o.returnAddress.contact,
      address_line_1: o.returnAddress.address1,
      address_line_2: o.returnAddress.address2,
      city: o.returnAddress.city,
      state: o.returnAddress.state,
      pincode: o.returnAddress.pincode,
      email: o.returnAddress.email,
      unique_code: o.returnAddress.uniqueCode,
    }),
    product_details: o.products.map((p) =>
      clean({
        sku_name: p.name,
        sku_id: p.skuId,
        price: p.price,
        category: p.category,
        hsn_code: p.hsnCode,
        invoice_no: p.invoiceNo,
        seller_details: o.sellerGstin ? { gstin_number: o.sellerGstin } : undefined,
        additional_details: p.quantity ? { quantity: p.quantity } : undefined,
      }),
    ),
  };
}

export type CreateResult =
  | { ok: true; awb: string; data: Record<string, unknown> }
  | { ok: false; errors: string[]; duplicateAwb?: string };

/**
 * Forward order creation answers HTTP 200 even when it rejects the order — branch on `message`.
 * Duplicate client_order_id: {"message":"Failure","errors":"Order for COID ... is already created with AWB : X","AWB":"X"}
 */
export function parseForwardCreate(status: number, body: unknown): CreateResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const data = (b.data ?? null) as Record<string, unknown> | null;
  if (status >= 200 && status < 300 && b.message === "Success" && data && typeof data.awb_number === "string") {
    return { ok: true, awb: data.awb_number, data };
  }
  const errors = flattenErrors(b.errors);
  if (!errors.length) errors.push(pickMessage(b) ?? `Shadowfax could not create the order (HTTP ${status}).`);
  const duplicateAwb = typeof b.AWB === "string" && b.AWB ? b.AWB : undefined;
  return { ok: false, errors, duplicateAwb };
}

export async function createForwardOrder(env: SfEnv, o: ForwardOrderInput): Promise<CreateResult> {
  const res = await sfRequest({
    env,
    method: "POST",
    path: "/v3/clients/orders/",
    body: buildForwardOrderBody(o),
    retry: "throttle-only",
  });
  return parseForwardCreate(res.status, res.data);
}

export interface CancelResult {
  ok: boolean;
  queued: boolean;
  message: string;
}

/** Cancellation answers {responseMsg, responseCode}; 304 inside the body means "queued for cancellation". */
export function parseCancel(status: number, body: unknown): CancelResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const code = typeof b.responseCode === "number" ? b.responseCode : status;
  const message = pickMessage(b) ?? `HTTP ${status}`;
  const ok = status >= 200 && status < 300 && (code === 200 || code === 304);
  return { ok, queued: ok && code === 304, message };
}

export async function cancelForwardOrder(env: SfEnv, awb: string, remarks: string): Promise<CancelResult> {
  const res = await sfRequest({
    env,
    method: "POST",
    path: "/v3/clients/orders/cancel/",
    body: { request_id: awb, cancel_remarks: remarks },
    retry: "throttle-only",
  });
  return parseCancel(res.status, res.data);
}

/** POST /v3/clients/order_update/ — send only the sections that change. */
export function buildUpdateBody(u: UpdateInput, statusUpdate?: "reopen_ndr" | "rts" | "rto"): Record<string, unknown> {
  const body: Record<string, unknown> = { awb_number: u.awb };
  const delivery = u.delivery
    ? clean({
        contact: u.delivery.contact,
        alternate_contact: u.delivery.alternateContact,
        customer_address: u.delivery.address,
        pincode: u.delivery.pincode,
      })
    : {};
  if (Object.keys(delivery).length) body.delivery_details = delivery;
  const pickup = u.pickup
    ? clean({
        contact: u.pickup.contact,
        alternate_contact: u.pickup.alternateContact,
        customer_address: u.pickup.address,
        pincode: u.pickup.pincode,
      })
    : {};
  if (Object.keys(pickup).length) body.pickup_details = pickup;
  const ret = u.returnDetails
    ? clean({
        contact: u.returnDetails.contact,
        return_address: u.returnDetails.address,
        pincode: u.returnDetails.pincode,
        email: u.returnDetails.email,
      })
    : {};
  if (Object.keys(ret).length) body.return_details = ret;
  const order = u.order
    ? clean({
        cod_amount: u.order.codAmount,
        eway_bill_number: u.order.ewayBillNumber,
        invoice_number: u.order.invoiceNumber,
        actual_weight: u.order.actualWeightKg,
        volumetric_weight: u.order.volumetricWeightKg,
      })
    : {};
  if (Object.keys(order).length) body.order_details = order;
  if (statusUpdate) body.status_update = { status: statusUpdate };
  return body;
}

export interface UpdateResult {
  ok: boolean;
  message: string;
}

export function parseUpdate(status: number, body: unknown): UpdateResult {
  const message = pickMessage(body) ?? `HTTP ${status}`;
  // Some 400 messages are JSON inside a string: "{\"message\":\"Intercity pincode updates are not allowed\"}"
  let readable = message;
  if (readable.startsWith("{")) {
    try {
      readable = pickMessage(JSON.parse(readable)) ?? readable;
    } catch {
      /* keep as is */
    }
  }
  return { ok: status >= 200 && status < 300, message: readable };
}

/** Used for both forward and reverse orders (the same endpoint serves both). */
export async function updateOrder(env: SfEnv, body: Record<string, unknown>): Promise<UpdateResult> {
  const res = await sfRequest({ env, method: "POST", path: "/v3/clients/order_update/", body, retry: "throttle-only" });
  return parseUpdate(res.status, res.data);
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return null;
}
function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** Normalises one order from single-track ({message, order_details, tracking_details}) or bulk-track (both shapes in the docs). */
export function normalizeForwardTracking(raw: unknown): TrackSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const order = (r.order_details && typeof r.order_details === "object" ? r.order_details : r) as Record<string, unknown>;
  const awb = str(order.awb_number);
  if (!awb) return null;
  const eventsRaw = Array.isArray(r.tracking_details)
    ? r.tracking_details
    : Array.isArray(order.tracking_details)
      ? (order.tracking_details as unknown[])
      : [];
  const events: TrackEvent[] = [];
  for (const e of eventsRaw) {
    if (!e || typeof e !== "object") continue;
    const ev = e as Record<string, unknown>;
    const statusId = str(ev.status_id);
    const at = str(ev.created);
    if (!statusId || !at) continue;
    events.push({
      at: new Date(at).toISOString(),
      statusId,
      status: str(ev.status) ?? labelFor(statusId),
      location: str(ev.location),
      remarks: str(ev.remarks),
      source: "track",
    });
  }
  const statusId = str(order.status) ?? events.at(-1)?.statusId ?? null;
  const delivery = (order.delivery_details ?? {}) as Record<string, unknown>;
  return {
    awb,
    clientOrderId: str(order.client_order_id),
    statusId,
    statusDisplay: str(order.status_display) ?? (statusId ? labelFor(statusId) : null),
    events,
    trackUrl: str(order.customer_track_url),
    paymentMode: str(order.payment_mode)?.toLowerCase() === "cod" ? "cod" : str(order.payment_mode) ? "prepaid" : null,
    codAmount: num(order.cod_amount),
    productValue: num(order.product_value),
    orderDate: str(order.order_date),
    deliveryCity: str(delivery.city),
    deliveryPincode: num(delivery.pincode),
    returnType: null,
  };
}

export type TrackResult = { ok: true; snapshot: TrackSnapshot } | { ok: false; message: string };

export async function trackForward(env: SfEnv, awb: string): Promise<TrackResult> {
  const res = await sfRequest({
    env,
    method: "GET",
    path: `/v4/clients/orders/${encodeURIComponent(awb)}/track/`,
    retry: "safe",
    budgetMs: 45_000,
  });
  const snapshot = res.status === 200 ? normalizeForwardTracking(res.data) : null;
  if (snapshot) return { ok: true, snapshot };
  return { ok: false, message: pickMessage(res.data) ?? `Tracking failed (HTTP ${res.status}).` };
}

/** Up to 50 AWBs per call (documented limit). */
export async function bulkTrackForward(env: SfEnv, awbs: string[]): Promise<TrackSnapshot[]> {
  if (!awbs.length) return [];
  if (awbs.length > 50) throw new Error("bulkTrackForward: max 50 AWBs");
  const res = await sfRequest<Record<string, unknown>>({
    env,
    method: "POST",
    path: "/v4/clients/bulk_track/",
    body: { awb_numbers: awbs },
    retry: "safe",
    budgetMs: 120_000,
  });
  const list = res.status === 200 && Array.isArray(res.data?.data) ? (res.data.data as unknown[]) : [];
  return list.map(normalizeForwardTracking).filter((s): s is TrackSnapshot => s !== null);
}

export type LabelResult = { ok: true; url: string } | { ok: false; message: string };

/** POST /client/generate_label/ — PDF/PRN link valid for 2 days, only before pickup, one AWB per call. */
export async function generateLabel(env: SfEnv, awb: string, fileType: "pdf" | "prn"): Promise<LabelResult> {
  const res = await sfRequest<Record<string, unknown>>({
    env,
    method: "POST",
    path: "/client/generate_label/",
    body: { awb_number: awb, file_type: fileType },
    retry: "throttle-only",
  });
  const data = (res.data?.data ?? {}) as Record<string, unknown>;
  if (res.status === 200 && typeof data.label_url === "string" && /^https:\/\//.test(data.label_url)) {
    return { ok: true, url: data.label_url };
  }
  return { ok: false, message: pickMessage(res.data) ?? `Label could not be generated (HTTP ${res.status}).` };
}

export type PodResult = { ok: true; pod: Record<string, unknown> | null } | { ok: false; message: string };

/** POST /v1/clients/pod_details/ — only for delivered / rts_d / rto_d. */
export async function fetchPod(env: SfEnv, awb: string): Promise<PodResult> {
  const res = await sfRequest<Record<string, unknown>>({
    env,
    method: "POST",
    path: "/v1/clients/pod_details/",
    body: { awb_numbers: [awb] },
    retry: "safe",
  });
  if (res.status === 200) {
    const all = (res.data?.pod_details ?? {}) as Record<string, unknown>;
    const pod = all[awb];
    return { ok: true, pod: pod && typeof pod === "object" && Object.keys(pod).length ? (pod as Record<string, unknown>) : null };
  }
  return { ok: false, message: pickMessage(res.data) ?? `POD not available (HTTP ${res.status}).` };
}

export interface RateQuote {
  available: boolean;
  message: string;
  zone: string | null;
  shippingRate: number | null;
  gst: number | null;
}

/** POST /v1/clients/rate_calculator/ — a quote only, for prepaid-wallet clients. */
export async function rateQuote(
  env: SfEnv,
  q: { originPincode: number; destinationPincode: number; service: "forward" | "reverse" | "reverse_qc"; weightKg?: number },
): Promise<RateQuote> {
  const res = await sfRequest<Record<string, unknown>>({
    env,
    method: "POST",
    path: "/v1/clients/rate_calculator/",
    body: clean({
      origin_pincode: q.originPincode,
      destination_pincode: q.destinationPincode,
      service: q.service,
      weight: q.weightKg,
    }),
    retry: "safe",
  });
  const d = res.data ?? {};
  const message = pickMessage(d) ?? `HTTP ${res.status}`;
  const rate = num(d.shipping_rate);
  return {
    available: res.status === 200 && message === "Success" && rate !== null,
    message,
    zone: str(d.zone),
    shippingRate: rate,
    gst: num(d.gst),
  };
}
