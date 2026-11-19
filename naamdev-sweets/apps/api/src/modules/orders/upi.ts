import type { Transaction } from "firebase-admin/firestore";
import QRCode from "qrcode";
import { C, db, getDoc, getDocs, type Order, type Payment, type UpiReference, type WithId } from "@naamdev/db";
import { buildUpiLink, formatINR } from "@naamdev/shared";
import { audit } from "../../lib/audit";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { live } from "../../lib/live";
import { getSetting } from "../../lib/settings";
import { notify, notifyStaff } from "../notifications/service";
import { applyTransition, runEffects, withOrderTx, type Actor } from "./service";

/**
 * Direct UPI payments to the shop's own UPI ID (Settings → UPI).
 *
 * There is no payment gateway in this flow, so nothing tells the server that money arrived. The
 * order therefore stays PENDING (not sent to the kitchen) until a staff member with
 * `payments.verify` finds the payment in the shop's UPI account and confirms it. The customer's
 * reference number (UTR) only helps staff find it — it is never treated as proof of payment.
 */

const paymentsCol = () => db.collection(C.payments);
const upiRefs = () => db.collection(C.upiReferences);

export async function upiOption() {
  const upi = await getSetting("upi");
  const configured = !!upi.vpa && !!upi.payeeName;
  return {
    available: upi.enabled && configured,
    reason: !upi.enabled ? "UPI payments are currently unavailable" : !configured ? "UPI payments are not set up yet" : null,
  };
}

export const upiNote = (template: string, orderNumber: string) => template.replaceAll("{ORDER_NUMBER}", orderNumber).slice(0, 80);

/** The Payment row for a new UPI order (written in the order's transaction). */
export function upiPaymentData(order: { id?: string; userId: string; totalPaise: number }, orderId: string, now: Date): Payment {
  return {
    orderId, userId: order.userId, method: "UPI", provider: "upi_direct", status: "CREATED", amountPaise: order.totalPaise, currency: "INR",
    gatewayOrderId: null, gatewayPaymentId: null, methodDetail: null, failureReason: null, raw: null, capturedAt: null, submittedAt: null,
    verifiedById: null, verifiedByName: null, verifiedAt: null, createdAt: now, updatedAt: now,
  };
}

async function upiPayments(orderId: string, tx?: Transaction) {
  return (await getDocs<Payment>(paymentsCol().where("orderId", "==", orderId), tx)).filter((p) => p.method === "UPI").sort((a, b) => +b.createdAt - +a.createdAt);
}

/** What the customer needs to pay: the UPI link (opens their UPI app), a QR code for desktop, and status. */
export async function upiSession(order: WithId<Order>) {
  if (order.paymentMethod !== "UPI") return null;
  const [upi, payments] = await Promise.all([getSetting("upi"), upiPayments(order.id)]);
  const latest = payments[0] ?? null;
  const note = upiNote(upi.noteTemplate, order.orderNumber);
  const link = buildUpiLink({ vpa: upi.vpa, payeeName: upi.payeeName, amountPaise: order.totalPaise, note });
  const awaitingPayment = order.status === "PENDING" && order.paymentStatus === "PENDING";
  return {
    status: order.paymentStatus === "PAID" ? "PAID" : order.paymentStatus === "VERIFYING" ? "VERIFYING" : awaitingPayment ? "AWAITING_PAYMENT" : "CLOSED",
    vpa: upi.vpa,
    payeeName: upi.payeeName,
    amountPaise: order.totalPaise,
    note,
    link: awaitingPayment ? link : null,
    qrSvg: awaitingPayment ? await QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M", width: 240 }) : null,
    expiresAt: order.reservationExpiresAt,
    reference: latest?.gatewayPaymentId ?? null,
    lastRejection: latest?.status === "FAILED" ? latest.failureReason : null,
  };
}

/** The customer reports their UPI transaction reference. Staff still have to confirm the money arrived. */
export async function submitUpiReference(userId: string, orderId: string, utr: string) {
  const { result, effects } = await withOrderTx(async (ctx) => {
    const order = await ctx.lock(orderId);
    if (order.userId !== userId) throw notFound("Order");
    if (order.paymentMethod !== "UPI") throw badRequest("This order isn't paid by UPI.");
    if (order.paymentStatus === "VERIFYING") throw conflict("We're already checking your payment. You'll be notified as soon as it's confirmed.", undefined, "ALREADY_SUBMITTED");
    if (order.status !== "PENDING" || order.paymentStatus !== "PENDING") throw badRequest("This order is not awaiting payment.");
    const [refDoc, payments] = await Promise.all([ctx.tx.get(upiRefs().doc(utr)), upiPayments(order.id, ctx.tx)]);
    if (refDoc.exists) throw conflict("This UPI reference number has already been used. Check the number in your UPI app.", undefined, "UPI_REFERENCE_USED");
    const now = new Date();
    let payment = payments[0];
    let paymentId: string;
    if (payment && payment.status === "CREATED") {
      paymentId = payment.id;
    } else {
      // A previous reference was not found: record the new attempt separately.
      const ref = paymentsCol().doc();
      ctx.tx.set(ref, upiPaymentData(order, order.id, now));
      paymentId = ref.id;
      payment = { ...upiPaymentData(order, order.id, now), id: ref.id };
    }
    ctx.tx.update(paymentsCol().doc(paymentId), { status: "SUBMITTED", gatewayPaymentId: utr, methodDetail: "UPI", submittedAt: now, failureReason: null, updatedAt: now });
    ctx.tx.set(upiRefs().doc(utr), { orderId: order.id, paymentId, userId, createdAt: now } satisfies UpiReference);
    order.paymentStatus = "VERIFYING";
    // Stock stays reserved while staff check; the expiry job skips orders being verified.
    order.reservationExpiresAt = null;
    ctx.save(order);
    const o = order;
    ctx.effects.push({
      kind: "run",
      fn: () => {
        live.order(o.id, { userId: o.userId, partnerId: null, status: o.status, event: "payment" });
        live.staff("order-updated", { orderId: o.id, paymentStatus: "VERIFYING" });
        notifyStaff("payments.verify", {
          type: "PAYMENT", title: `Check UPI payment · ${o.orderNumber}`,
          body: `${formatINR(o.totalPaise)} · UPI ref ${utr}. Confirm it in the shop's UPI account before accepting the order.`,
          link: `/orders/${o.id}`, template: "admin.upi_verify",
        });
      },
    });
    return order;
  });
  await runEffects(effects);
  return result;
}

