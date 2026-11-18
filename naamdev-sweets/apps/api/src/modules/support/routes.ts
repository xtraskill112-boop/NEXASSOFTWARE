import { Router } from "express";
import { C, db, getDoc, getDocs, runTx, SUB, type Order, type SupportTicket, type TicketMessage } from "@naamdev/db";
import { contactSchema, paginationSchema, ticketCreateSchema, ticketReplySchema } from "@naamdev/shared";
import { nextTicketNumber } from "../../lib/counters";
import { badRequest, notFound } from "../../lib/errors";
import { body, pageOf, param, query } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { writeLimiter } from "../../middleware/rate-limit";
import { notifyStaff } from "../notifications/service";

export const supportRouter = Router();
const tickets = () => db.collection(C.tickets);

const PRIORITY_BY_CATEGORY: Record<string, "LOW" | "MEDIUM" | "HIGH"> = { REFUND: "HIGH", PAYMENT: "HIGH", DELIVERY: "HIGH", CANCELLATION: "HIGH", PRODUCT_QUALITY: "HIGH", FEEDBACK: "LOW" };

/** Creates a ticket with its first message atomically. */
async function createTicket(t: Omit<SupportTicket, "ticketNumber" | "status" | "lastActivityAt" | "resolvedAt" | "closedAt" | "createdAt" | "updatedAt" | "assignedToId" | "assignedToName">, first: Omit<TicketMessage, "createdAt" | "isInternal">) {
  return runTx(async (tx) => {
    const ticketNumber = await nextTicketNumber(tx);
    const ref = tickets().doc();
    const now = new Date();
    const data: SupportTicket = { ...t, ticketNumber, status: "OPEN", assignedToId: null, assignedToName: null, lastActivityAt: now, resolvedAt: null, closedAt: null, createdAt: now, updatedAt: now };
    tx.set(ref, data);
    tx.set(ref.collection(SUB.messages).doc(), { ...first, isInternal: false, createdAt: now });
    return { ...data, id: ref.id };
  });
}

supportRouter.post("/contact", writeLimiter, async (req, res) => {
  const input = body(req, contactSchema);
  const ticket = await createTicket(
    {
      userId: req.auth?.user.id ?? null, customerName: req.auth?.user.name ?? input.name, guestName: input.name, guestEmail: input.email ?? null, guestPhone: input.phone ?? null,
      orderId: null, orderNumber: null, category: "OTHER", priority: "MEDIUM", subject: input.subject,
    },
    { authorType: req.auth ? "CUSTOMER" : "SYSTEM", authorId: req.auth?.user.id ?? null, authorName: req.auth?.user.name ?? input.name, body: input.message },
  );
  notifyStaff("support.view", { type: "SUPPORT", title: `New enquiry ${ticket.ticketNumber}`, body: input.subject, link: `/support/${ticket.id}`, template: "admin.ticket" });
  res.status(201).json({ ticket: { ticketNumber: ticket.ticketNumber } });
});

supportRouter.use(requireAuth);

const withOrder = (t: SupportTicket & { id: string }) => ({ ...t, order: t.orderId ? { id: t.orderId, orderNumber: t.orderNumber } : null });

supportRouter.get("/tickets", async (req, res) => {
  const { page, pageSize } = query(req, paginationSchema);
  const all = (await getDocs<SupportTicket>(tickets().where("userId", "==", req.auth!.user.id))).sort((a, b) => +b.lastActivityAt - +a.lastActivityAt);
  const pg = pageOf(all.map(withOrder), page, pageSize);
  res.json(pg);
});

supportRouter.post("/tickets", writeLimiter, async (req, res) => {
  const input = body(req, ticketCreateSchema);
  const uid = req.auth!.user.id;
  let orderNumber: string | null = null;
  if (input.orderId) {
    const o = await getDoc<Order>(db.collection(C.orders).doc(input.orderId));
    if (!o || o.userId !== uid) throw badRequest("Order not found");
    orderNumber = o.orderNumber;
  }
  const ticket = await createTicket(
    {
      userId: uid, customerName: req.auth!.user.name, guestName: null, guestEmail: null, guestPhone: null, orderId: input.orderId ?? null, orderNumber,
      category: input.category, priority: PRIORITY_BY_CATEGORY[input.category] ?? "MEDIUM", subject: input.subject,
    },
    { authorType: "CUSTOMER", authorId: uid, authorName: req.auth!.user.name, body: input.message },
  );
  notifyStaff("support.view", { type: "SUPPORT", title: `New ticket ${ticket.ticketNumber}`, body: `${input.category}: ${input.subject}`, link: `/support/${ticket.id}`, template: "admin.ticket" });
  res.status(201).json({ ticket });
});

async function ownTicket(uid: string, id: string) {
  const t = await getDoc<SupportTicket>(tickets().doc(id));
  if (!t || t.userId !== uid) throw notFound("Ticket");
  return t;
}

supportRouter.get("/tickets/:id", async (req, res) => {
  const t = await ownTicket(req.auth!.user.id, param(req, "id"));
  const messages = (await getDocs<TicketMessage>(tickets().doc(t.id).collection(SUB.messages).orderBy("createdAt", "asc")))
    .filter((m) => !m.isInternal)
    .map((m) => ({ ...m, author: m.authorName ? { name: m.authorName } : null }));
  res.json({ ticket: { ...withOrder(t), messages } });
});

supportRouter.post("/tickets/:id/messages", writeLimiter, async (req, res) => {
  const { body: text } = body(req, ticketReplySchema);
  const t = await ownTicket(req.auth!.user.id, param(req, "id"));
  if (t.status === "CLOSED") throw badRequest("This ticket is closed. Please open a new one.");
  const now = new Date();
  const msg: TicketMessage = { authorId: req.auth!.user.id, authorName: req.auth!.user.name, authorType: "CUSTOMER", body: text, isInternal: false, createdAt: now };
  const ref = await tickets().doc(t.id).collection(SUB.messages).add(msg);
  await tickets().doc(t.id).update({ lastActivityAt: now, updatedAt: now, status: t.status === "AWAITING_CUSTOMER" || t.status === "RESOLVED" ? "OPEN" : t.status });
  notifyStaff("support.view", { type: "SUPPORT", title: `Customer replied · ${t.ticketNumber}`, body: text.slice(0, 120), link: `/support/${t.id}`, template: "admin.ticket_reply" });
  res.status(201).json({ message: { ...msg, id: ref.id } });
});
