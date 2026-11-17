import { Router } from "express";
import { z } from "zod";
import { prisma } from "@naamdev/db";
import {
  deliveryOtpSchema, documentTypeSchema, locationUpdateSchema, paginationSchema, partnerProfileSchema, partnerRegisterSchema,
  REQUIRED_PARTNER_DOCUMENTS, googleMapsDirectionsUrl,
} from "@naamdev/shared";
import { encrypt } from "../../lib/crypto";
import { badRequest, forbidden, notFound } from "../../lib/errors";
import { body, pageMeta, paginate, param, query } from "../../lib/http";
import { requireAuth, requirePartner } from "../../middleware/auth";
import { authLimiter, uploadLimiter } from "../../middleware/rate-limit";
import { verifyOtp } from "../auth/otp";
import { createSession, currentUserPayload, registerCustomer } from "../auth/service";
import { notifyStaff } from "../notifications/service";
import { memoryUpload, storePrivateDocument } from "../uploads/storage";
import { advanceAssignment, completeDelivery, earningsSummary, offerPayload, respondToOffer, updateLocation } from "./service";

export const deliveryRouter = Router();

deliveryRouter.post("/register", authLimiter, async (req, res) => {
  const input = body(req, partnerRegisterSchema);
  await verifyOtp(input.phone, "REGISTER", input.otp);
  const user = await prisma.$transaction(async (tx) => {
    const u = await registerCustomer({ name: input.name, phone: input.phone, email: input.email, password: input.password, roleKey: "DELIVERY_PARTNER", tx });
    await tx.deliveryPartner.create({ data: { userId: u.id, city: input.city, vehicleType: input.vehicleType, vehicleNumber: input.vehicleNumber, licenseNumber: input.licenseNumber } });
    return u;
  });
  req.clientApp = "delivery";
  await createSession(req, res, user.id);
  notifyStaff("partners.manage", { type: "DELIVERY", title: "New delivery partner signup", body: `${input.name} (${input.city}) is awaiting verification.`, link: "/delivery/partners", template: "admin.partner_signup" });
  res.status(201).json({ user: await currentUserPayload(user.id) });
});

deliveryRouter.use(requireAuth, requirePartner);

const partnerOf = (id: string) =>
  prisma.deliveryPartner.findUniqueOrThrow({ where: { id }, include: { documents: { orderBy: { uploadedAt: "desc" } }, user: { select: { name: true, phone: true, email: true, avatarUrl: true } } } });

function serializePartner(p: Awaited<ReturnType<typeof partnerOf>>) {
  const { bankAccountEncrypted: _omit, ...rest } = p;
  const uploaded = new Set(p.documents.map((d) => d.type));
  return {
    ...rest,
    documents: p.documents.map((d) => ({ id: d.id, type: d.type, status: d.status, rejectionReason: d.rejectionReason, uploadedAt: d.uploadedAt, mimeType: d.mimeType })),
    missingDocuments: REQUIRED_PARTNER_DOCUMENTS.filter((t) => !uploaded.has(t)),
  };
}

deliveryRouter.get("/me", async (req, res) => {
  const p = await partnerOf(req.auth!.partnerId!);
  res.json({ partner: serializePartner(p), earnings: await earningsSummary(p.id) });
});

deliveryRouter.patch("/me", async (req, res) => {
  const input = body(req, partnerProfileSchema);
  const { bankAccountNumber, ...rest } = input;
  await prisma.deliveryPartner.update({
    where: { id: req.auth!.partnerId! },
    data: {
      ...rest,
      ...(bankAccountNumber ? { bankAccountEncrypted: encrypt(bankAccountNumber), bankAccountLast4: bankAccountNumber.slice(-4) } : {}),
    },
  });
  res.json({ partner: serializePartner(await partnerOf(req.auth!.partnerId!)) });
});

deliveryRouter.post("/documents", uploadLimiter, memoryUpload(10).single("file"), async (req, res) => {
  const type = documentTypeSchema.parse(req.body?.type);
  if (!req.file) throw badRequest("Choose a file to upload");
  const partnerId = req.auth!.partnerId!;
  const stored = await storePrivateDocument(req.file.buffer, `partners/${partnerId}`);
  const doc = await prisma.partnerDocument.upsert({
    where: { partnerId_type: { partnerId, type } },
    update: { storageKey: stored.storageKey, mimeType: stored.mimeType, status: "PENDING", rejectionReason: null, uploadedAt: new Date(), reviewedAt: null },
    create: { partnerId, type, storageKey: stored.storageKey, mimeType: stored.mimeType },
  });
  res.status(201).json({ document: { id: doc.id, type: doc.type, status: doc.status, uploadedAt: doc.uploadedAt } });
});

deliveryRouter.post("/status", async (req, res) => {
  const { online } = body(req, z.object({ online: z.boolean() }));
  const p = await prisma.deliveryPartner.findUniqueOrThrow({ where: { id: req.auth!.partnerId! } });
  if (online && p.status !== "APPROVED") throw forbidden(p.status === "SUSPENDED" ? "Your account is suspended. Contact support." : "Your account is awaiting verification.");
  if (!online) {
    const busy = await prisma.deliveryAssignment.count({ where: { partnerId: p.id, status: { in: ["ACCEPTED", "AT_STORE", "PICKED_UP", "OUT_FOR_DELIVERY"] } } });
    if (busy) throw badRequest("Finish your active deliveries before going offline.");
    await prisma.deliveryAssignment.updateMany({ where: { partnerId: p.id, status: "OFFERED" }, data: { status: "EXPIRED", respondedAt: new Date() } });
  }
  const updated = await prisma.deliveryPartner.update({ where: { id: p.id }, data: { isOnline: online } });
  res.json({ isOnline: updated.isOnline });
});

