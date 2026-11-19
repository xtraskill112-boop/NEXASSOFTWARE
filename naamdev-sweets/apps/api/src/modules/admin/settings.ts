import { Router } from "express";
import type { Query } from "firebase-admin/firestore";
import { z } from "zod";
import { C, db, getDoc, getDocs, runTx, SUB, type AuditLog, type DeliveryZone, type Notification, type NotificationDelivery, type Store } from "@naamdev/db";
import { DEFAULT_SETTINGS, deliveryZoneSchema, paginationSchema, type SettingKey } from "@naamdev/shared";
import { integrations, env } from "../../config/env";
import { audit } from "../../lib/audit";
import { clearCached } from "../../lib/cache";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { body, pageOf, pageQuery, param, query } from "../../lib/http";
import { getSetting, setSetting } from "../../lib/settings";
import { requirePermission, requireStaff } from "../../middleware/auth";
import { defaultStore } from "../catalog/service";

export const adminSettingsRouter = Router();

const paise = z.number().int().min(0).max(100_000_000);
const SETTING_SCHEMAS: Record<SettingKey, z.ZodTypeAny> = {
  checkout: z.object({
    minOrderPaise: paise, freeDeliveryThresholdPaise: paise, baseDeliveryFeePaise: paise, codEnabled: z.boolean(), codMaxOrderPaise: paise,
    onlinePaymentsEnabled: z.boolean(), pricesIncludeTax: z.boolean(), defaultGstRate: z.number().min(0).max(28),
    reservationMinutes: z.number().int().min(5).max(60), maxQtyPerItem: z.number().int().min(1).max(100), preparationMinutes: z.number().int().min(0).max(600),
  }),
  loyalty: z.object({
    enabled: z.boolean(), pointsPer100: z.number().int().min(0).max(100), pointValuePaise: z.number().int().min(0).max(1000), maxRedeemPercent: z.number().int().min(0).max(100),
    minRedeemPoints: z.number().int().min(0), signupBonus: z.number().int().min(0), referrerBonus: z.number().int().min(0), refereeBonus: z.number().int().min(0),
  }),
  delivery: z.object({
    partnerBaseFeePaise: paise, partnerPerKmPaise: paise, offerTimeoutSeconds: z.number().int().min(15).max(600), dailyIncentiveTarget: z.number().int().min(0).max(100),
    dailyIncentivePaise: paise, serviceRadiusKm: z.number().min(1).max(100), restrictToZones: z.boolean(),
  }),
  storeProfile: z.object({
    name: z.string().min(2).max(80), legalName: z.string().max(120), gstin: z.string().max(15), fssaiLicense: z.string().max(20), phone: z.string().max(20),
    whatsapp: z.string().max(20), email: z.string().max(120), supportHours: z.string().max(80), address: z.string().max(300),
  }),
  social: z.object({ instagram: z.string().url().optional().or(z.literal("")), facebook: z.string().url().optional().or(z.literal("")), youtube: z.string().url().optional().or(z.literal("")), x: z.string().url().optional().or(z.literal("")), whatsapp: z.string().max(40).optional() }),
  returns: z.object({ enabled: z.boolean(), windowHours: z.number().int().min(1).max(240) }),
  upi: z.object({
    enabled: z.boolean(),
    vpa: z.string().trim().regex(/^[\w.-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/, "Enter a valid UPI ID, e.g. shopname@paytm"),
    payeeName: z.string().trim().min(2).max(60),
    noteTemplate: z.string().trim().min(1).max(60),
    payWithinMinutes: z.number().int().min(10).max(1440),
  }),
  announcement: z.object({ active: z.boolean(), text: z.string().max(160), textHi: z.string().max(160).optional(), link: z.string().max(300).optional() }),
  notifications: z.object({ adminAlertEmails: z.array(z.string().email()).max(10), lowStockAlerts: z.boolean(), expiryAlertDays: z.number().int().min(0).max(30) }),
};

adminSettingsRouter.get("/settings", requirePermission("settings.manage"), async (_req, res) => {
  const keys = Object.keys(DEFAULT_SETTINGS) as SettingKey[];
  const values = Object.fromEntries(await Promise.all(keys.map(async (k) => [k, await getSetting(k)])));
  res.json({
    settings: values,
    integrations: { ...integrations, razorpayMode: env.RAZORPAY_KEY_ID?.startsWith("rzp_live") ? "live" : env.RAZORPAY_KEY_ID ? "test" : null, emailProvider: env.EMAIL_PROVIDER, smsProvider: env.SMS_PROVIDER },
  });
});

adminSettingsRouter.put("/settings/:key", requirePermission("settings.manage"), async (req, res) => {
  const key = param(req, "key") as SettingKey;
  const schema = SETTING_SCHEMAS[key];
  if (!schema) throw badRequest("Unknown setting");
  const value = body(req, schema);
  await setSetting(key, value, req.auth!.user.id);
  clearCached("home:");
  await audit(req, "settings.update", "Setting", key, value);
  res.json({ key, value: await getSetting(key) });
});

// ── Store ──
adminSettingsRouter.get("/store", requireStaff, async (_req, res) => {
  res.json({ store: await defaultStore() });
});

adminSettingsRouter.put("/store", requirePermission("settings.manage"), async (req, res) => {
  const input = body(req, z.object({
    name: z.string().min(2).max(120), addressLine: z.string().min(3).max(200), city: z.string().min(2).max(60), state: z.string().min(2).max(60),
    pincode: z.string().regex(/^[1-9]\d{5}$/), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), phone: z.string().min(6).max(20),
    email: z.string().email().optional().nullable(), openingTime: z.string().regex(/^\d{2}:\d{2}$/), closingTime: z.string().regex(/^\d{2}:\d{2}$/), isActive: z.boolean(),
  }));
  const store = await defaultStore();
  if (!store) throw notFound("Store");
  const patch = { ...input, email: input.email ?? null, updatedAt: new Date() };
  await db.collection(C.stores).doc(store.id).update(patch);
  clearCached("store:");
  await audit(req, "store.update", "Store", store.id, input);
  res.json({ store: { ...store, ...patch } });
});

