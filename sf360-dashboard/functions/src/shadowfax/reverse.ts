/**
 * Reverse Logistics (customer return pickups) — developer.shadowfax.in → API Reference → Reverse Logistics.
 * Note the differences from Forward: validation errors come back as HTTP 400, tracking returns display names.
 */
import type { SfEnv } from "../config";
import type { ReverseOrderInput } from "../validation";
import { clean, parseCancel, type CancelResult, type CreateResult, type TrackResult } from "./forward";
import { flattenErrors, pickMessage, sfRequest } from "./http";
import { labelFor, reverseCodeFromDisplay } from "./status";
import type { TrackEvent, TrackSnapshot } from "./types";

/** POST /v1/clients/pickup/orders/ body. */
export function buildReverseOrderBody(o: ReverseOrderInput): Record<string, unknown> {
  return {
    customer_details: clean({
      name: o.customer.name,
      contact: o.customer.contact,
      alternate_contact: o.customer.alternateContact,
      address: o.customer.address1,
      address2: o.customer.address2,
      city: o.customer.city,
      state: o.customer.state,
      pincode: o.customer.pincode,
      location_type: o.customer.locationType,
    }),
    return_details: clean({
      return_type: o.returnType,
      name: o.returnAddress.name,
      contact: o.returnAddress.contact,
      address: [o.returnAddress.address1, o.returnAddress.address2].filter(Boolean).join(", "),
      city: o.returnAddress.city,
      pincode: o.returnAddress.pincode,
      email: o.returnAddress.email,
      unique_code: o.returnAddress.uniqueCode,
    }),
    order_details: clean({
      client_order_id: o.clientOrderId,
      price: o.price,
      total_amount: o.totalAmount,
      eway_bill: o.ewayBill,
      pickup_type: "regular",
      actual_weight: o.actualWeightKg,
    }),
    sku_details: o.items.map((i) =>
      clean({
        sku_name: i.name,
        price: i.price,
        sku_id: i.skuId,
        category: i.category,
        brand: i.brand,
        return_reason: i.returnReason,
        qc_required: i.qcRequired,
        additional_details: clean({
          quantity_value: i.quantity,
          color: i.color,
          size: i.size,
        }),
      }),
    ),
  };
}

export function parseReverseCreate(status: number, body: unknown): CreateResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const data = (b.data ?? null) as Record<string, unknown> | null;
  if (status >= 200 && status < 300 && b.message === "Success" && data && typeof data.awb_number === "string") {
    return { ok: true, awb: data.awb_number, data };
  }
  const errors = flattenErrors(b.errors);
  if (!errors.length) errors.push(pickMessage(b) ?? `Shadowfax could not create the return pickup (HTTP ${status}).`);
  return { ok: false, errors };
}

export async function createReverseOrder(env: SfEnv, o: ReverseOrderInput): Promise<CreateResult> {
  const res = await sfRequest({
    env,
    method: "POST",
    path: "/v1/clients/pickup/orders/",
    body: buildReverseOrderBody(o),
    retry: "throttle-only",
  });
  return parseReverseCreate(res.status, res.data);
}

/** POST /v2/clients/requests/mark_cancel — not allowed once Out For Pickup / Picked. */
export async function cancelReverseOrder(env: SfEnv, awb: string, remarks: string): Promise<CancelResult> {
  const res = await sfRequest({
    env,
    method: "POST",
    path: "/v2/clients/requests/mark_cancel",
    body: { request_id: awb, cancel_remarks: remarks },
    retry: "throttle-only",
  });
  return parseCancel(res.status, res.data);
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return null;
}

/** Normalises a PickupTrackingResponse. Address PII is masked by Shadowfax in tracking, so we never read it. */
export function normalizeReverseTracking(raw: unknown, returnType: "seller" | "origin" | null): TrackSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const awb = str(r.client_request_id);
  if (!awb) return null;
  const inferredReturnType = returnType ?? (r.seller ? "seller" : "origin");
  const events: TrackEvent[] = [];
  const histories = Array.isArray(r.pickup_request_state_histories) ? r.pickup_request_state_histories : [];
  for (const h of histories) {
    if (!h || typeof h !== "object") continue;
    const ev = h as Record<string, unknown>;
    const display = str(ev.state);
    const at = str(ev.created_at);
    if (!display || !at) continue;
    const statusId = reverseCodeFromDisplay(display, inferredReturnType);
    events.push({
      at: new Date(at).toISOString(),
      statusId,
      status: display,
      location: str(ev.current_location),
      remarks: str(ev.comment),
      source: "track",
    });
  }
  const display = str(r.status);
  const statusId = display ? reverseCodeFromDisplay(display, inferredReturnType) : (events.at(-1)?.statusId ?? null);
  const address = (r.address ?? {}) as Record<string, unknown>;
  const created = typeof r.date_created === "number" ? new Date(r.date_created) : null;
  return {
    awb,
    clientOrderId: str(r.client_order_number),
    statusId,
    statusDisplay: display ?? (statusId ? labelFor(statusId) : null),
    events,
    trackUrl: null,
    paymentMode: null,
    codAmount: null,
    productValue: null,
    orderDate: created && !Number.isNaN(created.getTime()) ? created.toISOString().slice(0, 10) : null,
    deliveryCity: str(address.city),
    deliveryPincode: typeof address.pincode === "number" ? address.pincode : null,
    returnType: inferredReturnType,
  };
}

export async function trackReverse(env: SfEnv, awb: string, returnType: "seller" | "origin" | null): Promise<TrackResult> {
  const res = await sfRequest({
    env,
    method: "GET",
    path: `/v4/clients/requests/${encodeURIComponent(awb)}`,
    retry: "safe",
    budgetMs: 45_000,
  });
  const snapshot = res.status === 200 ? normalizeReverseTracking(res.data, returnType) : null;
  if (snapshot) return { ok: true, snapshot };
  return { ok: false, message: pickMessage(res.data) ?? `Tracking failed (HTTP ${res.status}).` };
}

/** POST /v4/clients/requests/bulk_query — dictionary keyed by AWB, each value an array with the tracking object. */
export async function bulkTrackReverse(
  env: SfEnv,
  awbs: string[],
  returnTypes: Map<string, "seller" | "origin" | null>,
): Promise<TrackSnapshot[]> {
  if (!awbs.length) return [];
  if (awbs.length > 50) throw new Error("bulkTrackReverse: max 50 AWBs");
  const res = await sfRequest<unknown>({
    env,
    method: "POST",
    path: "/v4/clients/requests/bulk_query",
    body: { request_ids: awbs },
    retry: "safe",
    budgetMs: 120_000,
  });
  if (res.status !== 200 || !res.data || typeof res.data !== "object") return [];
  const values: unknown[] = Array.isArray(res.data) ? res.data : Object.values(res.data as Record<string, unknown>);
  const out: TrackSnapshot[] = [];
  for (const v of values) {
    const item = Array.isArray(v) ? v[0] : v;
    const awb = item && typeof item === "object" ? str((item as Record<string, unknown>).client_request_id) : null;
    const snap = normalizeReverseTracking(item, awb ? (returnTypes.get(awb) ?? null) : null);
    if (snap) out.push(snap);
  }
  return out;
}
