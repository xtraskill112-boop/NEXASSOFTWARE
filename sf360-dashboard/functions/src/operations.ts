/** Business operations shared by callables, the webhook and the scheduled sync. */
import { currentEnv, type SfEnv } from "./config";
import { addHistory, applySnapshot, shipmentFromForward, shipmentFromSnapshot, type Shipment } from "./model";
import { createForwardOrder, trackForward } from "./shadowfax/forward";
import { trackReverse } from "./shadowfax/reverse";
import type { Kind } from "./shadowfax/status";
import type { TrackSnapshot } from "./shadowfax/types";
import { getShipment, saveShipment } from "./store";
import type { ForwardOrderInput } from "./validation";

export type BookResult =
  | { ok: true; awb: string; duplicate: false }
  | { ok: false; duplicate: true; awb: string; errors: string[] }
  | { ok: false; duplicate: false; errors: string[] };

/** Books one forward order with Shadowfax and stores it. Used by single and bulk booking. */
export async function bookForward(order: ForwardOrderInput, by: string, source: "app" | "bulk"): Promise<BookResult> {
  const env = currentEnv();
  const result = await createForwardOrder(env, order);
  const now = new Date();
  if (result.ok) {
    await saveShipment(result.awb, (current) => {
      const fresh = shipmentFromForward(order, result.awb, result.data, { env, now, by, source });
      return current ? { ...fresh, events: current.events, createdAt: current.createdAt } : fresh;
    });
    return { ok: true, awb: result.awb, duplicate: false };
  }
  if (result.duplicateAwb) {
    // Shadowfax already has an order with this client_order_id. Keep our copy in sync with it.
    const awb = result.duplicateAwb;
    const existing = await getShipment(awb);
    if (!existing) {
      await saveShipment(awb, (current) => current ?? shipmentFromForward(order, awb, {}, { env, now, by, source }));
      await refreshFromShadowfax(awb, "forward").catch(() => undefined);
    }
    return { ok: false, duplicate: true, awb, errors: result.errors };
  }
  return { ok: false, duplicate: false, errors: result.errors };
}

export async function trackOne(env: SfEnv, awb: string, kind: Kind, returnType: Shipment["returnType"]) {
  return kind === "reverse" ? trackReverse(env, awb, returnType) : trackForward(env, awb);
}

export type RefreshResult = { ok: true; shipment: Shipment } | { ok: false; message: string };

/**
 * Pulls fresh tracking for one AWB and saves it. If we have never seen the AWB (booked in the Shadowfax panel),
 * tries forward first, then reverse, and creates the document.
 */
export async function refreshFromShadowfax(awb: string, kindHint?: Kind): Promise<RefreshResult> {
  const env = currentEnv();
  const existing = await getShipment(awb);
  if (existing && existing.env !== env) {
    return { ok: false, message: `This shipment belongs to the ${existing.env} environment; the app is now on ${env}.` };
  }
  const kinds: Kind[] = existing ? [existing.kind] : kindHint ? [kindHint] : ["forward", "reverse"];
  let lastMessage = "Shipment not found at Shadowfax.";
  for (const kind of kinds) {
    const res = await trackOne(env, awb, kind, existing?.returnType ?? null);
    if (!res.ok) {
      lastMessage = res.message;
      continue;
    }
    const saved = await saveSnapshot(res.snapshot, kind, env);
    return { ok: true, shipment: saved };
  }
  if (existing) {
    await saveShipment(awb, (current) => (current ? { ...current, lastSyncedAt: new Date(), syncError: lastMessage } : null));
  }
  return { ok: false, message: lastMessage };
}

/** Saves tracking data (from the track API, bulk sync or a webhook). Creates the shipment if it is new. */
export async function saveSnapshot(snap: TrackSnapshot, kind: Kind, env: SfEnv, opts: { synced?: boolean } = { synced: true }) {
  const now = new Date();
  const saved = await saveShipment(snap.awb, (current) => {
    const base = current ?? shipmentFromSnapshot(snap, kind, env, now);
    const next = current ? applySnapshot(current, snap, now) : base;
    return opts.synced ? { ...next, lastSyncedAt: now, syncError: null } : next;
  });
  return saved as Shipment;
}

export async function recordAction(awb: string, by: string, action: string, detail: string, patch?: (s: Shipment) => Shipment) {
  const now = new Date();
  return saveShipment(awb, (current) => {
    if (!current) return null;
    const updated = patch ? patch(current) : current;
    return addHistory({ ...updated, updatedAt: now }, by, action, detail, now);
  });
}
