import { Router } from "express";
import { z } from "zod";
import {
  C, countOf, db, getDoc, getDocs, getMany, newId,
  type Inventory, type InventoryBatch, type Purchase, type PurchaseItem, type StockTransaction, type Supplier, type User, type WithId,
} from "@naamdev/db";
import { batchCreateSchema, paginationSchema, purchaseCreateSchema, stockAdjustSchema, supplierSchema } from "@naamdev/shared";
import { audit } from "../../lib/audit";
import { nextPurchaseNumber } from "../../lib/counters";
import { notFound } from "../../lib/errors";
import { body, pageOf, pageQuery, param, query } from "../../lib/http";
import { requirePermission } from "../../middleware/auth";
import { bumpCatalog, catalog } from "../catalog/cache";
import { sortedImages } from "../catalog/serializers";
import { adjustStock, createBatch, SALE_CUTOFF_HOURS, withStock } from "../inventory/service";

export const adminInventoryRouter = Router();
const batches = () => db.collection(C.batches);

async function supplierNames(ids: (string | null)[]) {
  return new Map((await getMany<Supplier>(C.suppliers, ids.filter((x): x is string => !!x))).map((s) => [s.id, s.name]));
}
async function userNames(ids: (string | null)[]) {
  return new Map((await getMany<User>(C.users, ids.filter((x): x is string => !!x))).map((u) => [u.id, u.name]));
}

