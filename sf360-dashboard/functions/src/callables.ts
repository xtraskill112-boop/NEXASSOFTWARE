/**
 * Callable functions used by the web app. Each one:
 *   1. checks the Firebase Auth token + allow-list + verified e-mail (assertOwner),
 *   2. validates its input (zod),
 *   3. talks to Shadowfax with the token from Secret Manager,
 *   4. stores the result in Firestore so the app updates live.
 */
import { HttpsError, onCall, type CallableOptions } from "firebase-functions/https";
import * as logger from "firebase-functions/logger";
import { assertOwner } from "./auth";
import { COLLECTIONS, PANEL_URL, REGION, SF_WEBHOOK_KEY, SHADOWFAX_API_TOKEN, currentEnv } from "./config";
import { guarded } from "./errors";
import { shipmentFromReverse, type Shipment } from "./model";
import { bookForward, recordAction, refreshFromShadowfax } from "./operations";
import { buildUpdateBody, cancelForwardOrder, fetchPod, generateLabel, rateQuote, updateOrder } from "./shadowfax/forward";
import { ShadowfaxError } from "./shadowfax/http";
import { cancelReverseOrder, createReverseOrder } from "./shadowfax/reverse";
import { evaluateLeg, fetchTiers, legsFor, type LegResult } from "./shadowfax/serviceability";
import { readSettings } from "./settings";
import { FieldValue, Timestamp, firestore, getShipment, rebuildStats, saveShipment } from "./store";
import {
  awbOnlySchema,
  bulkSchema,
  cancelSchema,
  forwardOrderSchema,
  issueList,
  labelSchema,
  ndrSchema,
  parseInput,
  rateSchema,
  reverseOrderSchema,
  serviceabilitySchema,
  stripNulls,
  updateSchema,
} from "./validation";

const base: CallableOptions = {
  region: REGION,
  secrets: [SHADOWFAX_API_TOKEN],
  timeoutSeconds: 60,
  memory: "256MiB",
  maxInstances: 5,
};

async function ownShipment(awb: string): Promise<Shipment> {
  const s = await getShipment(awb);
  if (!s) throw new HttpsError("not-found", "This shipment is not in the dashboard yet. Use Refresh to import it.");
  const env = currentEnv();
  if (s.env !== env) {
    throw new HttpsError("failed-precondition", `This shipment was booked on ${s.env}; the app is now connected to ${env}.`);
  }
  return s;
}

/** Who is signed in, which Shadowfax environment is live, and where the panel is. Also the app's access check. */
export const appInfo = onCall({ ...base, secrets: [] }, async (request) => {
  const email = assertOwner(request);
  return { email, env: currentEnv(), panelUrl: PANEL_URL, region: REGION };
});

export const checkServiceability = onCall(base, async (request) => {
  assertOwner(request);
  const input = parseInput(serviceabilitySchema, request.data);
  return guarded("checkServiceability", async () => {
    const env = currentEnv();
    const { supplyChain } = await readSettings();
    const cache = firestore().collection(COLLECTIONS.serviceabilityCache);
    const legs = legsFor(input);
    const results: LegResult[] = await Promise.all(
      legs.map(async (leg) => {
        // Coverage changes rarely; the docs recommend caching. 12 hours.
        const ref = cache.doc(`${env}_${leg.service}_${leg.pincode}`);
        const cached = await ref.get();
        const fresh = cached.exists && (cached.get("checkedAt") as Timestamp).toMillis() > Date.now() - 12 * 3600_000;
        let tiers: string[];
        if (fresh) {
          tiers = cached.get("tiers") as string[];
        } else {
          tiers = await fetchTiers(env, leg.service, leg.pincode);
          await ref.set({ tiers, checkedAt: Timestamp.now(), expireAt: Timestamp.fromMillis(Date.now() + 7 * 86400_000) });
        }
        return evaluateLeg(leg, tiers, supplyChain);
      }),
    );
    return { supplyChain, legs: results, serviceable: results.every((r) => r.serviceable) };
  });
});

