import { C, db, getDoc, getDocs, SUB, type DeviceToken, type NotificationChannel, type NotificationType, type User } from "@naamdev/db";
import { formatINR, type OrderStatus } from "@naamdev/shared";
import { env, isTest } from "../../config/env";
import { live } from "../../lib/live";
import { logger } from "../../lib/logger";
import { getRole } from "../../middleware/auth";
import { renderEmail } from "./email-template";
import { sendEmail, sendPush, sendSms, type SendResult } from "./providers";

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  data?: Record<string, string>;
  channels?: NotificationChannel[];
  template: string;
  /** Promotional messages respect marketing opt-outs; transactional ones always send. */
  promotional?: boolean;
  smsText?: string;
  emailCta?: string;
}

const pending = new Set<Promise<unknown>>();

/** Fire-and-forget dispatch so that a slow provider never blocks an API response. */
export function notify(input: NotifyInput) {
  const p = deliver(input).catch((err) => logger.error({ err, template: input.template }, "notification failed"));
  pending.add(p);
  p.finally(() => pending.delete(p));
}

/** Await all in-flight notifications (used by tests and graceful shutdown). */
export async function drainNotifications() {
  while (pending.size) await Promise.allSettled([...pending]);
}

async function logDelivery(userId: string | null, channel: NotificationChannel, template: string, recipient: string, r: SendResult) {
  await db.collection(C.notificationDeliveries).add({
    userId, channel, template, recipient, status: r.status, provider: r.provider, providerMessageId: r.messageId ?? null,
    error: r.error?.slice(0, 500) ?? null, createdAt: new Date(),
  });
}

async function deliver(input: NotifyInput) {
  const channels = input.channels ?? ["IN_APP"];
  const userRef = db.collection(C.users).doc(input.userId);
  const user = await getDoc<User>(userRef);
  if (!user || user.status === "DELETED") return;
  const prefs = user.profile;
  const absoluteLink = input.link ? (input.link.startsWith("http") ? input.link : `${env.APP_URL_WEB}${input.link}`) : null;

  if (channels.includes("IN_APP")) {
    await userRef.collection(SUB.notifications).add({
      userId: user.id, type: input.type, title: input.title, body: input.body, link: input.link ?? null, data: input.data ?? null, readAt: null, createdAt: new Date(),
    });
    live.user(user.id, { title: input.title, body: input.body, link: input.link ?? null, type: input.type });
  }
  if (channels.includes("EMAIL") && user.email) {
    if (input.promotional && prefs && (!prefs.emailOptIn || !prefs.marketingOptIn)) {
      await logDelivery(user.id, "EMAIL", input.template, user.email, { status: "SKIPPED", provider: "prefs", error: "Opted out" });
    } else {
      const { html, text } = renderEmail({ title: input.title, body: input.body, ctaUrl: absoluteLink, ctaLabel: input.emailCta ?? "Open NAAMDEV" });
      await logDelivery(user.id, "EMAIL", input.template, user.email, await sendEmail(user.email, input.title, html, text));
    }
  }
  if (channels.includes("SMS") && user.phone) {
    if (input.promotional && prefs && (!prefs.smsOptIn || !prefs.marketingOptIn)) {
      await logDelivery(user.id, "SMS", input.template, user.phone, { status: "SKIPPED", provider: "prefs", error: "Opted out" });
    } else {
      await logDelivery(user.id, "SMS", input.template, user.phone, await sendSms(user.phone, input.smsText ?? `NAAMDEV SWEETS: ${input.body}`));
    }
  }
  if (channels.includes("PUSH")) {
    if (input.promotional && prefs && !prefs.pushOptIn) return;
    const devices = await getDocs<DeviceToken>(userRef.collection(SUB.devices));
    const tokens = devices.map((d) => d.token);
    if (!tokens.length) return;
    const r = await sendPush(tokens, { title: input.title, body: input.body, link: absoluteLink, data: input.data });
    const invalid = devices.filter((d) => r.invalidTokens.includes(d.token));
    await Promise.all(invalid.map((d) => userRef.collection(SUB.devices).doc(d.id).delete()));
    await logDelivery(user.id, "PUSH", input.template, `${tokens.length} device(s)`, r);
  }
}