/** Staff confirm (RECEIVED) or reject (NOT_FOUND) a direct UPI payment after checking the shop's UPI account. */
export async function verifyUpiPayment(orderId: string, decision: "RECEIVED" | "NOT_FOUND", actor: Actor & { userId: string; name: string }, note?: string) {
  const upi = await getSetting("upi");
  const { result, effects } = await withOrderTx(async (ctx) => {
    const order = await ctx.lock(orderId);
    if (order.paymentMethod !== "UPI") throw badRequest("This order isn't paid by UPI.");
    const payment = (await upiPayments(order.id, ctx.tx)).find((p) => p.status === "SUBMITTED");
    if (!payment) throw badRequest("There is no UPI payment waiting to be checked for this order.");
    const now = new Date();
    const who = { verifiedById: actor.userId, verifiedByName: actor.name, verifiedAt: now, updatedAt: now };
    if (decision === "RECEIVED") {
      ctx.tx.update(paymentsCol().doc(payment.id), { ...who, status: "CAPTURED", capturedAt: now, failureReason: null });
      order.paymentStatus = "PAID";
      ctx.save(order);
      if (order.status === "PENDING") await applyTransition(ctx, order, "CONFIRMED", actor, `UPI payment verified by ${actor.name}${note ? ` — ${note}` : ""}`);
      else if (order.status === "CANCELLED")
        // Paid, but the order was cancelled meanwhile: the money must go back.
        ctx.effects.push({ kind: "autoRefund", orderId: order.id, reason: "UPI payment received for a cancelled order" });
      ctx.effects.push({ kind: "paid", order });
    } else {
      ctx.tx.update(paymentsCol().doc(payment.id), { ...who, status: "FAILED", failureReason: note ? `Not found in the shop's UPI account: ${note}` : "Not found in the shop's UPI account" });
      if (order.status === "PENDING") {
        // Give the customer another chance to correct the reference or pay.
        order.paymentStatus = "PENDING";
        order.reservationExpiresAt = new Date(now.getTime() + upi.payWithinMinutes * 60_000);
      } else order.paymentStatus = "FAILED";
      ctx.save(order);
      const o = order;
      ctx.effects.push({
        kind: "run",
        fn: () => {
          live.order(o.id, { userId: o.userId, partnerId: null, status: o.status, event: "payment" });
          notify({
            userId: o.userId, type: "PAYMENT", title: `We couldn't find your UPI payment · ${o.orderNumber}`,
            body: o.status === "PENDING"
              ? `Please check the UPI reference number, or pay ${formatINR(o.totalPaise)} again, within ${upi.payWithinMinutes} minutes.`
              : "If money was debited from your account, please contact support with your UPI reference.",
            link: `/account/orders/${o.id}`, template: "upi.not_found", channels: ["IN_APP", "EMAIL", "PUSH"],
          });
        },
      });
    }
    ctx.effects.push({ kind: "run", fn: () => live.staff("order-updated", { orderId: order.id, paymentStatus: order.paymentStatus }) });
    return { order, payment };
  });
  await runEffects(effects);
  return result;
}

/** Orders whose UPI reference is waiting for a staff check (console badge + list). */
export async function pendingUpiVerifications() {
  const orders = await getDocs<Order>(db.collection(C.orders).where("paymentStatus", "==", "VERIFYING").limit(200));
  const payments = await Promise.all(orders.map((o) => upiPayments(o.id)));
  return orders
    .map((o, i) => {
      const p = payments[i]!.find((x) => x.status === "SUBMITTED");
      return { orderId: o.id, orderNumber: o.orderNumber, status: o.status, totalPaise: o.totalPaise, customerName: o.addressSnapshot?.fullName ?? null, reference: p?.gatewayPaymentId ?? null, submittedAt: p?.submittedAt ?? null };
    })
    .sort((a, b) => +(a.submittedAt ?? 0) - +(b.submittedAt ?? 0));
}

export async function auditUpiDecision(req: Parameters<typeof audit>[0], orderId: string, decision: string, reference: string | null, note?: string) {
  await audit(req, decision === "RECEIVED" ? "payment.upi_verified" : "payment.upi_not_found", "Order", orderId, { reference, note });
}

export async function getUpiOrder(orderId: string) {
  const order = await getDoc<Order>(db.collection(C.orders).doc(orderId));
  if (!order) throw notFound("Order");
  return order;
}