deliveryRouter.post("/location", async (req, res) => {
  res.json(await updateLocation(req.auth!.partnerId!, body(req, locationUpdateSchema)));
});

const assignmentInclude = {
  order: { include: { store: true, items: { select: { productName: true, variantLabel: true, quantity: true } } } },
} as const;

function serializeAssignment(a: Awaited<ReturnType<typeof prisma.deliveryAssignment.findFirstOrThrow<{ where: object; include: typeof assignmentInclude }>>>) {
  const o = a.order;
  const addr = o.addressSnapshot as Record<string, string | null>;
  const revealCustomer = ["ACCEPTED", "AT_STORE", "PICKED_UP", "OUT_FOR_DELIVERY"].includes(a.status);
  const drop = o.deliveryLat != null && o.deliveryLng != null ? { lat: o.deliveryLat, lng: o.deliveryLng } : null;
  return {
    ...offerPayload(a, o),
    orderStatus: o.status,
    acceptedAt: a.respondedAt,
    pickedUpAt: a.pickedUpAt,
    deliveredAt: a.deliveredAt,
    items: o.items,
    customer: revealCustomer
      ? {
          name: o.customerName, phone: o.customerPhone,
          address: [addr.line1, addr.line2, addr.landmark, `${addr.city} ${addr.pincode}`].filter(Boolean).join(", "),
          instructions: o.deliveryInstructions,
        }
      : null,
    navigation: {
      toStore: o.store ? googleMapsDirectionsUrl({ lat: o.store.lat, lng: o.store.lng }) : null,
      toCustomer: drop ? googleMapsDirectionsUrl(drop) : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${addr.line1}, ${addr.city} ${addr.pincode}`)}`,
    },
  };
}

deliveryRouter.get("/offers", async (req, res) => {
  const rows = await prisma.deliveryAssignment.findMany({
    where: { partnerId: req.auth!.partnerId!, status: "OFFERED", offerExpiresAt: { gt: new Date() } },
    include: assignmentInclude,
    orderBy: { offeredAt: "desc" },
  });
  res.json({ offers: rows.map(serializeAssignment) });
});

deliveryRouter.get("/assignments/active", async (req, res) => {
  const rows = await prisma.deliveryAssignment.findMany({
    where: { partnerId: req.auth!.partnerId!, status: { in: ["ACCEPTED", "AT_STORE", "PICKED_UP", "OUT_FOR_DELIVERY"] } },
    include: assignmentInclude,
    orderBy: { offeredAt: "asc" },
  });
  res.json({ assignments: rows.map(serializeAssignment) });
});

deliveryRouter.get("/assignments/history", async (req, res) => {
  const { page, pageSize } = query(req, paginationSchema);
  const where = { partnerId: req.auth!.partnerId!, status: { in: ["DELIVERED", "CANCELLED", "REJECTED", "EXPIRED"] as never } };
  const [total, rows] = await Promise.all([
    prisma.deliveryAssignment.count({ where }),
    prisma.deliveryAssignment.findMany({ where, include: assignmentInclude, orderBy: { updatedAt: "desc" }, ...paginate(page, pageSize) }),
  ]);
  res.json({ items: rows.map(serializeAssignment), meta: pageMeta(total, page, pageSize) });
});

deliveryRouter.get("/assignments/:id", async (req, res) => {
  const a = await prisma.deliveryAssignment.findFirst({ where: { id: param(req, "id"), partnerId: req.auth!.partnerId! }, include: assignmentInclude });
  if (!a) throw notFound("Delivery");
  res.json({ assignment: serializeAssignment(a) });
});

const reload = async (id: string) => serializeAssignment(await prisma.deliveryAssignment.findUniqueOrThrow({ where: { id }, include: assignmentInclude }));

deliveryRouter.post("/assignments/:id/accept", async (req, res) => {
  const a = await respondToOffer(req.auth!.partnerId!, param(req, "id"), true);
  res.json({ assignment: await reload(a.id) });
});

deliveryRouter.post("/assignments/:id/reject", async (req, res) => {
  const { reason } = body(req, z.object({ reason: z.string().trim().max(200).optional() }));
  const a = await respondToOffer(req.auth!.partnerId!, param(req, "id"), false, reason);
  res.json({ assignment: { id: a.id, status: a.status } });
});

for (const step of ["arrived", "pickup", "start"] as const) {
  deliveryRouter.post(`/assignments/:id/${step}`, async (req, res) => {
    const a = await advanceAssignment(req.auth!.partnerId!, param(req, "id"), step);
    res.json({ assignment: await reload(a.id) });
  });
}

deliveryRouter.post("/assignments/:id/deliver", authLimiter, async (req, res) => {
  const { otp, codCollected } = body(req, deliveryOtpSchema);
  const a = await completeDelivery(req.auth!.partnerId!, param(req, "id"), otp, codCollected);
  res.json({ assignment: await reload(a.id) });
});

deliveryRouter.get("/earnings", async (req, res) => {
  const { page, pageSize } = query(req, paginationSchema);
  const where = { partnerId: req.auth!.partnerId! };
  const [summary, total, items] = await Promise.all([
    earningsSummary(req.auth!.partnerId!),
    prisma.partnerEarning.count({ where }),
    prisma.partnerEarning.findMany({ where, orderBy: { createdAt: "desc" }, ...paginate(page, pageSize) }),
  ]);
  res.json({ summary, items, meta: pageMeta(total, page, pageSize) });
});
