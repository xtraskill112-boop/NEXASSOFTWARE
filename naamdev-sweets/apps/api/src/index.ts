import { createServer } from "node:http";
import { env, integrations } from "./config/env";
import { createApp } from "./app";
import { startJobs, stopJobs } from "./jobs/scheduler";
import { logger } from "./lib/logger";
import { drainNotifications } from "./modules/notifications/service";

const app = createApp();
const server = createServer(app);

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
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