adminInventoryRouter.get("/stock", requirePermission("inventory.view"), async (req, res) => {
  const q = query(req, paginationSchema.extend({ q: z.string().trim().max(60).optional(), filter: z.enum(["all", "low", "out"]).default("all"), categoryId: z.string().optional() }));
  const [snap, active] = await Promise.all([catalog(), getDocs<InventoryBatch>(batches().where("status", "==", "ACTIVE"))]);
  const term = q.q?.toLowerCase();
  const rows = snap.products
    .filter((p) => !q.categoryId || p.categoryId === q.categoryId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((p) => [...p.variants].sort((a, b) => a.sortOrder - b.sortOrder).map((v) => ({ p, v })))
    .filter(({ p, v }) => !term || v.sku.toLowerCase().includes(term) || p.name.toLowerCase().includes(term));
  let items = rows.map(({ p, v }) => {
    const inv = snap.stock.get(v.id);
    const vb = active.filter((b) => b.variantId === v.id).sort((a, b) => +a.expiresAt - +b.expiresAt);
    const available = inv?.available ?? 0;
    const threshold = inv?.lowStockThreshold ?? 0;
    return {
      variantId: v.id, productId: p.id, productName: p.name, image: sortedImages(p)[0]?.url ?? null, category: snap.categoryById.get(p.categoryId)?.name ?? "",
      label: v.label, sku: v.sku, isActive: v.isActive, available, reserved: inv?.reserved ?? 0, lowStockThreshold: threshold, lastRestockedAt: inv?.lastRestockedAt ?? null,
      activeBatches: vb.length, nextExpiry: vb[0]?.expiresAt ?? null,
      status: available <= 0 ? "OUT" : available <= threshold ? "LOW" : "OK",
    };
  });
  const summary = {
    variants: items.length,
    low: items.filter((i) => i.status === "LOW").length,
    out: items.filter((i) => i.status === "OUT").length,
    units: items.reduce((s, i) => s + i.available, 0),
    reserved: items.reduce((s, i) => s + i.reserved, 0),
  };
  if (q.filter === "low") items = items.filter((i) => i.status === "LOW");
  if (q.filter === "out") items = items.filter((i) => i.status === "OUT");
  res.json({ ...pageOf(items, q.page, q.pageSize), summary });
});

adminInventoryRouter.get("/variants/:variantId", requirePermission("inventory.view"), async (req, res) => {
  const snap = await catalog();
  const id = param(req, "variantId");
  const hit = snap.variants.get(id);
  if (!hit) throw notFound("Variant");
  const [inv, vb, history] = await Promise.all([
    getDoc<Inventory>(db.collection(C.inventory).doc(id)),
    getDocs<InventoryBatch>(batches().where("variantId", "==", id)),
    getDocs<StockTransaction>(db.collection(C.stockTransactions).where("variantId", "==", id).orderBy("createdAt", "desc").limit(100)),
  ]);
  vb.sort((a, b) => +a.expiresAt - +b.expiresAt);
  const [suppliers, users] = await Promise.all([supplierNames(vb.map((b) => b.supplierId)), userNames(history.map((h) => h.createdById))]);
  const batchNo = new Map(vb.map((b) => [b.id, b.batchNumber]));
  res.json({
    variant: {
      ...hit.variant, productId: hit.product.id, inventory: inv, product: { name: hit.product.name, shelfLifeDays: hit.product.shelfLifeDays },
      batches: vb.map((b) => ({ ...b, supplier: b.supplierId ? { name: suppliers.get(b.supplierId) ?? "" } : null })),
    },
    history: history.map((h) => ({ ...h, batch: h.batchId ? { batchNumber: batchNo.get(h.batchId) ?? "—" } : null, createdBy: h.createdById ? { name: users.get(h.createdById) ?? "" } : null })),
    saleCutoffHours: SALE_CUTOFF_HOURS,
  });
});

adminInventoryRouter.patch("/variants/:variantId/threshold", requirePermission("inventory.manage"), async (req, res) => {
  const { lowStockThreshold } = body(req, z.object({ lowStockThreshold: z.number().int().min(0).max(100000) }));
  const ref = db.collection(C.inventory).doc(param(req, "variantId"));
  if (!(await ref.get()).exists) throw notFound("Variant");
  await ref.update({ lowStockThreshold, updatedAt: new Date() });
  bumpCatalog("stock");
  res.json({ inventory: await getDoc<Inventory>(ref) });
});

adminInventoryRouter.post("/batches", requirePermission("inventory.manage"), async (req, res) => {
  const input = body(req, batchCreateSchema);
  const batch = await withStock((s) => createBatch(s, input, req.auth!.user.id, `Batch ${input.batchNumber} added`));
  await audit(req, "inventory.batch_create", "InventoryBatch", batch.id, { variantId: input.variantId, quantity: input.quantity });
  res.status(201).json({ batch });
});

adminInventoryRouter.post("/adjust", requirePermission("inventory.manage"), async (req, res) => {
  const input = body(req, stockAdjustSchema);
  await withStock((s) => adjustStock(s, input, req.auth!.user.id));
  await audit(req, "inventory.adjust", "ProductVariant", input.variantId, input);
  res.json({ inventory: await getDoc<Inventory>(db.collection(C.inventory).doc(input.variantId)) });
});

adminInventoryRouter.get("/batches/expiring", requirePermission("inventory.view"), async (req, res) => {
  const { days } = query(req, z.object({ days: z.coerce.number().int().min(0).max(60).default(3) }));
  const snap = await catalog();
  const [soon, expired] = await Promise.all([
    getDocs<InventoryBatch>(batches().where("status", "==", "ACTIVE").where("expiresAt", "<=", new Date(Date.now() + days * 86_400_000))),
    getDocs<InventoryBatch>(batches().where("status", "==", "EXPIRED").where("updatedAt", ">=", new Date(Date.now() - 7 * 86_400_000))),
  ]);
  const suppliers = await supplierNames(soon.map((b) => b.supplierId));
  const withVariant = (b: WithId<InventoryBatch>) => {
    const hit = snap.variants.get(b.variantId);
    return { ...b, variant: { id: b.variantId, label: hit?.variant.label ?? "", product: { name: hit?.product.name ?? "" } } };
  };
  res.json({
    expiring: soon.filter((b) => b.remaining > 0).sort((a, b) => +a.expiresAt - +b.expiresAt).map((b) => ({ ...withVariant(b), supplier: b.supplierId ? { name: suppliers.get(b.supplierId) ?? "" } : null })),
    recentlyExpired: expired.sort((a, b) => +b.expiresAt - +a.expiresAt).slice(0, 50).map(withVariant),
    saleCutoffHours: SALE_CUTOFF_HOURS,
  });
});

adminInventoryRouter.get("/transactions", requirePermission("inventory.view"), async (req, res) => {
  const q = query(req, paginationSchema.extend({ type: z.string().optional(), variantId: z.string().optional() }));
  let ref = db.collection(C.stockTransactions).orderBy("createdAt", "desc");
  if (q.variantId) ref = db.collection(C.stockTransactions).where("variantId", "==", q.variantId).orderBy("createdAt", "desc");
  const recent = await getDocs<StockTransaction>(ref.limit(2000));
  const pg = pageOf(recent.filter((t) => !q.type || t.type === q.type), q.page, q.pageSize);
  const snap = await catalog();
  const batchRows = await getMany<InventoryBatch>(C.batches, pg.items.map((t) => t.batchId ?? "").filter(Boolean));
  const batchNo = new Map(batchRows.map((b) => [b.id, b.batchNumber]));
  const users = await userNames(pg.items.map((t) => t.createdById));
  res.json({
    items: pg.items.map((t) => {
      const hit = snap.variants.get(t.variantId);
      return {
        ...t,
        variant: { id: t.variantId, label: hit?.variant.label ?? "", sku: hit?.variant.sku ?? "", product: { name: hit?.product.name ?? "" } },
        batch: t.batchId ? { batchNumber: batchNo.get(t.batchId) ?? "—" } : null,
        createdBy: t.createdById ? { name: users.get(t.createdById) ?? "" } : null,
      };
    }),
    meta: pg.meta,
  });
});

// ── Purchases ──
adminInventoryRouter.get("/purchases", requirePermission("inventory.view"), async (req, res) => {
  const { page, pageSize } = query(req, paginationSchema);
  const pg = await pageQuery<Purchase>(db.collection(C.purchases).orderBy("purchasedAt", "desc"), page, pageSize);
  const snap = await catalog();
  const [suppliers, users] = await Promise.all([supplierNames(pg.items.map((p) => p.supplierId)), userNames(pg.items.map((p) => p.createdById))]);
  res.json({
    items: pg.items.map((p) => ({
      ...p,
      supplier: p.supplierId ? { name: suppliers.get(p.supplierId) ?? "" } : null,
      createdBy: p.createdById ? { name: users.get(p.createdById) ?? "" } : null,
      items: p.items.map((i) => {
        const hit = snap.variants.get(i.variantId);
        return { ...i, variant: { id: i.variantId, label: hit?.variant.label ?? "", product: { name: hit?.product.name ?? "" } } };
      }),
    })),
    meta: pg.meta,
  });
});

adminInventoryRouter.post("/purchases", requirePermission("inventory.manage"), async (req, res) => {
  const input = body(req, purchaseCreateSchema);
  const purchase = await withStock(async (s) => {
    const purchaseNumber = await nextPurchaseNumber(s.tx);
    const ref = db.collection(C.purchases).doc();
    const items: PurchaseItem[] = [];
    for (const it of input.items) {
      const batch = await createBatch(
        s,
        { variantId: it.variantId, batchNumber: it.batchNumber, quantity: it.quantity, manufacturedAt: it.manufacturedAt, expiresAt: it.expiresAt, costPricePaise: it.costPricePaise, supplierId: input.supplierId },
        req.auth!.user.id,
        `Purchase ${purchaseNumber}`,
      );
      items.push({ id: newId(), variantId: it.variantId, productId: batch.productId, quantity: it.quantity, costPricePaise: it.costPricePaise, batchId: batch.id });
    }
    const p: Purchase = {
      purchaseNumber, supplierId: input.supplierId ?? null, invoiceNumber: input.invoiceNumber ?? null, purchasedAt: input.purchasedAt ?? new Date(),
      totalPaise: input.items.reduce((sum, i) => sum + i.costPricePaise * i.quantity, 0), notes: input.notes ?? null, createdById: req.auth!.user.id, items, createdAt: new Date(),
    };
    s.tx.set(ref, p);
    return { ...p, id: ref.id };
  });
  await audit(req, "inventory.purchase", "Purchase", purchase.id, { items: input.items.length });
  res.status(201).json({ purchase });
});

// ── Suppliers ──
adminInventoryRouter.get("/suppliers", requirePermission("inventory.view"), async (_req, res) => {
  const suppliers = (await getDocs<Supplier>(db.collection(C.suppliers))).sort((a, b) => a.name.localeCompare(b.name));
  const counted = await Promise.all(
    suppliers.map(async (s) => ({
      ...s,
      _count: {
        purchases: await countOf(db.collection(C.purchases).where("supplierId", "==", s.id)),
        batches: await countOf(batches().where("supplierId", "==", s.id)),
      },
    })),
  );
  res.json({ suppliers: counted });
});

adminInventoryRouter.post("/suppliers", requirePermission("suppliers.manage"), async (req, res) => {
  const input = body(req, supplierSchema);
  const now = new Date();
  const data: Supplier = {
    name: input.name, contactPerson: input.contactPerson ?? null, phone: input.phone ?? null, email: input.email ?? null, gstin: input.gstin ?? null,
    address: input.address ?? null, notes: input.notes ?? null, isActive: input.isActive ?? true, createdAt: now, updatedAt: now,
  };
  const ref = await db.collection(C.suppliers).add(data);
  await audit(req, "supplier.create", "Supplier", ref.id);
  res.status(201).json({ supplier: { ...data, id: ref.id } });
});

adminInventoryRouter.put("/suppliers/:id", requirePermission("suppliers.manage"), async (req, res) => {
  const ref = db.collection(C.suppliers).doc(param(req, "id"));
  const existing = await getDoc<Supplier>(ref);
  if (!existing) throw notFound("Supplier");
  const input = body(req, supplierSchema);
  const patch = { ...input, updatedAt: new Date() };
  await ref.update(patch);
  await audit(req, "supplier.update", "Supplier", ref.id);
  res.json({ supplier: { ...existing, ...patch } });
});
