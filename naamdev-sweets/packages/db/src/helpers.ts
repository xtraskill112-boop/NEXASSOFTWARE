import type { DocumentReference, DocumentSnapshot, Query, Transaction } from "firebase-admin/firestore";
import { db, Timestamp } from "./firebase";

/** A document's data with its id; Firestore Timestamps are converted to JS Dates. */
export type WithId<T> = T & { id: string };

/** Recursively turns Firestore Timestamps into Dates so the rest of the code works with plain JS values. */
export function revive<T>(value: unknown): T {
  if (value instanceof Timestamp) return value.toDate() as T;
  if (Array.isArray(value)) return value.map((v) => revive(v)) as T;
  if (value && typeof value === "object" && !(value instanceof Date) && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = revive(v);
    return out as T;
  }
  return value as T;
}

export function fromSnap<T>(snap: DocumentSnapshot): WithId<T> | null {
  if (!snap.exists) return null;
  return { ...revive<T>(snap.data()), id: snap.id };
}

export async function getDoc<T>(ref: DocumentReference, tx?: Transaction): Promise<WithId<T> | null> {
  return fromSnap<T>(tx ? await tx.get(ref) : await ref.get());
}

export async function getDocs<T>(q: Query, tx?: Transaction): Promise<WithId<T>[]> {
  const snap = tx ? await tx.get(q) : await q.get();
  return snap.docs.map((d) => ({ ...revive<T>(d.data()), id: d.id }));
}

/** Fetches many documents by id (missing ones are skipped), preserving the order of `ids`. */
export async function getMany<T>(collection: string, ids: string[], tx?: Transaction): Promise<WithId<T>[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const refs = unique.map((id) => db.collection(collection).doc(id));
  const snaps = tx ? await tx.getAll(...refs) : await db.getAll(...refs);
  const byId = new Map(snaps.filter((s) => s.exists).map((s) => [s.id, fromSnap<T>(s)!]));
  return ids.map((id) => byId.get(id)).filter((x): x is WithId<T> => !!x);
}

export async function countOf(q: Query): Promise<number> {
  const agg = await q.count().get();
  return agg.data().count;
}

/** Firestore-style random id (20 chars). */
export const newId = () => db.collection("_ids").doc().id;

/** Atomically increments a named counter inside a transaction and returns the new value. */
export async function nextCounter(tx: Transaction, key: string): Promise<number> {
  const ref = db.collection("counters").doc(key);
  const snap = await tx.get(ref);
  const value = ((snap.data()?.value as number | undefined) ?? 0) + 1;
  tx.set(ref, { value }, { merge: true });
  return value;
}

/** Firestore `in` queries accept at most 30 values; splits the list and merges results. */
export async function whereIn<T>(collection: string, field: string, values: unknown[], extra?: (q: Query) => Query): Promise<WithId<T>[]> {
  const unique = [...new Set(values)];
  const out: WithId<T>[] = [];
  for (let i = 0; i < unique.length; i += 30) {
    let q: Query = db.collection(collection).where(field, "in", unique.slice(i, i + 30));
    if (extra) q = extra(q);
    out.push(...(await getDocs<T>(q)));
  }
  return out;
}

/** Deletes every document matched by a query (in batches of 400). */
export async function deleteQuery(q: Query): Promise<number> {
  let total = 0;
  for (;;) {
    const snap = await q.limit(400).get();
    if (snap.empty) return total;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
  }
}

/**
 * Runs a Firestore transaction whose writes are queued and applied after the callback finishes.
 * Firestore requires every read in a transaction to happen before any write; queueing lets business
 * logic read and write in its natural order. (As always in Firestore, reads never see the transaction's
 * own pending writes — code keeps working values in memory.) Documents read through the transaction are
 * locked until commit, so concurrent stock reservations cannot oversell.
 */
const commitHooks = new WeakMap<Transaction, Map<string, () => void>>();

/** Registers (or replaces) a callback that runs once, just before a runTx transaction applies its writes. */
export function beforeCommit(tx: Transaction, key: string, fn: () => void) {
  let hooks = commitHooks.get(tx);
  if (!hooks) commitHooks.set(tx, (hooks = new Map()));
  hooks.set(key, fn);
}

export function runTx<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.runTransaction(async (raw) => {
    const queue: ((t: Transaction) => void)[] = [];
    const tx = Object.create(raw) as Transaction;
    const wrap = (name: "set" | "update" | "delete" | "create") =>
      function (this: unknown, ...args: unknown[]) {
        queue.push((t) => (t[name] as (...a: unknown[]) => unknown).apply(t, args));
        return tx;
      };
    Object.assign(tx, {
      get: raw.get.bind(raw),
      getAll: raw.getAll.bind(raw),
      set: wrap("set"),
      update: wrap("update"),
      delete: wrap("delete"),
      create: wrap("create"),
    });
    const result = await fn(tx);
    for (const hook of commitHooks.get(tx)?.values() ?? []) hook();
    commitHooks.delete(tx);
    for (const w of queue) w(raw);
    return result;
  });
}