export const getRate = onCall(base, async (request) => {
  assertOwner(request);
  const input = parseInput(rateSchema, request.data);
  return guarded("getRate", () => rateQuote(currentEnv(), input));
});

export const createShipment = onCall(base, async (request) => {
  const email = assertOwner(request);
  const order = parseInput(forwardOrderSchema, request.data);
  return guarded("createShipment", () => bookForward(order, email, "app"));
});

export const createReturn = onCall(base, async (request) => {
  const email = assertOwner(request);
  const order = parseInput(reverseOrderSchema, request.data);
  return guarded("createReturn", async () => {
    const env = currentEnv();
    const result = await createReverseOrder(env, order);
    if (!result.ok) return { ok: false as const, errors: result.errors };
    const now = new Date();
    await saveShipment(result.awb, (current) => {
      const fresh = shipmentFromReverse(order, result.awb, result.data, { env, now, by: email });
      return current ? { ...fresh, events: current.events, createdAt: current.createdAt } : fresh;
    });
    return { ok: true as const, awb: result.awb };
  });
});

/**
 * Books many forward orders. The app creates the job ID first and listens to bulkJobs/{jobId}
 * to show row-by-row progress while this runs.
 */
export const bulkCreateShipments = onCall({ ...base, timeoutSeconds: 540, memory: "512MiB", maxInstances: 2 }, async (request) => {
  const email = assertOwner(request);
  const input = parseInput(bulkSchema, request.data);
  const jobId = typeof (request.data as Record<string, unknown>)?.jobId === "string" ? String((request.data as Record<string, unknown>).jobId) : "";
  if (!/^[A-Za-z0-9]{10,40}$/.test(jobId)) throw new HttpsError("invalid-argument", "Invalid job id");

  const env = currentEnv();
  const jobRef = firestore().collection(COLLECTIONS.bulkJobs).doc(jobId);
  try {
    await jobRef.create({
      status: "running",
      env,
      fileName: input.fileName ?? null,
      total: input.orders.length,
      done: 0,
      succeeded: 0,
      failed: 0,
      rows: [],
      createdBy: email,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch {
    throw new HttpsError("already-exists", "This upload was already started.");
  }

  type Row = { row: number; ok: boolean; clientOrderId: string | null; awb: string | null; message: string };
  const rows: Row[] = new Array(input.orders.length);
  const started = Date.now();
  let stopReason: string | null = null;
  let next = 0;
  let done = 0;
  let lastFlush = 0;

  const flush = async (final: boolean) => {
    const list = rows.filter(Boolean);
    await jobRef.update({
      status: final ? "done" : "running",
      done,
      succeeded: list.filter((r) => r.ok).length,
      failed: list.filter((r) => !r.ok).length,
      rows: list.sort((a, b) => a.row - b.row),
      stopReason,
      updatedAt: FieldValue.serverTimestamp(),
    });
  };

  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= input.orders.length) return;
      const raw = input.orders[i] as Record<string, unknown> | null;
      const clientOrderId = raw && typeof raw.clientOrderId === "string" ? raw.clientOrderId : null;
      if (stopReason) {
        rows[i] = { row: i + 1, ok: false, clientOrderId, awb: null, message: `Not sent: ${stopReason}` };
      } else if (Date.now() - started > 480_000) {
        stopReason = "time limit reached — upload the remaining rows again";
        rows[i] = { row: i + 1, ok: false, clientOrderId, awb: null, message: `Not sent: ${stopReason}` };
      } else {
        const parsed = forwardOrderSchema.safeParse(stripNulls(raw));
        if (!parsed.success) {
          const msg = issueList(parsed.error)
            .map((x) => (x.path ? `${x.path}: ${x.message}` : x.message))
            .join("; ");
          rows[i] = { row: i + 1, ok: false, clientOrderId, awb: null, message: msg };
        } else {
          try {
            const r = await bookForward(parsed.data, email, "bulk");
            rows[i] = r.ok
              ? { row: i + 1, ok: true, clientOrderId, awb: r.awb, message: "Booked" }
              : { row: i + 1, ok: false, clientOrderId, awb: r.duplicate ? r.awb : null, message: r.errors.join("; ") };
          } catch (err) {
            const msg = err instanceof ShadowfaxError ? err.message : "Unexpected error";
            if (err instanceof ShadowfaxError && (err.kind === "throttled" || err.kind === "auth" || err.kind === "forbidden")) {
              stopReason = err.message;
            }
            rows[i] = { row: i + 1, ok: false, clientOrderId, awb: null, message: msg };
          }
        }
      }
      done++;
      if (Date.now() - lastFlush > 2500) {
        lastFlush = Date.now();
        await flush(false).catch((e) => logger.warn("bulk progress write failed", { error: String(e) }));
      }
    }
  };

  // Three at a time keeps us well under Shadowfax's per-client throttling.
  await Promise.all([worker(), worker(), worker()]);
  await flush(true);
  const list = rows.filter(Boolean);
  return { jobId, total: list.length, succeeded: list.filter((r) => r.ok).length, failed: list.filter((r) => !r.ok).length };
});

