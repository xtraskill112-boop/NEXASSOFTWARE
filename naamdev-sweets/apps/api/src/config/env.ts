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
  DATABASE_URL: z.string().min(1),
  API_PUBLIC_URL: z.string().url().default("http://localhost:4000"),
  APP_URL_WEB: z.string().url().default("http://localhost:3000"),
  APP_URL_ADMIN: z.string().url().default("http://localhost:3001"),
  APP_URL_DELIVERY: z.string().url().default("http://localhost:3002"),
  CORS_ORIGINS: z.string().optional(),
  TRUST_PROXY: z.coerce.number().default(1),
  COOKIE_SECURE: bool(isProd),
  COOKIE_DOMAIN: z.string().optional(),
  SESSION_TTL_DAYS: z.coerce.number().default(30),
  JWT_SECRET: isProd ? z.string().min(32) : z.string().min(16).default("dev-only-jwt-secret-change-me-please"),
  ENCRYPTION_KEY: isProd
    ? z.string().regex(/^[0-9a-f]{64}$/i, "ENCRYPTION_KEY must be 32 bytes hex")
    : z.string().default("0".repeat(63) + "1"),
  LOG_LEVEL: z.string().default(isProd ? "info" : "debug"),
  JOBS_ENABLED: bool(true),
  OTP_DEV_ECHO: bool(!isProd),
  UPLOAD_DIR: z.string().default("uploads"),

  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_API_BASE: z.string().url().default("https://api.razorpay.com/v1"),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_FOLDER: z.string().default("naamdev-sweets"),

  EMAIL_PROVIDER: z.enum(["smtp", "console", "none"]).default(isProd ? "none" : "console"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default("NAAMDEV SWEETS <no-reply@naamdevsweets.com>"),

  SMS_PROVIDER: z.enum(["msg91", "twilio", "console", "none"]).default(isProd ? "none" : "console"),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_OTP_TEMPLATE_ID: z.string().optional(),
  MSG91_FLOW_TEMPLATE_ID: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),

  FIREBASE_SERVICE_ACCOUNT_BASE64: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment configuration:", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  process.exit(1);
}

export const env = parsed.data;

// Refuse to run production with development shortcuts or the example secrets.
if (env.NODE_ENV === "production") {
  const problems = [
    env.OTP_DEV_ECHO && "OTP_DEV_ECHO must be false in production (it returns OTP codes in API responses)",
    /dev-only|change-me/i.test(env.JWT_SECRET) && "JWT_SECRET is the example value — generate one with: openssl rand -base64 48",
    /^0+1?$/.test(env.ENCRYPTION_KEY) && "ENCRYPTION_KEY is the example value — generate one with: openssl rand -hex 32",
  ].filter(Boolean);
  if (problems.length) {
    // eslint-disable-next-line no-console
    console.error(`Refusing to start in production:\n - ${problems.join("\n - ")}`);
    process.exit(1);
  }
}
export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

export const integrations = {
  razorpay: Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
  razorpayWebhook: Boolean(env.RAZORPAY_WEBHOOK_SECRET),
  cloudinary: Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET),
  email: env.EMAIL_PROVIDER === "smtp" ? Boolean(env.SMTP_HOST) : env.EMAIL_PROVIDER === "console",
  sms:
    env.SMS_PROVIDER === "msg91"
      ? Boolean(env.MSG91_AUTH_KEY)
      : env.SMS_PROVIDER === "twilio"
        ? Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM)
        : env.SMS_PROVIDER === "console",
  push: Boolean(env.FIREBASE_SERVICE_ACCOUNT_BASE64),
};

export const allowedOrigins = (env.CORS_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []).concat([
  env.APP_URL_WEB,
  env.APP_URL_ADMIN,
  env.APP_URL_DELIVERY,
]);
