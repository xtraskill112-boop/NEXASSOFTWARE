import { Router } from "express";
import { z } from "zod";
import { prisma, type Prisma } from "@naamdev/db";
import { batchCreateSchema, paginationSchema, purchaseCreateSchema, stockAdjustSchema, supplierSchema } from "@naamdev/shared";
import { audit } from "../../lib/audit";
import { nextPurchaseNumber } from "../../lib/counters";
import { notFound } from "../../lib/errors";
import { body, pageMeta, paginate, param, query } from "../../lib/http";
import { requirePermission } from "../../middleware/auth";
import { adjustStock, createBatch, SALE_CUTOFF_HOURS } from "../inventory/service";

export const adminInventoryRouter = Router();

adminInventoryRouter.get("/stock", requirePermission("inventory.view"), async (req, res) => {
  const q = query(req, paginationSchema.extend({ q: z.string().trim().max(60).optional(), filter: z.enum(["all", "low", "out"]).default("all"), categoryId: z.string().optional() }));
  const where: Prisma.ProductVariantWhereInput = { product: { deletedAt: null, ...(q.categoryId ? { categoryId: q.categoryId } : {}) } };
  if (q.q) where.OR = [{ sku: { contains: q.q, mode: "insensitive" } }, { product: { name: { contains: q.q, mode: "insensitive" } } }];
  const rows = await prisma.productVariant.findMany({
    where,
    include: { inventory: true, product: { select: { id: true, name: true, images: { take: 1 }, category: { select: { name: true } } } }, batches: { where: { status: "ACTIVE" }, orderBy: { expiresAt: "asc" } } },
    orderBy: [{ product: { name: "asc" } }, { sortOrder: "asc" }],
  });
  let items = rows.map((v) => ({
    variantId: v.id, productId: v.product.id, productName: v.product.name, image: v.product.images[0]?.url ?? null, category: v.product.category.name,
    label: v.label, sku: v.sku, isActive: v.isActive, available: v.inventory?.available ?? 0, reserved: v.inventory?.reserved ?? 0,
    lowStockThreshold: v.inventory?.lowStockThreshold ?? 0, lastRestockedAt: v.inventory?.lastRestockedAt ?? null,
    activeBatches: v.batches.length, nextExpiry: v.batches[0]?.expiresAt ?? null,
    status: (v.inventory?.available ?? 0) <= 0 ? "OUT" : (v.inventory?.available ?? 0) <= (v.inventory?.lowStockThreshold ?? 0) ? "LOW" : "OK",
  }));
  if (q.filter === "low") items = items.filter((i) => i.status === "LOW");
  if (q.filter === "out") items = items.filter((i) => i.status === "OUT");
  const total = items.length;
  const summary = {
    variants: rows.length,
    low: rows.filter((v) => (v.inventory?.available ?? 0) > 0 && (v.inventory?.available ?? 0) <= (v.inventory?.lowStockThreshold ?? 0)).length,
    out: rows.filter((v) => (v.inventory?.available ?? 0) <= 0).length,
    units: rows.reduce((s, v) => s + (v.inventory?.available ?? 0), 0),
    reserved: rows.reduce((s, v) => s + (v.inventory?.reserved ?? 0), 0),
  };
  const start = (q.page - 1) * q.pageSize;
  res.json({ items: items.slice(start, start + q.pageSize), meta: pageMeta(total, q.page, q.pageSize), summary });
});

adminInventoryRouter.get("/variants/:variantId", requirePermission("inventory.view"), async (req, res) => {
  const v = await prisma.productVariant.findUnique({
    where: { id: param(req, "variantId") },
    include: { inventory: true, product: { select: { name: true, shelfLifeDays: true } }, batches: { orderBy: { expiresAt: "asc" }, include: { supplier: { select: { name: true } } } } },
  });
  if (!v) throw notFound("Variant");
  const history = await prisma.stockTransaction.findMany({ where: { variantId: v.id }, orderBy: { createdAt: "desc" }, take: 100, include: { batch: { select: { batchNumber: true } }, createdBy: { select: { name: true } } } });
  res.json({ variant: v, history, saleCutoffHours: SALE_CUTOFF_HOURS });
});

adminInventoryRouter.patch("/variants/:variantId/threshold", requirePermission("inventory.manage"), async (req, res) => {
  const { lowStockThreshold } = body(req, z.object({ lowStockThreshold: z.number().int().min(0).max(100000) }));
  const inv = await prisma.inventory.upsert({ where: { variantId: param(req, "variantId") }, update: { lowStockThreshold }, create: { variantId: param(req, "variantId"), lowStockThreshold } });
  res.json({ inventory: inv });
});

adminInventoryRouter.post("/batches", requirePermission("inventory.manage"), async (req, res) => {
  const input = body(req, batchCreateSchema);
  const batch = await prisma.$transaction((tx) => createBatch(tx, input, req.auth!.user.id, `Batch ${input.batchNumber} added`));
  await audit(req, "inventory.batch_create", "InventoryBatch", batch.id, { variantId: input.variantId, quantity: input.quantity });
  res.status(201).json({ batch });
});

