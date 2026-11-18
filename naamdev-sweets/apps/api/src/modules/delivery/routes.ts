import { Router } from "express";
import { z } from "zod";
import {
  C, createUserDoc, db, getDoc, getDocs, getMany, runTx, SUB, syncClaims,
  type DeliveryAssignment, type DeliveryPartner, type Order, type PartnerDocument, type PartnerEarning, type WithId,
} from "@naamdev/db";
import {
  deliveryOtpSchema, documentTypeSchema, locationUpdateSchema, paginationSchema, partnerProfileSchema, partnerRegisterSchema,
  REQUIRED_PARTNER_DOCUMENTS, googleMapsDirectionsUrl,
} from "@naamdev/shared";
import { encrypt } from "../../lib/crypto";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "../../lib/errors";
import { body, pageOf, param, query } from "../../lib/http";
import { requireAuth, requirePartner } from "../../middleware/auth";
import { authLimiter, uploadLimiter } from "../../middleware/rate-limit";
import { currentUserPayload } from "../auth/service";
import { defaultStore } from "../catalog/service";
import { notifyStaff } from "../notifications/service";
import { memoryUpload, storePrivateDocument } from "../uploads/storage";
import { ACTIVE, advanceAssignment, completeDelivery, earningsSummary, offerPayload, respondToOffer, updateLocation } from "./service";

export const deliveryRouter = Router();
const partnerRef = (id: string) => db.collection(C.partners).doc(id);
const assignments = () => db.collection(C.assignments);

/** Completes rider sign-up: the Firebase account (email + password) exists; create the partner profile. */
deliveryRouter.post("/register", authLimiter, async (req, res) => {
  if (req.auth) throw conflict("This email already has a NAAMDEV account. Use a different email for the partner app.", undefined, "ACCOUNT_EXISTS");
  if (!req.firebaseUser) throw unauthorized("Create your account first, then complete your profile.");
  const input = body(req, partnerRegisterSchema);
  const fb = req.firebaseUser;
  await runTx(async (tx) => {
    if ((await tx.get(db.collection(C.users).doc(fb.uid))).exists) throw conflict("Your account is already set up. Please log in.", undefined, "ACCOUNT_EXISTS");
    await createUserDoc(tx, fb.uid, { name: input.name, email: fb.email, phone: input.phone, roleKey: "DELIVERY_PARTNER", isStaff: false, emailVerified: fb.emailVerified });
    const now = new Date();
    const partner: DeliveryPartner = {
      userId: fb.uid, name: input.name, phone: input.phone, email: fb.email, status: "PENDING", vehicleType: input.vehicleType,
      vehicleNumber: input.vehicleNumber ?? null, licenseNumber: input.licenseNumber ?? null, city: input.city, isOnline: false,
      currentLat: null, currentLng: null, lastLocationAt: null, rating: 5, totalDeliveries: 0, bankAccountName: null, bankAccountEncrypted: null,
      bankAccountLast4: null, bankIfsc: null, upiId: null, emergencyContact: null, approvedAt: null, approvedById: null, statusReason: null,
      createdAt: now, updatedAt: now,
    };
    tx.set(partnerRef(fb.uid), partner);
  });
  await syncClaims(fb.uid, "DELIVERY_PARTNER", false);
  notifyStaff("partners.manage", { type: "DELIVERY", title: "New delivery partner signup", body: `${input.name} (${input.city}) is awaiting verification.`, link: "/delivery/partners", template: "admin.partner_signup" });
  res.status(201).json({ user: await currentUserPayload(fb.uid) });
});

deliveryRouter.use(requireAuth, requirePartner);

