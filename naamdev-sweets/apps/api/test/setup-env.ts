import { afterAll } from "vitest";
import { JOBS_SECRET, PROJECT_ID, RZP_KEY_ID, RZP_KEY_SECRET, RZP_MOCK_PORT, RZP_WEBHOOK_SECRET } from "./constants";

process.env.NODE_ENV = "test";
process.env.FIREBASE_PROJECT_ID = PROJECT_ID;
// Not on Google Cloud: skip the metadata-server probe.
process.env.METADATA_SERVER_DETECTION = "none";
process.env.EMAIL_PROVIDER = "console";
process.env.SMS_PROVIDER = "console";
process.env.JOBS_ENABLED = "false";
process.env.JOBS_SECRET = JOBS_SECRET;
process.env.RAZORPAY_KEY_ID = RZP_KEY_ID;
process.env.RAZORPAY_KEY_SECRET = RZP_KEY_SECRET;
process.env.RAZORPAY_WEBHOOK_SECRET = RZP_WEBHOOK_SECRET;
process.env.RAZORPAY_API_BASE = `http://localhost:${RZP_MOCK_PORT}`;

afterAll(async () => {
  const { drainNotifications } = await import("../src/modules/notifications/service");
  await drainNotifications();
});
