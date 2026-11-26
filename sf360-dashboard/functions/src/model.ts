/**
 * The Firestore shipment document and the pure functions that build and update it.
 * Kept free of Firestore imports so it can be unit tested.
 */
import type { SfEnv } from "./config";
import { groupFor, isActiveStatus, labelFor, type Kind, type StatusGroup } from "./shadowfax/status";
import type { TrackEvent, TrackSnapshot } from "./shadowfax/types";
import type { ForwardOrderInput, ReverseOrderInput } from "./validation";

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

export interface ShipmentProduct {
  name: string;
  skuId: string | null;
  price: number;
  quantity: number | null;
}

/** Firestore Timestamps are represented as Date here and converted by the store. */
export interface Shipment {
  awb: string;
  kind: Kind;
  env: SfEnv;
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
  products: ShipmentProduct[];
  pickupDate: string | null;
  pickupSlot: string | null;
  orderDate: string;
  trackUrl: string | null;
  sortCode: string | null;
  events: TrackEvent[];
  lastEventAt: Date | null;
  riderName: string | null;
  riderContact: string | null;
  label: { url: string; fileType: string; expiresAt: Date } | null;
  pod: Record<string, unknown> | null;
  source: "app" | "bulk" | "webhook";
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastSyncedAt: Date | null;
  syncError: string | null;
  cancelRequested: { at: Date; message: string; queued: boolean } | null;
  history: { at: Date; by: string; action: string; detail: string }[];
  searchTokens: string[];
}

const MAX_EVENTS = 150;
const MAX_HISTORY = 50;

export function emptyAddress(): PartyAddress {
  return {
    name: null,
    contact: null,
    alternateContact: null,
    address1: null,
    address2: null,
    city: null,
    state: null,
    pincode: null,
    email: null,
  };
}

function addr(a: {
  name?: string;
  contact?: string;
  alternateContact?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  pincode?: number;
  email?: string;
}): PartyAddress {
  return {
    name: a.name ?? null,
    contact: a.contact ?? null,
    alternateContact: a.alternateContact ?? null,
    address1: a.address1 ?? null,
    address2: a.address2 ?? null,
    city: a.city ?? null,
    state: a.state ?? null,
    pincode: a.pincode ?? null,
    email: a.email ?? null,
  };
}

