import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore, type Firestore } from "firebase-admin/firestore";
import { COLLECTIONS, DATABASE_ID, STAT_SHARDS, type SfEnv } from "./config";
import { contributions, finalize, statsDelta, type Shipment } from "./model";

let db: Firestore | undefined;
export function firestore(): Firestore {
  if (!db) {
    if (!getApps().length) initializeApp();
    db = getFirestore(DATABASE_ID);
    db.settings({ ignoreUndefinedProperties: true });
  }
  return db;
}

/** Recursively converts Date → Timestamp for writing. */
function toFirestore(value: unknown): unknown {
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (Array.isArray(value)) return value.map(toFirestore);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toFirestore(v);
    return out;
  }
  return value;
}

/** Recursively converts Timestamp → Date after reading. */
function fromFirestore(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map(fromFirestore);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = fromFirestore(v);
    return out;
  }
  return value;
}

export function shipmentRef(awb: string) {
  return firestore().collection(COLLECTIONS.shipments).doc(awb);
}

export function readShipmentData(data: FirebaseFirestore.DocumentData | undefined): Shipment | null {
  return data ? (fromFirestore(data) as Shipment) : null;
}

export async function getShipment(awb: string): Promise<Shipment | null> {
  const snap = await shipmentRef(awb).get();
  return readShipmentData(snap.data());
}

function shardRef(env: SfEnv, shard: number) {
  return firestore().collection(COLLECTIONS.stats).doc(env).collection("shards").doc(String(shard));
}

function incrementsFor(delta: Record<string, number>): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const [k, v] of Object.entries(delta)) out[k] = FieldValue.increment(v);
  return out;
}

/**
 * The only way shipments are written. Runs in a transaction: reads the current document,
 * lets `mutate` build the new one, saves it and moves the dashboard counters by the difference.
 * Returning null from `mutate` leaves the document unchanged.
 */
export async function saveShipment(
  awb: string,
  mutate: (current: Shipment | null) => Shipment | null,
): Promise<Shipment | null> {
  const ref = shipmentRef(awb);
  return firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = readShipmentData(snap.data());
    const next = mutate(current);
    if (!next) return current;
    const final = finalize({ ...next, updatedAt: next.updatedAt ?? new Date() });
    tx.set(ref, toFirestore(final) as FirebaseFirestore.DocumentData);
    const before = current && current.env === final.env ? current : null;
    if (current && current.env !== final.env) {
      const undo = statsDelta(current, null);
      if (Object.keys(undo).length) tx.set(shardRef(current.env, randomShard()), incrementsFor(undo), { merge: true });
    }
    const delta = statsDelta(before, final);
    if (Object.keys(delta).length) {
      tx.set(shardRef(final.env, randomShard()), { ...incrementsFor(delta), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    return final;
  });
}

function randomShard(): number {
  return Math.floor(Math.random() * STAT_SHARDS);
}

/** Rebuilds the counters for one environment from the shipments themselves (Settings → Recount). */
export async function rebuildStats(env: SfEnv): Promise<number> {
  const totals: Record<string, number> = {};
  let count = 0;
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = firestore().collection(COLLECTIONS.shipments).where("env", "==", env).orderBy("__name__").limit(500);
    if (last) q = q.startAfter(last);
    const page = await q.get();
    if (page.empty) break;
    for (const doc of page.docs) {
      const s = readShipmentData(doc.data());
      for (const [k, v] of Object.entries(contributions(s))) totals[k] = (totals[k] ?? 0) + v;
      count++;
    }
    last = page.docs.at(-1);
    if (page.size < 500) break;
  }
  const batch = firestore().batch();
  for (let i = 0; i < STAT_SHARDS; i++) batch.delete(shardRef(env, i));
  batch.set(shardRef(env, 0), { ...totals, updatedAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return count;
}

export { toFirestore, fromFirestore, FieldValue, Timestamp };