export const refreshShipment = onCall(base, async (request) => {
  assertOwner(request);
  const { awb } = parseInput(awbOnlySchema, request.data);
  return guarded("refreshShipment", async () => {
    const r = await refreshFromShadowfax(awb);
    return r.ok ? { ok: true, status: r.shipment.statusDisplay } : { ok: false, message: r.message };
  });
});

export const updateShipment = onCall(base, async (request) => {
  const email = assertOwner(request);
  const input = parseInput(updateSchema, request.data);
  return guarded("updateShipment", async () => {
    const s = await ownShipment(input.awb);
    if (!s.isActive) throw new HttpsError("failed-precondition", "This shipment is closed and cannot be edited.");
    const body = buildUpdateBody(input);
    const r = await updateOrder(s.env, body);
    if (!r.ok) return { ok: false, message: r.message };
    const changed = Object.keys(body).filter((k) => k !== "awb_number").join(", ");
    await recordAction(s.awb, email, "update_requested", `Sent: ${changed}. Shadowfax: ${r.message}`, (cur) => {
      const customerTarget = cur.kind === "reverse" ? input.pickup : input.delivery;
      const customer = { ...cur.customer };
      if (customerTarget?.contact) customer.contact = customerTarget.contact;
      if (customerTarget?.alternateContact) customer.alternateContact = customerTarget.alternateContact;
      if (customerTarget?.address) customer.address1 = customerTarget.address;
      if (customerTarget?.pincode) customer.pincode = customerTarget.pincode;
      const pickup = cur.kind === "forward" && cur.pickup && input.pickup ? { ...cur.pickup } : cur.pickup;
      if (pickup && cur.kind === "forward" && input.pickup) {
        if (input.pickup.contact) pickup.contact = input.pickup.contact;
        if (input.pickup.address) pickup.address1 = input.pickup.address;
        if (input.pickup.pincode) pickup.pincode = input.pickup.pincode;
      }
      return {
        ...cur,
        customer,
        pickup,
        codAmount: input.order?.codAmount ?? cur.codAmount,
        paymentMode: input.order?.codAmount === 0 && cur.paymentMode === "cod" ? "prepaid" : cur.paymentMode,
        weightKg: input.order?.actualWeightKg ?? cur.weightKg,
      };
    });
    return { ok: true, message: r.message };
  });
});