/** Today's date in India as YYYY-MM-DD. */
export function istDate(d: Date = new Date()): string {
  return new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

/** Tokens for Firestore array-contains search: AWB, order ID, phone (last 10 digits), name words and their prefixes. */
export function searchTokens(parts: {
  awb: string;
  clientOrderId: string | null;
  name: string | null;
  phones: (string | null)[];
}): string[] {
  const tokens = new Set<string>();
  tokens.add(parts.awb.toLowerCase());
  if (parts.clientOrderId) tokens.add(parts.clientOrderId.toLowerCase().trim());
  for (const p of parts.phones) {
    const digits = (p ?? "").replace(/\D/g, "");
    if (digits.length >= 10) tokens.add(digits.slice(-10));
  }
  for (const word of (parts.name ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (word.length < 2) continue;
    for (let i = 2; i <= Math.min(word.length, 15); i++) tokens.add(word.slice(0, i));
  }
  return [...tokens].slice(0, 200);
}

/** Same normalisation the web app applies to a search box value. */
export function normalizeSearch(term: string): string {
  const t = term.trim().toLowerCase();
  const digits = t.replace(/\D/g, "");
  if (digits.length >= 10 && digits.length === t.replace(/[\s+()-]/g, "").length) return digits.slice(-10);
  return t;
}

export function eventKey(e: TrackEvent): string {
  return `${e.statusId}|${e.at.slice(0, 19)}`;
}

/** Merges and de-duplicates timelines from tracking, webhooks and app actions; oldest first. */
export function mergeEvents(existing: TrackEvent[], incoming: TrackEvent[]): TrackEvent[] {
  const byKey = new Map<string, TrackEvent>();
  for (const e of existing) byKey.set(eventKey(e), e);
  for (const e of incoming) {
    const k = eventKey(e);
    const prev = byKey.get(k);
    // Tracking data is the source of truth: it replaces a webhook copy of the same event.
    if (!prev || (prev.source !== "track" && e.source === "track")) byKey.set(k, e);
  }
  return [...byKey.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-MAX_EVENTS);
}

/** Recomputes the derived fields (group, active flag, search tokens). Call before every save. */
export function finalize(s: Shipment): Shipment {
  const history = s.events.map((e) => e.statusId);
  const last = s.events.at(-1);
  return {
    ...s,
    statusGroup: groupFor(s.kind, s.status),
    isActive: isActiveStatus(s.status, history),
    lastEventAt: last ? new Date(last.at) : s.lastEventAt,
    searchTokens: searchTokens({
      awb: s.awb,
      clientOrderId: s.clientOrderId,
      name: s.customer.name,
      phones: [s.customer.contact, s.customer.alternateContact],
    }),
  };
}

export function addHistory(s: Shipment, by: string, action: string, detail: string, now: Date): Shipment {
  return { ...s, history: [...s.history, { at: now, by, action, detail }].slice(-MAX_HISTORY) };
}

function baseShipment(now: Date, env: SfEnv): Omit<Shipment, "awb" | "kind" | "customer"> {
  return {
    env,
    orderType: null,
    clientOrderId: null,
    status: "new",
    statusDisplay: labelFor("new"),
    statusGroup: "booked",
    isActive: true,
    paymentMode: null,
    codAmount: 0,
    productValue: 0,
    totalAmount: null,
    weightKg: null,
    pickup: null,
    returnAddress: null,
    returnType: null,
    products: [],
    pickupDate: null,
    pickupSlot: null,
    orderDate: istDate(now),
    trackUrl: null,
    sortCode: null,
    events: [],
    lastEventAt: null,
    riderName: null,
    riderContact: null,
    label: null,
    pod: null,
    source: "app",
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    lastSyncedAt: null,
    syncError: null,
    cancelRequested: null,
    history: [],
    searchTokens: [],
  };
}

export function shipmentFromForward(
  o: ForwardOrderInput,
  awb: string,
  apiData: Record<string, unknown>,
  ctx: { env: SfEnv; now: Date; by: string; source: "app" | "bulk" },
): Shipment {
  const status = typeof apiData.status === "string" && apiData.status ? apiData.status : "new";
  const s: Shipment = {
    ...baseShipment(ctx.now, ctx.env),
    awb,
    kind: "forward",
    orderType: o.orderType,
    clientOrderId: o.clientOrderId,
    status,
    statusDisplay: typeof apiData.status_display === "string" ? apiData.status_display : labelFor(status),
    paymentMode: o.paymentMode,
    codAmount: o.paymentMode === "cod" ? o.codAmount : 0,
    productValue: o.productValue,
    totalAmount: o.totalAmount ?? null,
    weightKg: o.actualWeightKg ?? null,
    customer: addr(o.customer),
    pickup: addr(o.pickup),
    returnAddress: addr(o.returnAddress),
    returnType: o.orderType === "marketplace" ? o.returnType : "origin",
    products: o.products.map((p) => ({ name: p.name, skuId: p.skuId, price: p.price, quantity: p.quantity ?? null })),
    pickupDate: o.orderType === "marketplace" ? (o.pickup.pickupDate ?? null) : null,
    pickupSlot: o.orderType === "marketplace" ? (o.pickup.pickupSlot ?? null) : null,
    orderDate: typeof apiData.order_date === "string" ? apiData.order_date : istDate(ctx.now),
    sortCode: typeof apiData.sort_code === "string" ? apiData.sort_code : null,
    events: [
      {
        at: ctx.now.toISOString(),
        statusId: "new",
        status: "Booked from dashboard",
        location: null,
        remarks: null,
        source: "app",
      },
    ],
    source: ctx.source,
    createdBy: ctx.by,
  };
  return finalize(addHistory(s, ctx.by, "created", `Order ${o.clientOrderId} booked`, ctx.now));
}

export function shipmentFromReverse(
  o: ReverseOrderInput,
  awb: string,
  apiData: Record<string, unknown>,
  ctx: { env: SfEnv; now: Date; by: string },
): Shipment {
  const value = o.price ?? o.items.reduce((sum, i) => sum + i.price * (i.quantity ?? 1), 0);
  const s: Shipment = {
    ...baseShipment(ctx.now, ctx.env),
    awb,
    kind: "reverse",
    clientOrderId: o.clientOrderId,
    productValue: value,
    totalAmount: o.totalAmount ?? null,
    weightKg: o.actualWeightKg ?? null,
    customer: addr(o.customer),
    returnAddress: addr(o.returnAddress),
    returnType: o.returnType,
    products: o.items.map((i) => ({ name: i.name, skuId: i.skuId ?? null, price: i.price, quantity: i.quantity ?? null })),
    orderDate: typeof apiData.order_date === "string" ? apiData.order_date : istDate(ctx.now),
    events: [
      {
        at: ctx.now.toISOString(),
        statusId: "new",
        status: "Return pickup booked from dashboard",
        location: null,
        remarks: null,
        source: "app",
      },
    ],
    createdBy: ctx.by,
  };
  return finalize(addHistory(s, ctx.by, "created", `Return ${o.clientOrderId} booked`, ctx.now));
}

/** A shipment Shadowfax told us about (webhook or sync) that was not booked from this app. */
export function shipmentFromSnapshot(snap: TrackSnapshot, kind: Kind, env: SfEnv, now: Date): Shipment {
  const s: Shipment = {
    ...baseShipment(now, env),
    awb: snap.awb,
    kind,
    customer: emptyAddress(),
    source: "webhook",
  };
  return applySnapshot(s, snap, now);
}

/**
 * Applies tracking / webhook data. Status comes from the newest event (or the snapshot's own status);
 * customer details are only filled in when we have none (Shadowfax masks PII in tracking).
 */
export function applySnapshot(s: Shipment, snap: TrackSnapshot, now: Date): Shipment {
  const events = mergeEvents(s.events, snap.events);
  const newestShadowfax = [...events].reverse().find((e) => e.source !== "app");
  let status = s.status;
  let statusDisplay = s.statusDisplay;
  if (snap.statusId && snap.events.length === 0) {
    status = snap.statusId;
    statusDisplay = snap.statusDisplay ?? labelFor(snap.statusId);
  } else if (newestShadowfax) {
    status = newestShadowfax.statusId;
    statusDisplay = snap.statusId === newestShadowfax.statusId && snap.statusDisplay ? snap.statusDisplay : newestShadowfax.status;
  }
  const customer = { ...s.customer };
  if (!customer.city && snap.deliveryCity) customer.city = snap.deliveryCity;
  if (!customer.pincode && snap.deliveryPincode) customer.pincode = snap.deliveryPincode;
  return finalize({
    ...s,
    clientOrderId: s.clientOrderId ?? snap.clientOrderId,
    status,
    statusDisplay,
    events,
    customer,
    trackUrl: snap.trackUrl ?? s.trackUrl,
    paymentMode: s.paymentMode ?? snap.paymentMode,
    codAmount: s.source === "webhook" && snap.codAmount !== null ? snap.codAmount : s.codAmount,
    productValue: s.source === "webhook" && snap.productValue !== null ? snap.productValue : s.productValue,
    returnType: s.returnType ?? snap.returnType,
    orderDate: s.source === "webhook" && snap.orderDate ? snap.orderDate : s.orderDate,
    updatedAt: now,
  });
}

/** Dashboard counters this shipment contributes. Summed across shards by the web app. */
export function contributions(s: Shipment | null): Record<string, number> {
  if (!s) return {};
  const c: Record<string, number> = {
    [`${s.kind}_total`]: 1,
    [`${s.kind}_${s.statusGroup}`]: 1,
  };
  if (s.kind === "forward" && s.statusGroup !== "cancelled") {
    if (s.paymentMode === "cod") {
      c.cod_count = 1;
      c.cod_amount = s.codAmount;
      if (s.statusGroup === "delivered") c.cod_delivered_amount = s.codAmount;
    } else {
      c.prepaid_count = 1;
      c.prepaid_value = s.productValue;
    }
  }
  return c;
}

export function statsDelta(before: Shipment | null, after: Shipment | null): Record<string, number> {
  const a = contributions(before);
  const b = contributions(after);
  const delta: Record<string, number> = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = Math.round(((b[key] ?? 0) - (a[key] ?? 0)) * 100) / 100;
    if (d !== 0) delta[key] = d;
  }
  return delta;
}
