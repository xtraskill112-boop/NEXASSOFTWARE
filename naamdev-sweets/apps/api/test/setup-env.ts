import { afterAll, inject } from "vitest";
import { RZP_KEY_ID, RZP_KEY_SECRET, RZP_MOCK_PORT, RZP_WEBHOOK_SECRET } from "./constants";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = inject("testDatabaseUrl");
process.env.OTP_DEV_ECHO = "true";
process.env.EMAIL_PROVIDER = "console";
process.env.SMS_PROVIDER = "console";
process.env.JOBS_ENABLED = "false";
process.env.RAZORPAY_KEY_ID = RZP_KEY_ID;
process.env.RAZORPAY_KEY_SECRET = RZP_KEY_SECRET;
process.env.RAZORPAY_WEBHOOK_SECRET = RZP_WEBHOOK_SECRET;
process.env.RAZORPAY_API_BASE = `http://localhost:${RZP_MOCK_PORT}`;
process.env.UPLOAD_DIR = "uploads-test";

afterAll(async () => {
  const { drainNotifications } = await import("../src/modules/notifications/service");
  await drainNotifications();
  const { prisma } = await import("@naamdev/db");
  await prisma.$disconnect();
});
