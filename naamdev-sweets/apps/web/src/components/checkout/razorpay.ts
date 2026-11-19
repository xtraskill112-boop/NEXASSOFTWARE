"use client";
import type { PaymentSession } from "@naamdev/api-client";

interface RazorpayResponse { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
declare global {
  interface Window { Razorpay?: new (opts: object) => { open: () => void; on: (e: string, fn: (r: { error?: { description?: string } }) => void) => void } }
}

let loading: Promise<void> | null = null;
export function loadRazorpay(): Promise<void> {
  if (typeof window !== "undefined" && window.Razorpay) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error("Couldn't load the payment window. Check your connection and try again.")); };
    document.body.appendChild(s);
  });
  return loading;
}

/** Opens Razorpay Checkout. Resolves with the signed response; rejects if the customer closes it or payment fails. */
export async function payWithRazorpay(session: PaymentSession): Promise<RazorpayResponse> {
  await loadRazorpay();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: session.keyId,
      amount: session.amountPaise,
      currency: session.currency,
      order_id: session.razorpayOrderId,
      name: "NAAMDEV SWEETS",
      description: `Order ${session.orderNumber}`,
      image: "/icons/icon-192.png",
      prefill: session.prefill,
      notes: { orderNumber: session.orderNumber },
      theme: { color: "#8F1D34" },
      handler: (r: RazorpayResponse) => resolve(r),
      modal: { ondismiss: () => reject(new Error("DISMISSED")), confirm_close: true },
    });
    rzp.on("payment.failed", (r) => reject(new Error(r.error?.description ?? "Payment failed")));
    rzp.open();
  });
}