async function partnerOf(id: string) {
  const [p, docs, user] = await Promise.all([
    getDoc<DeliveryPartner>(partnerRef(id)),
    getDocs<PartnerDocument>(partnerRef(id).collection(SUB.documents)),
    getDoc<{ avatarUrl: string | null }>(db.collection(C.users).doc(id)),
  ]);
  if (!p) throw notFound("Partner");
  return { ...p, documents: docs.sort((a, b) => +b.uploadedAt - +a.uploadedAt), user: { name: p.name, phone: p.phone, email: p.email, avatarUrl: user?.avatarUrl ?? null } };
}

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
  await partnerRef(req.auth!.partnerId!).update({
    ...rest,
    ...(bankAccountNumber ? { bankAccountEncrypted: encrypt(bankAccountNumber), bankAccountLast4: bankAccountNumber.slice(-4) } : {}),
    updatedAt: new Date(),
  });
  res.json({ partner: serializePartner(await partnerOf(req.auth!.partnerId!)) });
});

deliveryRouter.post("/documents", uploadLimiter, memoryUpload(10).single("file"), async (req, res) => {
  const type = documentTypeSchema.parse(req.body?.type);
  if (!req.file) throw badRequest("Choose a file to upload");
  const partnerId = req.auth!.partnerId!;
  const stored = await storePrivateDocument(req.file.buffer, `partners/${partnerId}`);
  const now = new Date();
  const doc: PartnerDocument = { partnerId, type, storageKey: stored.storageKey, mimeType: stored.mimeType, status: "PENDING", rejectionReason: null, uploadedAt: now, reviewedAt: null };
  await partnerRef(partnerId).collection(SUB.documents).doc(type).set(doc);
  res.status(201).json({ document: { id: type, type, status: doc.status, uploadedAt: now } });
});

deliveryRouter.post("/status", async (req, res) => {
  const { online } = body(req, z.object({ online: z.boolean() }));
  const p = await getDoc<DeliveryPartner>(partnerRef(req.auth!.partnerId!));
  if (!p) throw notFound("Partner");
  if (online && p.status !== "APPROVED") throw forbidden(p.status === "SUSPENDED" ? "Your account is suspended. Contact support." : "Your account is awaiting verification.");
  if (!online) {
    const mine = await getDocs<DeliveryAssignment>(assignments().where("partnerId", "==", p.id).where("status", "in", [...ACTIVE, "OFFERED"]));
    if (mine.some((a) => a.status !== "OFFERED")) throw badRequest("Finish your active deliveries before going offline.");
    const now = new Date();
    await Promise.all(mine.map((a) => assignments().doc(a.id).update({ status: "EXPIRED", respondedAt: now, updatedAt: now })));
  }
  await partnerRef(p.id).update({ isOnline: online, updatedAt: new Date() });
  res.json({ isOnline: online });
});

deliveryRouter.post("/location", async (req, res) => {
  res.json(await updateLocation(req.auth!.partnerId!, body(req, locationUpdateSchema)));
});

type AssignmentWithOrder = WithId<DeliveryAssignment> & { order: WithId<Order> };

async function withOrders(rows: WithId<DeliveryAssignment>[]): Promise<AssignmentWithOrder[]> {
  const orders = new Map((await getMany<Order>(C.orders, rows.map((r) => r.orderId))).map((o) => [o.id, o]));
  return rows.filter((r) => orders.has(r.orderId)).map((r) => ({ ...r, order: orders.get(r.orderId)! }));
}

async function serializeAssignment(a: AssignmentWithOrder) {
  const o = a.order;
  const store = await defaultStore();
  const addr = o.addressSnapshot as Record<string, string | null>;
  const revealCustomer = ["ACCEPTED", "AT_STORE", "PICKED_UP", "OUT_FOR_DELIVERY"].includes(a.status);
  const drop = o.deliveryLat != null && o.deliveryLng != null ? { lat: o.deliveryLat, lng: o.deliveryLng } : null;
  return {
    ...offerPayload(a, o, store),
    orderStatus: o.status,
    acceptedAt: a.respondedAt,
    pickedUpAt: a.pickedUpAt,
    deliveredAt: a.deliveredAt,
    items: o.items.map((i) => ({ productName: i.productName, variantLabel: i.variantLabel, quantity: i.quantity })),
    customer: revealCustomer
      ? {
          name: o.customerName, phone: o.customerPhone,
          address: [addr.line1, addr.line2, addr.landmark, `${addr.city} ${addr.pincode}`].filter(Boolean).join(", "),
          instructions: o.deliveryInstructions,
        }
      : null,
    navigation: {
      toStore: store ? googleMapsDirectionsUrl({ lat: store.lat, lng: store.lng }) : null,
      toCustomer: drop ? googleMapsDirectionsUrl(drop) : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${addr.line1}, ${addr.city} ${addr.pincode}`)}`,
    },
  };
}