/** In-app alert to every active staff member holding a permission, plus configured admin emails. */
export async function notifyStaff(permission: string, input: Omit<NotifyInput, "userId">, alertEmails: string[] = []) {
  const staffUsers = await getDocs<User>(db.collection(C.users).where("isStaff", "==", true));
  for (const u of staffUsers) {
    if (u.status !== "ACTIVE" || !u.staff?.isActive) continue;
    const role = await getRole(u.roleKey);
    if (role?.permissions.includes(permission)) notify({ ...input, userId: u.id, channels: ["IN_APP"] });
  }
  if (alertEmails.length && !isTest) {
    const { html, text } = renderEmail({ title: input.title, body: input.body, ctaUrl: input.link ? `${env.APP_URL_ADMIN}${input.link}` : null, ctaLabel: "Open console" });
    for (const email of alertEmails)
      sendEmail(email, input.title, html, text).then((r) => logDelivery(null, "EMAIL", input.template, email, r)).catch(() => undefined);
  }
}

// ── Order event templates ──
const STATUS_COPY: Partial<Record<OrderStatus, { title: string; body: (n: string) => string; channels: NotificationChannel[] }>> = {
  CONFIRMED: { title: "Order confirmed 🎉", body: (n) => `Your order ${n} is confirmed. We'll start preparing it shortly.`, channels: ["IN_APP", "EMAIL", "SMS", "PUSH"] },
  PREPARING: { title: "Your sweets are being prepared", body: (n) => `Our halwais have started preparing order ${n}.`, channels: ["IN_APP", "PUSH"] },
  PACKED: { title: "Packed with care", body: (n) => `Order ${n} is packed and sealed for freshness.`, channels: ["IN_APP", "PUSH"] },
  DISPATCHED: { title: "Order dispatched 🛵", body: (n) => `Order ${n} has been picked up and is heading your way.`, channels: ["IN_APP", "SMS", "PUSH"] },
  OUT_FOR_DELIVERY: { title: "Out for delivery", body: (n) => `Order ${n} is almost there. Keep your delivery OTP handy.`, channels: ["IN_APP", "PUSH"] },
  DELIVERED: { title: "Delivered — enjoy! 🍬", body: (n) => `Order ${n} has been delivered. We'd love your review!`, channels: ["IN_APP", "EMAIL", "PUSH"] },
  CANCELLED: { title: "Order cancelled", body: (n) => `Order ${n} has been cancelled. Any amount paid will be refunded.`, channels: ["IN_APP", "EMAIL", "SMS", "PUSH"] },
  REFUND_INITIATED: { title: "Refund initiated", body: (n) => `We've initiated a refund for order ${n}.`, channels: ["IN_APP", "EMAIL", "PUSH"] },
  REFUNDED: { title: "Refund completed", body: (n) => `The refund for order ${n} has been processed.`, channels: ["IN_APP", "EMAIL"] },
};

export function notifyOrderStatus(order: { id: string; userId: string; orderNumber: string; deliveryOtp?: string | null; partnerId?: string | null }, status: OrderStatus) {
  const copy = STATUS_COPY[status];
  live.order(order.id, { userId: order.userId, partnerId: order.partnerId ?? null, status, event: "status" });
  live.staff("order-updated", { orderId: order.id, status });
  if (!copy) return;
  const otpNote = status === "DISPATCHED" && order.deliveryOtp ? ` Delivery OTP: ${order.deliveryOtp}. Share it only at your doorstep.` : "";
  notify({
    userId: order.userId,
    type: "ORDER",
    title: copy.title,
    body: copy.body(order.orderNumber) + otpNote,
    link: `/account/orders/${order.id}`,
    data: { orderId: order.id, status },
    channels: copy.channels,
    template: `order.${status.toLowerCase()}`,
    emailCta: "Track your order",
  });
}

export function notifyPayment(order: { id: string; userId: string; orderNumber: string; totalPaise: number }, ok: boolean) {
  notify({
    userId: order.userId,
    type: "PAYMENT",
    title: ok ? "Payment received" : "Payment failed",
    body: ok
      ? `We received ${formatINR(order.totalPaise)} for order ${order.orderNumber}. Thank you!`
      : `Your payment for order ${order.orderNumber} didn't go through. You can retry from the order page before the reservation expires.`,
    link: `/account/orders/${order.id}`,
    channels: ok ? ["IN_APP", "EMAIL"] : ["IN_APP", "PUSH"],
    template: ok ? "payment.success" : "payment.failed",
  });
}