adminInventoryRouter.post("/adjust", requirePermission("inventory.manage"), async (req, res) => {
  const input = body(req, stockAdjustSchema);
  await prisma.$transaction((tx) => adjustStock(tx, input, req.auth!.user.id));
  await audit(req, "inventory.adjust", "ProductVariant", input.variantId, input);
  res.json({ inventory: await prisma.inventory.findUnique({ where: { variantId: input.variantId } }) });
});

adminInventoryRouter.get("/batches/expiring", requirePermission("inventory.view"), async (req, res) => {
  const { days } = query(req, z.object({ days: z.coerce.number().int().min(0).max(60).default(3) }));
  const batches = await prisma.inventoryBatch.findMany({
    where: { status: "ACTIVE", remaining: { gt: 0 }, expiresAt: { lte: new Date(Date.now() + days * 86_400_000) } },
    include: { variant: { include: { product: { select: { name: true } } } }, supplier: { select: { name: true } } },
    orderBy: { expiresAt: "asc" },
  });
  const expired = await prisma.inventoryBatch.findMany({
    where: { status: "EXPIRED", updatedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
    include: { variant: { include: { product: { select: { name: true } } } } },
    orderBy: { expiresAt: "desc" },
    take: 50,
  });
  res.json({ expiring: batches, recentlyExpired: expired, saleCutoffHours: SALE_CUTOFF_HOURS });
});

adminInventoryRouter.get("/transactions", requirePermission("inventory.view"), async (req, res) => {
  const q = query(req, paginationSchema.extend({ type: z.string().optional(), variantId: z.string().optional() }));
  const where: Prisma.StockTransactionWhereInput = { ...(q.type ? { type: q.type as never } : {}), ...(q.variantId ? { variantId: q.variantId } : {}) };
  const [total, items] = await Promise.all([
    prisma.stockTransaction.count({ where }),
    prisma.stockTransaction.findMany({ where, orderBy: { createdAt: "desc" }, include: { variant: { include: { product: { select: { name: true } } } }, batch: { select: { batchNumber: true } }, createdBy: { select: { name: true } } }, ...paginate(q.page, q.pageSize) }),
  ]);
  res.json({ items, meta: pageMeta(total, q.page, q.pageSize) });
});

// ── Purchases ──
adminInventoryRouter.get("/purchases", requirePermission("inventory.view"), async (req, res) => {
  const { page, pageSize } = query(req, paginationSchema);
  const [total, items] = await Promise.all([
    prisma.purchase.count(),
    prisma.purchase.findMany({ orderBy: { purchasedAt: "desc" }, include: { supplier: { select: { name: true } }, createdBy: { select: { name: true } }, items: { include: { variant: { include: { product: { select: { name: true } } } } } } }, ...paginate(page, pageSize) }),
  ]);
  res.json({ items, meta: pageMeta(total, page, pageSize) });
});

adminInventoryRouter.post("/purchases", requirePermission("inventory.manage"), async (req, res) => {
  const input = body(req, purchaseCreateSchema);
  const purchase = await prisma.$transaction(async (tx) => {
    const p = await tx.purchase.create({
      data: {
        purchaseNumber: await nextPurchaseNumber(tx), supplierId: input.supplierId ?? null, invoiceNumber: input.invoiceNumber, purchasedAt: input.purchasedAt ?? new Date(),
        notes: input.notes, createdById: req.auth!.user.id, totalPaise: input.items.reduce((s, i) => s + i.costPricePaise * i.quantity, 0),
      },
    });
    for (const it of input.items) {
      const batch = await createBatch(tx, { variantId: it.variantId, batchNumber: it.batchNumber, quantity: it.quantity, manufacturedAt: it.manufacturedAt, expiresAt: it.expiresAt, costPricePaise: it.costPricePaise, supplierId: input.supplierId }, req.auth!.user.id, `Purchase ${p.purchaseNumber}`);
      await tx.purchaseItem.create({ data: { purchaseId: p.id, variantId: it.variantId, quantity: it.quantity, costPricePaise: it.costPricePaise, batchId: batch.id } });
    }
    return p;
  });
  await audit(req, "inventory.purchase", "Purchase", purchase.id, { items: input.items.length });
  res.status(201).json({ purchase });
});

// ── Suppliers ──
adminInventoryRouter.get("/suppliers", requirePermission("inventory.view"), async (_req, res) => {
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { purchases: true, batches: true } } } });
  res.json({ suppliers });
});

adminInventoryRouter.post("/suppliers", requirePermission("suppliers.manage"), async (req, res) => {
  const s = await prisma.supplier.create({ data: body(req, supplierSchema) });
  await audit(req, "supplier.create", "Supplier", s.id);
  res.status(201).json({ supplier: s });
});

adminInventoryRouter.put("/suppliers/:id", requirePermission("suppliers.manage"), async (req, res) => {
  const s = await prisma.supplier.update({ where: { id: param(req, "id") }, data: body(req, supplierSchema) });
  await audit(req, "supplier.update", "Supplier", s.id);
  res.json({ supplier: s });
});
