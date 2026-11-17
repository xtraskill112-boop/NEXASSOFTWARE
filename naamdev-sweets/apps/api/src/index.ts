import { createServer } from "node:http";
import { prisma } from "@naamdev/db";
import { env, integrations } from "./config/env";
import { createApp } from "./app";
import { startJobs, stopJobs } from "./jobs/scheduler";
import { logger } from "./lib/logger";
import { drainNotifications } from "./modules/notifications/service";
import { initSocket } from "./realtime/socket";

const app = createApp();
const server = createServer(app);
initSocket(server);

server.listen(env.PORT, () => {
  logger.info(`NAAMDEV SWEETS API listening on :${env.PORT}`);
  logger.info({ integrations }, "integration status");
  if (env.JOBS_ENABLED) startJobs();
});

async function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down`);
  stopJobs();
  server.close();
  await drainNotifications().catch(() => undefined);
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
