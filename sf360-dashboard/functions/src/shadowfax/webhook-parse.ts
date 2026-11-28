/**
 * Shadowfax callback bodies are a per-client template (developer.shadowfax.in → Callbacks / Webhooks),
 * so field names can differ between accounts. This reads every documented variant.
 */
import { labelFor, toCode } from "./status";
import type { TrackEvent } from "./types";

export interface WebhookUpdate {
  awb: string | null;
  clientOrderId: string | null;
  kind: "forward" | "reverse" | null;
  event: TrackEvent | null;
  riderName: string | null;
  riderContact: string | null;
  recipientInfo: Record<string, unknown> | null;
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function first(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = str(obj[k]);
    if (v) return v;
  }
  return null;
}

/**
 * Callback timestamps come as "2023-05-18 16:22:13" (IST, per the docs), "2026-04-01T14:30:00+05:30",
 * or an ISO string with no offset (also IST). Returns ISO UTC, or null.
 */
export function parseShadowfaxTime(v: string | null, fallbackDate?: string | null, fallbackTime?: string | null): string | null {
  let s = v;
  if (!s && fallbackDate) {
    const t = (fallbackTime ?? "0000").padStart(4, "0");
    s = `${fallbackDate} ${t.slice(0, 2)}:${t.slice(2, 4)}:00`;
  }
  if (!s) return null;
  s = s.trim();
  let iso = s.replace(" ", "T");
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(iso)) iso += "+05:30";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseWebhook(body: unknown, now: Date): WebhookUpdate {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const awb = first(b, ["awb_number", "awb", "tracking_id", "client_request_id", "awbNumber"]);
  const clientOrderId = first(b, ["order_id", "client_order_id", "client_order_number", "orderId"]);

  const statusText = first(b, ["status", "status_display"]);
  // status_id is the code; "event" is the code on forward callbacks but an internal integer on reverse ones.
  let statusId = first(b, ["status_id"]);
  if (!statusId) {
    const ev = b.event;
    if (typeof ev === "string" && ev.trim() && !/^\d+$/.test(ev.trim())) statusId = ev.trim();
  }
  if (!statusId && statusText) statusId = toCode(statusText);

  const type = first(b, ["type"])?.toUpperCase() ?? null;
  const kind = type === "REV" ? "reverse" : type === "FWD" ? "forward" : null;

  const at =
    parseShadowfaxTime(first(b, ["event_timestamp", "last_updated_iso", "last_updated"]), str(b.updated_date), str(b.updated_time)) ??
    now.toISOString();

  const event: TrackEvent | null = statusId
    ? {
        at,
        statusId,
        status: statusText ?? labelFor(statusId),
        location: first(b, ["current_location", "location"]),
        remarks: first(b, ["comments", "remarks", "cancellation_remarks"]),
        source: "webhook",
      }
    : null;

  const recipient = b.recipient_info ?? b.recepient_info;
  return {
    awb,
    clientOrderId,
    kind,
    event,
    riderName: first(b, ["rider_name"]),
    riderContact: first(b, ["rider_contact"]),
    recipientInfo:
      recipient && typeof recipient === "object" && !Array.isArray(recipient) && Object.keys(recipient).length
        ? (recipient as Record<string, unknown>)
        : null,
  };
}
