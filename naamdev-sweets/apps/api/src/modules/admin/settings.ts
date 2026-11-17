import { Router } from "express";
import { z } from "zod";
import { prisma, type Prisma } from "@naamdev/db";
import { DEFAULT_SETTINGS, deliveryZoneSchema, paginationSchema, type SettingKey } from "@naamdev/shared";
import { integrations, env } from "../../config/env";
import { audit } from "../../lib/audit";
import { badRequest, notFound } from "../../lib/errors";
import { body, pageMeta, paginate, param, query } from "../../lib/http";
import { getSetting, setSetting } from "../../lib/settings";
import { requirePermission, requireStaff } from "../../middleware/auth";

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
  announcement: z.object({ active: z.boolean(), text: z.string().max(160), textHi: z.string().max(160).optional(), link: z.string().max(300).optional() }),
  notifications: z.object({ adminAlertEmails: z.array(z.string().email()).max(10), lowStockAlerts: z.boolean(), expiryAlertDays: z.number().int().min(0).max(30) }),
};

adminSettingsRouter.get("/settings", requirePermission("settings.manage"), async (_req, res) => {
  const keys = Object.keys(DEFAULT_SETTINGS) as SettingKey[];
  const values = Object.fromEntries(await Promise.all(keys.map(async (k) => [k, await getSetting(k)])));
  res.json({ settings: values, integrations: { ...integrations, razorpayMode: env.RAZORPAY_KEY_ID?.startsWith("rzp_live") ? "live" : env.RAZORPAY_KEY_ID ? "test" : null, emailProvider: env.EMAIL_PROVIDER, smsProvider: env.SMS_PROVIDER } });
});

adminSettingsRouter.put("/settings/:key", requirePermission("settings.manage"), async (req, res) => {
  const key = param(req, "key") as SettingKey;
  const schema = SETTING_SCHEMAS[key];
  if (!schema) throw badRequest("Unknown setting");
  const value = body(req, schema);
  await setSetting(key, value, req.auth!.user.id);
  await audit(req, "settings.update", "Setting", key, value);
  res.json({ key, value: await getSetting(key) });
});

// ── Store ──
adminSettingsRouter.get("/store", requireStaff, async (_req, res) => {
  res.json({ store: await prisma.store.findFirst({ where: { isDefault: true } }) });
});

adminSettingsRouter.put("/store", requirePermission("settings.manage"), async (req, res) => {
  const input = body(req, z.object({
    name: z.string().min(2).max(120), addressLine: z.string().min(3).max(200), city: z.string().min(2).max(60), state: z.string().min(2).max(60),
    pincode: z.string().regex(/^[1-9]\d{5}$/), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), phone: z.string().min(6).max(20),
    email: z.string().email().optional().nullable(), openingTime: z.string().regex(/^\d{2}:\d{2}$/), closingTime: z.string().regex(/^\d{2}:\d{2}$/), isActive: z.boolean(),
  }));
  const store = await prisma.store.findFirst({ where: { isDefault: true } });
  if (!store) throw notFound("Store");
  const updated = await prisma.store.update({ where: { id: store.id }, data: input });
  await audit(req, "store.update", "Store", store.id, input);
  res.json({ store: updated });
});

// ── Delivery zones ──
adminSettingsRouter.get("/zones", requireStaff, async (_req, res) => {
  res.json({ zones: await prisma.deliveryZone.findMany({ orderBy: { pincode: "asc" } }) });
});
adminSettingsRouter.post("/zones", requirePermission("settings.manage"), async (req, res) => {
  const z1 = await prisma.deliveryZone.create({ data: body(req, deliveryZoneSchema) });
  await audit(req, "zone.create", "DeliveryZone", z1.id, { pincode: z1.pincode });
  res.status(201).json({ zone: z1 });
});
adminSettingsRouter.put("/zones/:id", requirePermission("settings.manage"), async (req, res) => {
  const z1 = await prisma.deliveryZone.update({ where: { id: param(req, "id") }, data: body(req, deliveryZoneSchema) });
  await audit(req, "zone.update", "DeliveryZone", z1.id);
  res.json({ zone: z1 });
});
adminSettingsRouter.delete("/zones/:id", requirePermission("settings.manage"), async (req, res) => {
  await prisma.deliveryZone.delete({ where: { id: param(req, "id") } });
  await audit(req, "zone.delete", "DeliveryZone", param(req, "id"));
  res.json({ ok: true });
});

// ── Audit & notification logs ──
adminSettingsRouter.get("/audit", requirePermission("audit.view"), async (req, res) => {
  const q = query(req, paginationSchema.extend({ entity: z.string().optional(), action: z.string().optional(), actorId: z.string().optional() }));
  const where: Prisma.AuditLogWhereInput = { ...(q.entity ? { entity: q.entity } : {}), ...(q.action ? { action: { contains: q.action } } : {}), ...(q.actorId ? { actorId: q.actorId } : {}) };
  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, include: { actor: { select: { name: true, email: true } } }, ...paginate(q.page, q.pageSize) }),
  ]);
  res.json({ items, meta: pageMeta(total, q.page, q.pageSize) });
});

adminSettingsRouter.get("/notification-logs", requirePermission("settings.manage"), async (req, res) => {
  const { page, pageSize } = query(req, paginationSchema);
  const [total, items] = await Promise.all([prisma.notificationDelivery.count(), prisma.notificationDelivery.findMany({ orderBy: { createdAt: "desc" }, ...paginate(page, pageSize) })]);
  res.json({ items, meta: pageMeta(total, page, pageSize) });
});

// ── Staff's own in-app notifications ──
adminSettingsRouter.get("/me/notifications", requireStaff, async (req, res) => {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: req.auth!.user.id }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.notification.count({ where: { userId: req.auth!.user.id, readAt: null } }),
  ]);
  res.json({ items, unread });
});
adminSettingsRouter.post("/me/notifications/read", requireStaff, async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.auth!.user.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true });
});
