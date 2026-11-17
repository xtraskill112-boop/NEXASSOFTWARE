import { prisma } from "@naamdev/db";
import { logger } from "../lib/logger";
import { expireOffers } from "../modules/delivery/service";
import { expireBatches, inventoryAlerts } from "../modules/inventory/service";
import { expireUnpaidOrders } from "../modules/orders/service";

/**
 * Lightweight in-process scheduler. Each job takes a Postgres advisory lock so that running
 * several API instances never executes the same job concurrently.
 */
const JOBS: { name: string; lockId: number; everyMs: number; run: () => Promise<unknown> }[] = [
  { name: "expire-unpaid-orders", lockId: 81001, everyMs: 60_000, run: expireUnpaidOrders },
  { name: "expire-delivery-offers", lockId: 81002, everyMs: 15_000, run: expireOffers },
  { name: "expire-batches", lockId: 81003, everyMs: 10 * 60_000, run: expireBatches },
  { name: "inventory-alerts", lockId: 81004, everyMs: 30 * 60_000, run: inventoryAlerts },
  {
    name: "cleanup",
    lockId: 81005,
    everyMs: 6 * 3600_000,
    run: async () => {
      const day = 86_400_000;
      await prisma.session.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: new Date(Date.now() - 7 * day) } }] } });
      await prisma.otpCode.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - day) } } });
      await prisma.cart.deleteMany({ where: { userId: null, updatedAt: { lt: new Date(Date.now() - 30 * day) } } });
      await prisma.trackingPoint.deleteMany({ where: { recordedAt: { lt: new Date(Date.now() - 90 * day) } } });
    },
  },
];

const timers: NodeJS.Timeout[] = [];

async function runLocked(job: (typeof JOBS)[number]) {
  const [{ locked }] = await prisma.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${job.lockId}) AS locked`;
  if (!locked) return;
  try {
    const result = await job.run();
    if (result) logger.debug({ job: job.name, result }, "job ran");
  } catch (err) {
    logger.error({ err, job: job.name }, "job failed");
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${job.lockId})`;
  }
}

export function startJobs() {
  for (const job of JOBS) {
    const t = setInterval(() => void runLocked(job), job.everyMs);
    t.unref();
    timers.push(t);
    setTimeout(() => void runLocked(job), 5_000).unref();
  }
  logger.info(`Scheduler started (${JOBS.length} jobs)`);
}

export function stopJobs() {
  timers.splice(0).forEach(clearInterval);
}
