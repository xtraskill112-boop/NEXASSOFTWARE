/**
 * POST https://<your-site>/api/shadowfax-webhook  (Firebase Hosting rewrites it here)
 * Register this URL and the header from Settings → Webhook in the SFX 360 portal → Webhook tab.
 * Shadowfax waits 10 s, does not retry (except once on 401/500), and treats anything but 200 as a failure.
 */
import { timingSafeEqual } from "node:crypto";
import { onRequest } from "firebase-functions/https";
import * as logger from "firebase-functions/logger";
import { COLLECTIONS, REGION, SF_WEBHOOK_KEY, currentEnv } from "./config";
import { saveShipment, firestore, Timestamp } from "./store";
import { applySnapshot, shipmentFromSnapshot } from "./model";
import { parseWebhook, type WebhookUpdate } from "./shadowfax/webhook-parse";
import type { TrackSnapshot } from "./shadowfax/types";

export function extractKey(headers: Record<string, string | string[] | undefined>): string | null {
  const pick = (name: string) => {
    const v = headers[name];
    return Array.isArray(v) ? v[0] : v;
  };
  const raw = pick("x-sf360-key") ?? pick("authorization") ?? null;
  if (!raw) return null;
  return raw.trim().replace(/^(token|bearer)\s+/i, "") || null;
}

export function keysMatch(given: string | null, expected: string): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

function bodyOf(req: { body?: unknown; rawBody?: Buffer }): unknown {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const text = req.rawBody?.toString("utf8") ?? (typeof req.body === "string" ? req.body : "");
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function findAwb(update: WebhookUpdate, env: string): Promise<string | null> {
  if (update.awb) return update.awb;
  if (!update.clientOrderId) return null;
  const q = await firestore()
    .collection(COLLECTIONS.shipments)
    .where("env", "==", env)
    .where("clientOrderId", "==", update.clientOrderId)
    .limit(1)
    .get();
  return q.empty ? null : q.docs[0].id;
}

export async function handleUpdate(update: WebhookUpdate, now: Date): Promise<string | null> {
  const env = currentEnv();
  const awb = await findAwb(update, env);
  if (!awb || !/^[A-Za-z0-9]{4,40}$/.test(awb) || !update.event) return null;
  const snap: TrackSnapshot = {
    awb,
    clientOrderId: update.clientOrderId,
    statusId: update.event.statusId,
    statusDisplay: update.event.status,
    events: [update.event],
    trackUrl: null,
    paymentMode: null,
    codAmount: null,
    productValue: null,
    orderDate: null,
    deliveryCity: null,
    deliveryPincode: null,
    returnType: null,
  };
  await saveShipment(awb, (current) => {
    if (current && current.env !== env) return null;
    const base = current ? applySnapshot(current, snap, now) : shipmentFromSnapshot(snap, update.kind ?? "forward", env, now);
    return {
      ...base,
      riderName: update.riderName ?? base.riderName,
      riderContact: update.riderContact ?? base.riderContact,
      pod: update.recipientInfo ?? base.pod,
    };
  });
  return awb;
}

export const shadowfaxWebhook = onRequest(
  { region: REGION, secrets: [SF_WEBHOOK_KEY], invoker: "public", timeoutSeconds: 30, memory: "256MiB", maxInstances: 10 },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false });
      return;
    }
    if (!keysMatch(extractKey(req.headers), SF_WEBHOOK_KEY.value())) {
      logger.warn("Webhook rejected: wrong or missing key");
      res.status(401).json({ ok: false });
      return;
    }
    const body = bodyOf(req);
    const items = (Array.isArray(body) ? body : [body]).filter((b) => b && typeof b === "object").slice(0, 100);
    if (!items.length) {
      res.status(400).json({ ok: false, error: "Expected a JSON body" });
      return;
    }
    const now = new Date();
    const log = firestore().collection(COLLECTIONS.webhookEvents);
    try {
      for (const item of items) {
        const update = parseWebhook(item, now);
        const awb = await handleUpdate(update, now);
        await log.add({
          receivedAt: Timestamp.fromDate(now),
          env: currentEnv(),
          awb: awb ?? update.awb,
          statusId: update.event?.statusId ?? null,
          matched: Boolean(awb),
          payload: item,
          // Removed automatically by the Firestore TTL policy on this field.
          expireAt: Timestamp.fromMillis(now.getTime() + 30 * 86400_000),
        });
      }
      res.status(200).json({ ok: true });
    } catch (err) {
      logger.error("Webhook processing failed", { error: err instanceof Error ? err.message : String(err) });
      // 500 makes Shadowfax retry once.
      res.status(500).json({ ok: false });
    }
  },
);
