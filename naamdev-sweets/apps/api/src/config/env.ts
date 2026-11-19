import "dotenv/config";
import { z } from "zod";

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const isProd = process.env.NODE_ENV === "production";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  // Firebase: on Cloud Run the project and credentials come from the runtime service account.
  FIREBASE_PROJECT_ID: z.string().optional(),
  // Public URL of this API (used for uploaded-photo links). Render sets RENDER_EXTERNAL_URL itself.
  API_PUBLIC_URL: z.string().url().optional(),
  APP_URL_WEB: z.string().url().default("http://localhost:3000"),
  APP_URL_ADMIN: z.string().url().default("http://localhost:3001"),
  APP_URL_DELIVERY: z.string().url().default("http://localhost:3002"),
  CORS_ORIGINS: z.string().optional(),
  TRUST_PROXY: z.coerce.number().default(1),
  // 32 bytes hex — encrypts partner bank account numbers at rest.
  ENCRYPTION_KEY: isProd
    ? z.string().regex(/^[0-9a-f]{64}$/i, "ENCRYPTION_KEY must be 32 bytes hex")
    : z.string().default("0".repeat(63) + "1"),
  LOG_LEVEL: z.string().default(isProd ? "info" : "debug"),
  // In-process background jobs (default on in development; the deploy turns them on for the Render server).
  JOBS_ENABLED: bool(!isProd),
  // Shared secret for the x-jobs-secret header on /internal/jobs/tick (an optional external trigger).
  JOBS_SECRET: isProd ? z.string().min(24, "JOBS_SECRET must be at least 24 characters") : z.string().optional(),

  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_API_BASE: z.string().url().default("https://api.razorpay.com/v1"),

  EMAIL_PROVIDER: z.enum(["smtp", "console", "none"]).default(isProd ? "none" : "console"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default("NAAMDEV SWEETS <no-reply@naamdevsweets.com>"),

  SMS_PROVIDER: z.enum(["msg91", "twilio", "console", "none"]).default(isProd ? "none" : "console"),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_FLOW_TEMPLATE_ID: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),

  // Firebase Cloud Messaging uses the same project credentials; enable once the web push key is configured.
  PUSH_ENABLED: bool(false),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment configuration:", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  process.exit(1);
}

export const env = parsed.data;

// Refuse to run production with the example secrets.
if (env.NODE_ENV === "production" && /^0+1?$/.test(env.ENCRYPTION_KEY)) {
  // eslint-disable-next-line no-console
  console.error("Refusing to start in production: ENCRYPTION_KEY is the example value — generate one with: openssl rand -hex 32");
  process.exit(1);
}
export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

export const integrations = {
  razorpay: Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
  razorpayWebhook: Boolean(env.RAZORPAY_WEBHOOK_SECRET),
  storage: true, // Firestore-backed by default (free plan); Cloud Storage with STORAGE_DRIVER=firebase
  email: env.EMAIL_PROVIDER === "smtp" ? Boolean(env.SMTP_HOST) : env.EMAIL_PROVIDER === "console",
  sms:
    env.SMS_PROVIDER === "msg91"
      ? Boolean(env.MSG91_AUTH_KEY && env.MSG91_FLOW_TEMPLATE_ID)
      : env.SMS_PROVIDER === "twilio"
        ? Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM)
        : env.SMS_PROVIDER === "console",
  push: env.PUSH_ENABLED,
};

export const allowedOrigins = (env.CORS_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []).concat([
  env.APP_URL_WEB,
  env.APP_URL_ADMIN,
  env.APP_URL_DELIVERY,
]);