// ── Delivery zones (document id = pincode) ──
const zones = () => db.collection(C.zones);
const zoneData = (input: z.infer<typeof deliveryZoneSchema>) => ({ ...input, deliveryFeePaise: input.deliveryFeePaise ?? null });

adminSettingsRouter.get("/zones", requireStaff, async (_req, res) => {
  const rows = (await getDocs<DeliveryZone>(zones())).sort((a, b) => a.pincode.localeCompare(b.pincode));
  res.json({ zones: rows });
});

adminSettingsRouter.post("/zones", requirePermission("settings.manage"), async (req, res) => {
  const input = body(req, deliveryZoneSchema);
  const now = new Date();
  const zone: DeliveryZone = { ...zoneData(input), createdAt: now, updatedAt: now };
  try {
    await zones().doc(input.pincode).create(zone);
  } catch (err) {
    if ((err as { code?: number }).code === 6) throw conflict("This pincode is already a delivery zone.");
    throw err;
  }
  await audit(req, "zone.create", "DeliveryZone", input.pincode, { pincode: input.pincode });
  res.status(201).json({ zone: { ...zone, id: input.pincode } });
});

adminSettingsRouter.put("/zones/:id", requirePermission("settings.manage"), async (req, res) => {
  const input = body(req, deliveryZoneSchema);
  const id = param(req, "id");
  const zone = await runTx(async (tx) => {
    const existing = await getDoc<DeliveryZone>(zones().doc(id), tx);
    if (!existing) throw notFound("Delivery zone");
    const next: DeliveryZone = { ...zoneData(input), createdAt: existing.createdAt, updatedAt: new Date() };
    if (input.pincode !== id) {
      // The pincode is the document id, so a changed pincode moves the zone.
      if ((await tx.get(zones().doc(input.pincode))).exists) throw conflict("This pincode is already a delivery zone.");
      tx.delete(zones().doc(id));
      tx.set(zones().doc(input.pincode), next);
    } else tx.set(zones().doc(id), next);
    return { ...next, id: input.pincode };
  });
  await audit(req, "zone.update", "DeliveryZone", zone.id);
  res.json({ zone });
});

adminSettingsRouter.delete("/zones/:id", requirePermission("settings.manage"), async (req, res) => {
  const ref = zones().doc(param(req, "id"));
  if (!(await ref.get()).exists) throw notFound("Delivery zone");
  await ref.delete();
  await audit(req, "zone.delete", "DeliveryZone", ref.id);
  res.json({ ok: true });
});

// ── Audit & notification logs ──
adminSettingsRouter.get("/audit", requirePermission("audit.view"), async (req, res) => {
  const q = query(req, paginationSchema.extend({ entity: z.string().optional(), action: z.string().optional(), actorId: z.string().optional() }));
  if (!q.action) {
    let ref: Query = db.collection(C.auditLogs);
    if (q.entity) ref = ref.where("entity", "==", q.entity);
    if (q.actorId) ref = ref.where("actorId", "==", q.actorId);
    const pg = await pageQuery<AuditLog>(ref.orderBy("createdAt", "desc"), q.page, q.pageSize);
    return res.json({ items: pg.items.map((a) => ({ ...a, actor: a.actorId ? { name: a.actorName } : null })), meta: pg.meta });
  }
  // Substring search on the action name: scan the most recent entries.
  const term = q.action.toLowerCase();
  const recent = await getDocs<AuditLog>(db.collection(C.auditLogs).orderBy("createdAt", "desc").limit(2000));
  const pg = pageOf(
    recent.filter((a) => a.action.toLowerCase().includes(term) && (!q.entity || a.entity === q.entity) && (!q.actorId || a.actorId === q.actorId)),
    q.page, q.pageSize,
  );
  res.json({ items: pg.items.map((a) => ({ ...a, actor: a.actorId ? { name: a.actorName } : null })), meta: pg.meta });
});

adminSettingsRouter.get("/notification-logs", requirePermission("settings.manage"), async (req, res) => {
  const { page, pageSize } = query(req, paginationSchema);
  res.json(await pageQuery<NotificationDelivery>(db.collection(C.notificationDeliveries).orderBy("createdAt", "desc"), page, pageSize));
});

// ── Staff's own in-app notifications ──
const myNotifications = (uid: string) => db.collection(C.users).doc(uid).collection(SUB.notifications);

adminSettingsRouter.get("/me/notifications", requireStaff, async (req, res) => {
  const col = myNotifications(req.auth!.user.id);
  const [items, unread] = await Promise.all([
    getDocs<Notification>(col.orderBy("createdAt", "desc").limit(30)),
    col.where("readAt", "==", null).count().get().then((s) => s.data().count),
  ]);
  res.json({ items, unread });
});

adminSettingsRouter.post("/me/notifications/read", requireStaff, async (req, res) => {
  const open = await myNotifications(req.auth!.user.id).where("readAt", "==", null).get();
  const now = new Date();
  for (let i = 0; i < open.docs.length; i += 400) {
    const batch = db.batch();
    open.docs.slice(i, i + 400).forEach((d) => batch.update(d.ref, { readAt: now }));
    await batch.commit();
  }
  res.json({ ok: true });
});
