import { C, db, deleteQuery, getDoc } from "@naamdev/db";
import { logger } from "../lib/logger";
import { expireOffers } from "../modules/delivery/service";
import { expireBatches, inventoryAlerts } from "../modules/inventory/service";
import { expireUnpaidOrders } from "../modules/orders/service";

const DAY = 86_400_000;

async function cleanup() {
  const now = Date.now();
  // Abandoned guest carts (ids start with "g_"); signed-in carts are kept.
  const carts = await db.collection(C.carts).where("updatedAt", "<", new Date(now - 30 * DAY)).limit(400).get();
  const guest = carts.docs.filter((d) => d.id.startsWith("g_"));
  if (guest.length) {
    const batch = db.batch();
    guest.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  // Rider GPS trail older than 90 days, and checkout idempotency keys older than a week.
  const tracking = await deleteQuery(db.collectionGroup("tracking").where("recordedAt", "<", new Date(now - 90 * DAY)));
  const keys = await deleteQuery(db.collection(C.orderKeys).where("createdAt", "<", new Date(now - 7 * DAY)));
  return { guestCarts: guest.length, tracking, keys };
}

interface Job {
  name: string;
  everyMs: number;
  run: () => Promise<unknown>;
}

// Each run costs Firestore reads, so on the free plan offers are checked once a minute (JOBS_OFFER_EVERY_MS).
const OFFER_EVERY_MS = Number(process.env.JOBS_OFFER_EVERY_MS ?? 15_000);

const JOBS: Job[] = [
  { name: "expire-unpaid-orders", everyMs: 60_000, run: expireUnpaidOrders },
  { name: "expire-delivery-offers", everyMs: OFFER_EVERY_MS, run: expireOffers },
  { name: "expire-batches", everyMs: 10 * 60_000, run: expireBatches },
  { name: "inventory-alerts", everyMs: 30 * 60_000, run: inventoryAlerts },
  { name: "cleanup", everyMs: 6 * 3600_000, run: cleanup },
];

interface JobRun {
  lockedUntil: Date | null;
  lastRunAt: Date | null;
  lastError: string | null;
}

/**
 * Claims a job through a lease document (jobRuns/{name}) so overlapping ticks — or several API
 * instances — never run the same job at once, and a job only runs when it is due.
 */
// With a single API instance (the free Render setup) jobs are coordinated in memory, which saves
// Firestore reads and writes; with several instances a lease document guards each job.
const USE_LEASES = process.env.JOBS_LEASES !== "false";
const lastRunInMemory = new Map<string, number>();

async function claim(job: Job, leaseMs: number): Promise<boolean> {
  if (!USE_LEASES) {
    const last = lastRunInMemory.get(job.name) ?? 0;
    if (Date.now() - last < job.everyMs - 5_000) return false;
    lastRunInMemory.set(job.name, Date.now());
    return true;
  }
  const ref = db.collection(C.jobRuns).doc(job.name);
  return db.runTransaction(async (tx) => {
    const now = Date.now();
    const run = await getDoc<JobRun>(ref, tx);
    if (run?.lockedUntil && +run.lockedUntil > now) return false;
    // A little slack so a job due every minute still runs on a once-a-minute tick.
    if (run?.lastRunAt && now - +run.lastRunAt < job.everyMs - 5_000) return false;
    tx.set(ref, { lockedUntil: new Date(now + leaseMs) }, { merge: true });
    return true;
  });
}

async function runJob(job: Job, leaseMs = 5 * 60_000) {
  if (!(await claim(job, leaseMs))) return { job: job.name, skipped: true };
  const ref = db.collection(C.jobRuns).doc(job.name);
  try {
    const result = await job.run();
    if (USE_LEASES) await ref.set({ lockedUntil: null, lastRunAt: new Date(), lastError: null }, { merge: true });
    return { job: job.name, result: result ?? null };
  } catch (err) {
    logger.error({ err, job: job.name }, "job failed");
    if (USE_LEASES) await ref.set({ lockedUntil: null, lastRunAt: new Date(), lastError: String((err as Error)?.message ?? err).slice(0, 500) }, { merge: true });
    return { job: job.name, error: true };
  }
}

/** Runs every job that is due. Called by Cloud Scheduler once a minute (and by the local timer in development). */
export async function runDueJobs() {
  const results = [];
  for (const job of JOBS) results.push(await runJob(job));
  return results;
}

/**
 * One scheduler tick. Delivery offers expire on a 15-second cadence, so a tick keeps sweeping them
 * for most of the minute until the next tick arrives.
 */
export async function tick(sweepForMs = 45_000) {
  const started = Date.now();
  const results = await runDueJobs();
  const offers = JOBS.find((j) => j.name === "expire-delivery-offers")!;
  while (Date.now() - started + 15_000 <= sweepForMs) {
    await new Promise((r) => setTimeout(r, 15_000));
    results.push(await runJob(offers));
  }
  return results;
}

let timer: NodeJS.Timeout | null = null;

export function startJobs() {
  const loop = () => void runDueJobs().catch((err) => logger.error({ err }, "scheduler tick failed"));
  timer = setInterval(loop, 15_000);
  timer.unref();
  setTimeout(loop, 5_000).unref();
  logger.info(`In-process scheduler started (${JOBS.length} jobs)`);
}

export function stopJobs() {
  if (timer) clearInterval(timer);
  timer = null;
}
