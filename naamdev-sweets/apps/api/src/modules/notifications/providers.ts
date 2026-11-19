import nodemailer, { type Transporter } from "nodemailer";
import { env, integrations } from "../../config/env";
import { logger } from "../../lib/logger";

export interface SendResult {
  status: "SENT" | "FAILED" | "SKIPPED";
  provider: string;
  messageId?: string;
  error?: string;
}

// ── Email ──
let transporter: Transporter | null = null;
function getTransporter(): Transporter | null {
  if (env.EMAIL_PROVIDER !== "smtp" || !env.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transporter;
}

export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<SendResult> {
  if (env.EMAIL_PROVIDER === "console") {
    logger.info({ to, subject, text }, "📧 [console email]");
    return { status: "SENT", provider: "console" };
  }
  const t = getTransporter();
  if (!t) return { status: "SKIPPED", provider: "none", error: "Email provider not configured" };
  try {
    const info = await t.sendMail({ from: env.EMAIL_FROM, to, subject, html, text });
    return { status: "SENT", provider: "smtp", messageId: info.messageId };
  } catch (err) {
    return { status: "FAILED", provider: "smtp", error: (err as Error).message };
  }
}

// ── SMS ──
// Optional order-update SMS. Indian regulations (TRAI DLT) require every SMS template to be
// pre-registered; MSG91 is integrated via its Flow API (a transactional template with a single
// ##message## variable). Twilio is supported as a generic alternative.
export async function sendSms(to: string, message: string): Promise<SendResult> {
  if (env.SMS_PROVIDER === "console") {
    logger.info({ to, message }, "📱 [console sms]");
    return { status: "SENT", provider: "console" };
  }
  if (!integrations.sms) return { status: "SKIPPED", provider: "none", error: "SMS provider not configured" };
  try {
    if (env.SMS_PROVIDER === "msg91") {
      const mobile = to.replace(/^\+/, "");
      if (!env.MSG91_FLOW_TEMPLATE_ID) return { status: "SKIPPED", provider: "msg91", error: "MSG91_FLOW_TEMPLATE_ID not set" };
      const r = await fetch("https://control.msg91.com/api/v5/flow", {
        method: "POST",
        headers: { authkey: env.MSG91_AUTH_KEY!, "content-type": "application/json" },
        body: JSON.stringify({ template_id: env.MSG91_FLOW_TEMPLATE_ID, short_url: "0", recipients: [{ mobiles: mobile, message: message.slice(0, 300) }] }),
      });
      const j = (await r.json().catch(() => ({}))) as { type?: string; message?: string };
      return j.type === "success" ? { status: "SENT", provider: "msg91" } : { status: "FAILED", provider: "msg91", error: j.message ?? `HTTP ${r.status}` };
    }
    // Twilio
    const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: env.TWILIO_FROM!, Body: message }),
    });
    const j = (await r.json().catch(() => ({}))) as { sid?: string; message?: string };
    return r.ok ? { status: "SENT", provider: "twilio", messageId: j.sid } : { status: "FAILED", provider: "twilio", error: j.message ?? `HTTP ${r.status}` };
  } catch (err) {
    return { status: "FAILED", provider: env.SMS_PROVIDER, error: (err as Error).message };
  }
}

// ── Push (Firebase Cloud Messaging) ──
// Uses the same Firebase project and credentials as the rest of the API (no extra key needed).
type Messaging = import("firebase-admin/messaging").Messaging;
let messaging: Messaging | null | undefined;
async function getMessaging(): Promise<Messaging | null> {
  if (messaging !== undefined) return messaging;
  if (!integrations.push) return (messaging = null);
  try {
    const { firebaseApp } = await import("@naamdev/db");
    const { getMessaging: gm } = await import("firebase-admin/messaging");
    messaging = gm(firebaseApp);
  } catch (err) {
    logger.error({ err }, "Firebase Messaging initialisation failed");
    messaging = null;
  }
  return messaging;
}

export async function sendPush(
  tokens: string[],
  payload: { title: string; body: string; link?: string | null; data?: Record<string, string> },
): Promise<SendResult & { invalidTokens: string[] }> {
  if (!tokens.length) return { status: "SKIPPED", provider: "fcm", error: "No registered devices", invalidTokens: [] };
  const m = await getMessaging();
  if (!m) return { status: "SKIPPED", provider: "none", error: "Push provider not configured", invalidTokens: [] };
  try {
    const res = await m.sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body },
      data: { ...(payload.data ?? {}), ...(payload.link ? { link: payload.link } : {}) },
      webpush: payload.link ? { fcmOptions: { link: payload.link } } : undefined,
    });
    const invalidTokens = res.responses
      .map((r, i) => (!r.success && /registration-token-not-registered|invalid-argument/.test(r.error?.code ?? "") ? tokens[i]! : null))
      .filter((t): t is string => !!t);
    return { status: res.successCount > 0 ? "SENT" : "FAILED", provider: "fcm", invalidTokens, error: res.failureCount ? `${res.failureCount} failed` : undefined };
  } catch (err) {
    return { status: "FAILED", provider: "fcm", error: (err as Error).message, invalidTokens: [] };
  }
}
