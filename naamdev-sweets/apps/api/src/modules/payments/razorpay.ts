import { env, integrations } from "../../config/env";
import { hmacSha256Hex, safeEqual } from "../../lib/crypto";
import { badGateway, unavailable } from "../../lib/errors";

export interface RzpOrder { id: string; amount: number; currency: string; receipt: string; status: string }
export interface RzpPayment { id: string; order_id: string; amount: number; currency: string; status: string; method?: string; captured?: boolean; error_description?: string | null }
export interface RzpRefund { id: string; payment_id: string; amount: number; status: "pending" | "processed" | "failed" }

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  if (!integrations.razorpay) throw unavailable("Online payments are not configured. Please choose Cash on Delivery.");
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
  let res: Response;
  try {
    res = await fetch(`${env.RAZORPAY_API_BASE}${path}`, {
      method,
      headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw badGateway(`Payment gateway unreachable: ${(err as Error).message}`);
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (!res.ok) throw badGateway(json.error?.description ?? `Payment gateway error (HTTP ${res.status})`);
  return json;
}

export const razorpay = {
  createOrder: (amountPaise: number, receipt: string, notes: Record<string, string>) =>
    call<RzpOrder>("POST", "/orders", { amount: amountPaise, currency: "INR", receipt, notes, payment_capture: 1 }),
  fetchPayment: (paymentId: string) => call<RzpPayment>("GET", `/payments/${encodeURIComponent(paymentId)}`),
  fetchOrderPayments: (orderId: string) => call<{ items: RzpPayment[] }>("GET", `/orders/${encodeURIComponent(orderId)}/payments`),
  refund: (paymentId: string, amountPaise: number, notes: Record<string, string>) =>
    call<RzpRefund>("POST", `/payments/${encodeURIComponent(paymentId)}/refund`, { amount: amountPaise, speed: "normal", notes }),
  fetchRefund: (refundId: string) => call<RzpRefund>("GET", `/refunds/${encodeURIComponent(refundId)}`),
};

/** Checkout signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyPaymentSignature(gatewayOrderId: string, paymentId: string, signature: string): boolean {
  if (!env.RAZORPAY_KEY_SECRET) return false;
  return safeEqual(hmacSha256Hex(env.RAZORPAY_KEY_SECRET, `${gatewayOrderId}|${paymentId}`), signature);
}

/** Webhook signature: HMAC_SHA256(raw request body, webhook secret). */
export function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !signature) return false;
  return safeEqual(hmacSha256Hex(env.RAZORPAY_WEBHOOK_SECRET, rawBody), signature);
}