const myAssignments = (partnerId: string, statuses: string[]) => getDocs<DeliveryAssignment>(assignments().where("partnerId", "==", partnerId).where("status", "in", statuses));

deliveryRouter.get("/offers", async (req, res) => {
  const now = new Date();
  const rows = (await myAssignments(req.auth!.partnerId!, ["OFFERED"])).filter((a) => a.offerExpiresAt && a.offerExpiresAt > now).sort((a, b) => +b.offeredAt - +a.offeredAt);
  res.json({ offers: await Promise.all((await withOrders(rows)).map(serializeAssignment)) });
});

deliveryRouter.get("/assignments/active", async (req, res) => {
  const rows = (await myAssignments(req.auth!.partnerId!, [...ACTIVE])).sort((a, b) => +a.offeredAt - +b.offeredAt);
  res.json({ assignments: await Promise.all((await withOrders(rows)).map(serializeAssignment)) });
});

deliveryRouter.get("/assignments/history", async (req, res) => {
  const { page, pageSize } = query(req, paginationSchema);
  const rows = (await myAssignments(req.auth!.partnerId!, ["DELIVERED", "CANCELLED", "REJECTED", "EXPIRED"])).sort((a, b) => +b.updatedAt - +a.updatedAt);
  const pg = pageOf(rows, page, pageSize);
  res.json({ items: await Promise.all((await withOrders(pg.items)).map(serializeAssignment)), meta: pg.meta });
});

async function reload(id: string, partnerId: string) {
  const a = await getDoc<DeliveryAssignment>(assignments().doc(id));
  if (!a || a.partnerId !== partnerId) throw notFound("Delivery");
  const [full] = await withOrders([a]);
  if (!full) throw notFound("Delivery");
  return serializeAssignment(full);
}

deliveryRouter.get("/assignments/:id", async (req, res) => {
  res.json({ assignment: await reload(param(req, "id"), req.auth!.partnerId!) });
});

deliveryRouter.post("/assignments/:id/accept", async (req, res) => {
  const a = await respondToOffer(req.auth!.partnerId!, param(req, "id"), true);
  res.json({ assignment: await reload(a.id, req.auth!.partnerId!) });
});

deliveryRouter.post("/assignments/:id/reject", async (req, res) => {
  const { reason } = body(req, z.object({ reason: z.string().trim().max(200).optional() }));
  const a = await respondToOffer(req.auth!.partnerId!, param(req, "id"), false, reason);
  res.json({ assignment: { id: a.id, status: a.status } });
});

for (const step of ["arrived", "pickup", "start"] as const) {
  deliveryRouter.post(`/assignments/:id/${step}`, async (req, res) => {
    const a = await advanceAssignment(req.auth!.partnerId!, param(req, "id"), step);
    res.json({ assignment: await reload(a.id, req.auth!.partnerId!) });
  });
}

deliveryRouter.post("/assignments/:id/deliver", authLimiter, async (req, res) => {
  const { otp, codCollected } = body(req, deliveryOtpSchema);
  const a = await completeDelivery(req.auth!.partnerId!, param(req, "id"), otp, codCollected);
  res.json({ assignment: await reload(a.id, req.auth!.partnerId!) });
});

deliveryRouter.get("/earnings", async (req, res) => {
  const { page, pageSize } = query(req, paginationSchema);
  const partnerId = req.auth!.partnerId!;
  const [summary, all] = await Promise.all([
    earningsSummary(partnerId),
    getDocs<PartnerEarning>(db.collection(C.earnings).where("partnerId", "==", partnerId).orderBy("createdAt", "desc").limit(500)),
  ]);
  const pg = pageOf(all, page, pageSize);
  res.json({ summary, items: pg.items, meta: pg.meta });
});
