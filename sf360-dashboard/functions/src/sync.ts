/**
 * Backup status sync. Webhooks are not retried by Shadowfax, so every 2 hours we bulk-track
 * open shipments (50 AWBs per call, as documented) and save anything that changed.
 */
import { onSchedule } from "firebase-functions/scheduler";
import * as logger from "firebase-functions/logger";
import { COLLECTIONS, REGION, SHADOWFAX_API_TOKEN, currentEnv, type SfEnv } from "./config";
import { saveSnapshot } from "./operations";
import { bulkTrackForward } from "./shadowfax/forward";
import { ShadowfaxError } from "./shadowfax/http";
import { bulkTrackReverse } from "./shadowfax/reverse";
import type { Kind } from "./shadowfax/status";
import { firestore, readShipmentData, saveShipment } from "./store";

const MAX_PER_RUN = 1000;
const TIME_BUDGET_MS = 480_000;

export async function syncActive(env: SfEnv): Promise<{ checked: number; updated: number; stoppedEarly: boolean }> {
  const started = Date.now();
  const snap = await firestore()
    .collection(COLLECTIONS.shipments)
    .where("env", "==", env)
    .where("isActive", "==", true)
    .orderBy("lastSyncedAt", "asc")
    .limit(MAX_PER_RUN)
    .get();
  const byKind: Record<Kind, { awb: string; returnType: "seller" | "origin" | null }[]> = { forward: [], reverse: [] };
  for (const doc of snap.docs) {
    const s = readShipmentData(doc.data());
    if (s) byKind[s.kind].push({ awb: s.awb, returnType: s.returnType });
  }

  let checked = 0;
  let updated = 0;
  for (const kind of ["forward", "reverse"] as Kind[]) {
    const list = byKind[kind];
    for (let i = 0; i < list.length; i += 50) {
      if (Date.now() - started > TIME_BUDGET_MS) return { checked, updated, stoppedEarly: true };
      const chunk = list.slice(i, i + 50);
      let snapshots;
      try {
        snapshots =
          kind === "forward"
            ? await bulkTrackForward(env, chunk.map((c) => c.awb))
            : await bulkTrackReverse(env, chunk.map((c) => c.awb), new Map(chunk.map((c) => [c.awb, c.returnType])));
      } catch (err) {
        if (err instanceof ShadowfaxError) {
          logger.warn("Sync stopped: Shadowfax error", { kind: err.kind, status: err.status });
          return { checked, updated, stoppedEarly: true };
        }
        throw err;
      }
      checked += chunk.length;
      const seen = new Set<string>();
      for (const s of snapshots) {
        seen.add(s.awb);
        await saveSnapshot(s, kind, env);
        updated++;
      }
      const now = new Date();
      for (const c of chunk) {
        if (seen.has(c.awb)) continue;
        await saveShipment(c.awb, (cur) => (cur ? { ...cur, lastSyncedAt: now, syncError: "Not returned by bulk tracking" } : null));
      }
    }
  }
  return { checked, updated, stoppedEarly: false };
}

export const syncActiveShipments = onSchedule(
  {
    schedule: "every 2 hours",
    timeZone: "Asia/Kolkata",
    region: REGION,
    secrets: [SHADOWFAX_API_TOKEN],
    timeoutSeconds: 540,
    memory: "512MiB",
    retryCount: 0,
  },
  async () => {
    const result = await syncActive(currentEnv());
    logger.info("Shipment sync finished", result);
  },
);
