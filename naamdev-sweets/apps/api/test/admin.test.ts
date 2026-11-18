import { describe, expect, it } from "vitest";
import { C, countOf, db, FieldValue, getDoc, getDocs, type Category, type InventoryBatch } from "@naamdev/db";
import { inventoryOf, loginAs, newCustomer, variantBySlug } from "./helpers";

describe("admin permissions & management", () => {
  it("denies customers access to admin APIs", async () => {
    const { c } = await newCustomer();
    expect((await c.get("/api/v1/admin/dashboard")).status).toBe(403);
  });

  it("enforces role permissions per endpoint", async () => {
    const support = await loginAs("support@naamdevsweets.local");
    expect((await support.get("/api/v1/admin/people/tickets")).status).toBe(200);
    expect((await support.post("/api/v1/admin/inventory/adjust", {})).status).toBe(403);
    expect((await support.put("/api/v1/admin/settings/checkout", {})).status).toBe(403);
    const inventory = await loginAs("inventory@naamdevsweets.local");
    expect((await inventory.get("/api/v1/admin/inventory/stock")).status).toBe(200);
    expect((await inventory.get("/api/v1/admin/orders")).status).toBe(403);
    const owner = await loginAs("owner@naamdevsweets.local");
    expect((await owner.post("/api/v1/admin/people/roles", { name: "Night Shift", permissions: ["orders.view"] })).status).toBe(403);
    const admin = await loginAs("admin@naamdevsweets.local");
    const role = await admin.post("/api/v1/admin/people/roles", { name: "Night Shift", permissions: ["orders.view", "orders.process"] });
    expect(role.status).toBe(201);
  });

  it("returns dashboard analytics; money hidden without analytics permission", async () => {
    const owner = await loginAs("owner@naamdevsweets.local");
    const d = await owner.get("/api/v1/admin/dashboard");
    expect(d.status).toBe(200);
    expect(d.body.revenue).not.toBeNull();
    expect(d.body.charts.daily).toHaveLength(30);
    const support = await loginAs("support@naamdevsweets.local");
    const s = await support.get("/api/v1/admin/dashboard");
    expect(s.body.revenue).toBeNull();
  });

  it("exports reports as CSV", async () => {
    const owner = await loginAs("owner@naamdevsweets.local");
    const r = await owner.get("/api/v1/admin/reports/inventory?format=csv");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toMatch(/text\/csv/);
    expect(r.text.split("\n")[0]).toContain("product,variant,sku,available");
  });

  it("creates a product with unlimited variants and archives it", async () => {
    const mgr = await loginAs("manager@naamdevsweets.local");
    const [cat] = await getDocs<Category>(db.collection(C.categories).where("slug", "==", "barfi"));
    expect(cat).toBeTruthy();
    const r = await mgr.post("/api/v1/admin/catalog/products", {
      name: "Gulkand Barfi", shortDescription: "Rose petal jam barfi", description: "Delicate barfi layered with gulkand.", categoryId: cat!.id, sku: "ND-GKB-901",
      ingredients: "Khoya, gulkand, sugar", allergens: ["Milk"], shelfLifeDays: 7, storageInstructions: "Refrigerate", images: [{ url: "/static/catalog/coconut-barfi.svg" }],
      variants: [250, 500, 750, 1000, 1500].map((g, i) => ({ label: `${g} g`, weightGrams: g, sku: `ND-GKB-901-${i}`, mrpPaise: g * 80, salePricePaise: g * 75, lowStockThreshold: 5 })),
    });
    expect(r.status).toBe(201);
    expect(r.body.product.variants).toHaveLength(5);
    const bad = await mgr.post("/api/v1/admin/catalog/products", { ...r.body.product, variants: [{ label: "x", sku: "Z-1", mrpPaise: 100, salePricePaise: 200 }] });
    expect(bad.status).toBe(400);
    const arch = await mgr.post(`/api/v1/admin/catalog/products/${r.body.product.id}/archive`);
    expect(arch.status).toBe(200);
    const pub = await mgr.get(`/api/v1/catalog/products/${r.body.product.slug}`);
    expect(pub.status).toBe(404);
    expect(await countOf(db.collection(C.auditLogs).where("entityId", "==", r.body.product.id))).toBeGreaterThanOrEqual(2);
  });

  it("manages inventory: batches, damaged stock and history", async () => {
    const inv = await loginAs("inventory@naamdevsweets.local");
    const v = await variantBySlug("mysore-pak", 0);
    const before = await inventoryOf(v.id);
    const b = await inv.post("/api/v1/admin/inventory/batches", { variantId: v.id, batchNumber: `T-${Date.now()}`, quantity: 30, manufacturedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 10 * 86_400_000).toISOString(), costPricePaise: 9000 });
    expect(b.status).toBe(201);
    expect((await inventoryOf(v.id)).available).toBe(before.available + 30);
    const dmg = await inv.post("/api/v1/admin/inventory/adjust", { variantId: v.id, type: "DAMAGED", quantity: -3, reason: "Crushed box" });
    expect(dmg.status).toBe(200);
    expect((await inventoryOf(v.id)).available).toBe(before.available + 27);
    const hist = await inv.get(`/api/v1/admin/inventory/variants/${v.id}`);
    expect(hist.body.history[0].type).toBe("DAMAGED");
    const expired = await inv.post("/api/v1/admin/inventory/batches", { variantId: v.id, batchNumber: `OLD-${Date.now()}`, quantity: 5, manufacturedAt: new Date(Date.now() - 20 * 86_400_000).toISOString(), expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    expect(expired.status).toBe(400);
  });

  it("auto-expires batches at the sale cutoff so they can't be sold", async () => {
    const { expireBatches } = await import("../src/modules/inventory/service");
    const v = await variantBySlug("jalebi", 0);
    // A batch that slipped past validation (e.g. imported) and is now inside the sale cutoff.
    const now = new Date();
    const batch = db.collection(C.batches).doc();
    await batch.set({
      variantId: v.id, productId: (await inventoryOf(v.id)).productId, batchNumber: `EXP-${Date.now()}`, supplierId: null, manufacturedAt: new Date(Date.now() - 86_400_000),
      expiresAt: new Date(Date.now() + 3600_000), quantity: 4, remaining: 4, costPricePaise: 0, status: "ACTIVE", expiryAlertedAt: null, createdAt: now, updatedAt: now,
    } satisfies InventoryBatch);
    await db.collection(C.inventory).doc(v.id).update({ available: FieldValue.increment(4) });
    const before = await inventoryOf(v.id);
    await expireBatches();
    expect((await getDoc<InventoryBatch>(batch))!.status).toBe("EXPIRED");
    expect((await inventoryOf(v.id)).available).toBe(before.available - 4);
  });

  it("validates and saves business settings", async () => {
    const admin = await loginAs("admin@naamdevsweets.local");
    const cur = (await admin.get("/api/v1/admin/settings")).body.settings.returns;
    const ok = await admin.put("/api/v1/admin/settings/returns", { ...cur, windowHours: 36 });
    expect(ok.body.value.windowHours).toBe(36);
    const bad = await admin.put("/api/v1/admin/settings/returns", { enabled: "yes" });
    expect(bad.status).toBe(400);
    await admin.put("/api/v1/admin/settings/returns", cur);
  });

  it("supports the customer support ticket loop", async () => {
    const { c } = await newCustomer();
    const t = await c.post("/api/v1/support/tickets", { subject: "Where is my order?", category: "DELIVERY", message: "It has been an hour, please help." });
    expect(t.status).toBe(201);
    expect(t.body.ticket.priority).toBe("HIGH");
    const agent = await loginAs("support@naamdevsweets.local");
    await agent.post(`/api/v1/admin/people/tickets/${t.body.ticket.id}/messages`, { body: "Internal: checking with rider", isInternal: true });
    await agent.post(`/api/v1/admin/people/tickets/${t.body.ticket.id}/messages`, { body: "Your order is 5 minutes away!" });
    const view = await c.get(`/api/v1/support/tickets/${t.body.ticket.id}`);
    expect(view.body.ticket.messages).toHaveLength(2); // internal note hidden from customer
    expect(view.body.ticket.status).toBe("AWAITING_CUSTOMER");
  });
});