/** Failed delivery: re-attempt (optionally with new address/phone), or send it back (RTS/RTO). */
export const ndrAction = onCall(base, async (request) => {
  const email = assertOwner(request);
  const input = parseInput(ndrSchema, request.data);
  return guarded("ndrAction", async () => {
    const s = await ownShipment(input.awb);
    if (s.kind !== "forward") throw new HttpsError("failed-precondition", "NDR actions are only for forward shipments.");
    const body = buildUpdateBody({ awb: s.awb, delivery: input.delivery }, input.action);
    const r = await updateOrder(s.env, body);
    if (!r.ok) return { ok: false, message: r.message };
    const label = input.action === "reopen_ndr" ? "Re-attempt delivery" : input.action === "rts" ? "Return to seller" : "Return to origin";
    await recordAction(s.awb, email, "ndr_action", `${label} requested. Shadowfax: ${r.message}`);
    return { ok: true, message: r.message };
  });
});

export const cancelShipment = onCall(base, async (request) => {
  const email = assertOwner(request);
  const input = parseInput(cancelSchema, request.data);
  return guarded("cancelShipment", async () => {
    const s = await ownShipment(input.awb);
    if (!s.isActive) throw new HttpsError("failed-precondition", "This shipment is already closed.");
    const r = s.kind === "reverse" ? await cancelReverseOrder(s.env, s.awb, input.remarks) : await cancelForwardOrder(s.env, s.awb, input.remarks);
    if (!r.ok) return { ok: false, message: r.message };
    await recordAction(s.awb, email, "cancel_requested", `${input.remarks} — Shadowfax: ${r.message}`, (cur) => ({
      ...cur,
      cancelRequested: { at: new Date(), message: r.message, queued: r.queued },
    }));
    // Pull the real status straight away (best effort).
    await refreshFromShadowfax(s.awb).catch(() => undefined);
    return { ok: true, queued: r.queued, message: r.message };
  });
});

export const getLabel = onCall(base, async (request) => {
  const email = assertOwner(request);
  const input = parseInput(labelSchema, request.data);
  return guarded("getLabel", async () => {
    const s = await ownShipment(input.awb);
    if (s.kind !== "forward") throw new HttpsError("failed-precondition", "Shadowfax labels are only available for forward orders.");
    if (s.label && s.label.fileType === input.fileType && s.label.expiresAt.getTime() > Date.now()) {
      return { ok: true, url: s.label.url, cached: true };
    }
    const r = await generateLabel(s.env, s.awb, input.fileType);
    if (!r.ok) return { ok: false, message: r.message };
    // Shadowfax says the link is valid for 2 days; refresh an hour early.
    const expiresAt = new Date(Date.now() + 47 * 3600_000);
    await recordAction(s.awb, email, "label", `Label generated (${input.fileType})`, (cur) => ({
      ...cur,
      label: { url: r.url, fileType: input.fileType, expiresAt },
    }));
    return { ok: true, url: r.url, cached: false };
  });
});

export const getPod = onCall(base, async (request) => {
  assertOwner(request);
  const { awb } = parseInput(awbOnlySchema, request.data);
  return guarded("getPod", async () => {
    const s = await ownShipment(awb);
    const r = await fetchPod(s.env, s.awb);
    if (!r.ok) return { ok: false, message: r.message };
    if (r.pod) {
      await saveShipment(s.awb, (cur) => (cur ? { ...cur, pod: r.pod } : null));
    }
    return { ok: true, pod: r.pod };
  });
});

/** The header Shadowfax must send with webhook calls. Shown on the Settings page so it can be pasted in the SFX 360 portal. */
export const getWebhookInfo = onCall({ ...base, secrets: [SF_WEBHOOK_KEY] }, async (request) => {
  assertOwner(request);
  return { headerName: "Authorization", headerValue: `Token ${SF_WEBHOOK_KEY.value().trim()}`, path: "/api/shadowfax-webhook" };
});

export const recountStats = onCall({ ...base, secrets: [], timeoutSeconds: 300 }, async (request) => {
  assertOwner(request);
  return guarded("recountStats", async () => ({ shipments: await rebuildStats(currentEnv()) }));
});
