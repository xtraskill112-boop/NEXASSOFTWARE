import { Router } from "express";
import { prisma } from "@naamdev/db";
import { contactSchema, paginationSchema, ticketCreateSchema, ticketReplySchema } from "@naamdev/shared";
import { nextTicketNumber } from "../../lib/counters";
import { badRequest, notFound } from "../../lib/errors";
import { body, pageMeta, paginate, param, query } from "../../lib/http";
import { requireAuth } from "../../middleware/auth";
import { writeLimiter } from "../../middleware/rate-limit";
import { notifyStaff } from "../notifications/service";

export const supportRouter = Router();

const PRIORITY_BY_CATEGORY: Record<string, "LOW" | "MEDIUM" | "HIGH"> = { REFUND: "HIGH", PAYMENT: "HIGH", DELIVERY: "HIGH", CANCELLATION: "HIGH", PRODUCT_QUALITY: "HIGH", FEEDBACK: "LOW" };

supportRouter.post("/contact", writeLimiter, async (req, res) => {
  const input = body(req, contactSchema);
  const ticket = await prisma.$transaction(async (tx) =>
    tx.supportTicket.create({
      data: {
        ticketNumber: await nextTicketNumber(tx), userId: req.auth?.user.id, guestName: input.name, guestEmail: input.email, guestPhone: input.phone,
        category: "OTHER", priority: "MEDIUM", subject: input.subject,
        messages: { create: { authorType: req.auth ? "CUSTOMER" : "SYSTEM", authorId: req.auth?.user.id, body: input.message } },
      },
    }),
  );
  notifyStaff("support.view", { type: "SUPPORT", title: `New enquiry ${ticket.ticketNumber}`, body: input.subject, link: `/support/${ticket.id}`, template: "admin.ticket" });
  res.status(201).json({ ticket: { ticketNumber: ticket.ticketNumber } });
});

supportRouter.use(requireAuth);

supportRouter.get("/tickets", async (req, res) => {
  const { page, pageSize } = query(req, paginationSchema);
  const where = { userId: req.auth!.user.id };
  const [total, items] = await Promise.all([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({ where, orderBy: { lastActivityAt: "desc" }, include: { order: { select: { orderNumber: true } } }, ...paginate(page, pageSize) }),
  ]);
  res.json({ items, meta: pageMeta(total, page, pageSize) });
});

supportRouter.post("/tickets", writeLimiter, async (req, res) => {
  const input = body(req, ticketCreateSchema);
  const uid = req.auth!.user.id;
  if (input.orderId && !(await prisma.order.findFirst({ where: { id: input.orderId, userId: uid } }))) throw badRequest("Order not found");
  const ticket = await prisma.$transaction(async (tx) =>
    tx.supportTicket.create({
      data: {
        ticketNumber: await nextTicketNumber(tx), userId: uid, orderId: input.orderId ?? null, category: input.category,
        priority: PRIORITY_BY_CATEGORY[input.category] ?? "MEDIUM", subject: input.subject,
        messages: { create: { authorType: "CUSTOMER", authorId: uid, body: input.message } },
      },
    }),
  );
  notifyStaff("support.view", { type: "SUPPORT", title: `New ticket ${ticket.ticketNumber}`, body: `${input.category}: ${input.subject}`, link: `/support/${ticket.id}`, template: "admin.ticket" });
  res.status(201).json({ ticket });
});

supportRouter.get("/tickets/:id", async (req, res) => {
  const t = await prisma.supportTicket.findFirst({
    where: { id: param(req, "id"), userId: req.auth!.user.id },
    include: { messages: { where: { isInternal: false }, orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } }, order: { select: { id: true, orderNumber: true } } },
  });
  if (!t) throw notFound("Ticket");
  res.json({ ticket: t });
});

supportRouter.post("/tickets/:id/messages", writeLimiter, async (req, res) => {
  const { body: text } = body(req, ticketReplySchema);
  const t = await prisma.supportTicket.findFirst({ where: { id: param(req, "id"), userId: req.auth!.user.id } });
  if (!t) throw notFound("Ticket");
  if (t.status === "CLOSED") throw badRequest("This ticket is closed. Please open a new one.");
  const msg = await prisma.ticketMessage.create({ data: { ticketId: t.id, authorId: req.auth!.user.id, authorType: "CUSTOMER", body: text } });
  await prisma.supportTicket.update({ where: { id: t.id }, data: { lastActivityAt: new Date(), status: t.status === "AWAITING_CUSTOMER" || t.status === "RESOLVED" ? "OPEN" : t.status } });
  notifyStaff("support.view", { type: "SUPPORT", title: `Customer replied · ${t.ticketNumber}`, body: text.slice(0, 120), link: `/support/${t.id}`, template: "admin.ticket_reply" });
  res.status(201).json({ message: msg });
});
