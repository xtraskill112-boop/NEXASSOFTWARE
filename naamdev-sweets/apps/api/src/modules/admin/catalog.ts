import { Router } from "express";
import { z } from "zod";
import {
  C, db, getDoc, getDocs, newId, productDerived, runTx,
  type Category, type Collection, type Inventory, type Product, type ProductImage, type ProductVariant, type WithId,
} from "@naamdev/db";
import { categoryInputSchema, collectionInputSchema, paginationSchema, productInputSchema, sellingPrice, slugify, type ProductInput } from "@naamdev/shared";
import { audit } from "../../lib/audit";
import { clearCached } from "../../lib/cache";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { body, pageOf, param, query } from "../../lib/http";
import { requireAnyPermission, requirePermission } from "../../middleware/auth";
import { bumpCatalog, catalog } from "../catalog/cache";

export const adminCatalogRouter = Router();
const products = () => db.collection(C.products);
const categories = () => db.collection(C.categories);
const collections = () => db.collection(C.collections);

/** Admin view of a product: sorted images/variants, category refs and stock per variant. */
async function adminProduct(p: WithId<Product>) {
  const snap = await catalog();
  const inv = (await getDocs<Inventory>(db.collection(C.inventory).where("productId", "==", p.id))).reduce((m, i) => m.set(i.id, i), new Map<string, WithId<Inventory>>());
  const cat = snap.categoryById.get(p.categoryId);
  const sub = p.subcategoryId ? snap.categoryById.get(p.subcategoryId) : undefined;
  return {
    ...p,
    images: [...p.images].sort((a, b) => a.sortOrder - b.sortOrder),
    category: cat ? { id: cat.id, name: cat.name, slug: cat.slug } : null,
    subcategory: sub ? { id: sub.id, name: sub.name } : null,
    variants: [...p.variants].sort((a, b) => a.sortOrder - b.sortOrder).map((v) => ({ ...v, productId: p.id, inventory: inv.get(v.id) ?? null })),
  };
}

adminCatalogRouter.get("/products", requireAnyPermission("products.view", "inventory.view"), async (req, res) => {
  const q = query(req, paginationSchema.extend({
    q: z.string().trim().max(60).optional(),
    categoryId: z.string().optional(),
    status: z.enum(["active", "inactive", "archived", "all"]).default("all"),
    stock: z.enum(["low", "out", "all"]).default("all"),
  }));
  const snap = await catalog();
  const rows = q.status === "archived" ? await getDocs<Product>(products().where("deletedAt", "!=", null)) : snap.products;
  const term = q.q?.toLowerCase();
  let items = rows
    .filter((p) => (q.status === "active" ? p.isActive : q.status === "inactive" ? !p.isActive : true))
    .filter((p) => !q.categoryId || p.categoryId === q.categoryId)
    .filter((p) => !term || p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term) || p.variants.some((v) => v.sku.toLowerCase().includes(term)))
    .sort((a, b) => +b.updatedAt - +a.updatedAt)
    .map((p) => {
      const variants = [...p.variants].sort((a, b) => a.sortOrder - b.sortOrder).map((v) => {
        const i = snap.stock.get(v.id);
        return { id: v.id, label: v.label, sku: v.sku, pricePaise: sellingPrice(v), mrpPaise: v.mrpPaise, available: i?.available ?? 0, reserved: i?.reserved ?? 0, lowStockThreshold: i?.lowStockThreshold ?? 0, isActive: v.isActive };
      });
      const cat = snap.categoryById.get(p.categoryId);
      return {
        id: p.id, name: p.name, slug: p.slug, sku: p.sku, image: [...p.images].sort((a, b) => a.sortOrder - b.sortOrder)[0]?.url ?? null,
        category: cat ? { id: cat.id, name: cat.name, slug: cat.slug } : null, isActive: p.isActive, deletedAt: p.deletedAt,
        isFeatured: p.isFeatured, isBestseller: p.isBestseller, isNewArrival: p.isNewArrival, avgRating: p.avgRating, reviewCount: p.reviewCount, soldCount: p.soldCount,
        variants,
        totalStock: variants.reduce((s, v) => s + v.available, 0),
        lowStock: variants.some((v) => v.isActive && v.available <= v.lowStockThreshold),
        outOfStock: variants.some((v) => v.isActive && v.available <= 0),
      };
    });
  if (q.stock === "low") items = items.filter((i) => i.lowStock);
  if (q.stock === "out") items = items.filter((i) => i.outOfStock);
  res.json(pageOf(items, q.page, q.pageSize));
});

adminCatalogRouter.get("/products/:id", requireAnyPermission("products.view", "inventory.view"), async (req, res) => {
  const p = await getDoc<Product>(products().doc(param(req, "id")));
  if (!p) throw notFound("Product");
  const cols = (await getDocs<Collection>(collections())).filter((c) => c.products.some((x) => x.productId === p.id));
  res.json({ product: { ...(await adminProduct(p)), collections: cols.map((c) => ({ collectionId: c.id })) } });
});

async function uniqueSlug(base: string, excludeId?: string) {
  const root = slugify(base) || "product";
  let slug = root;
  let n = 1;
  for (;;) {
    const hit = (await products().where("slug", "==", slug).limit(2).get()).docs.filter((d) => d.id !== excludeId);
    if (!hit.length) return slug;
    slug = `${root}-${++n}`;
  }
}

function assertVariants(input: ProductInput) {
  const skus = input.variants.map((v) => v.sku.toUpperCase());
  if (new Set(skus).size !== skus.length) throw badRequest("Each variant needs a unique SKU.");
  if (input.variants.filter((v) => v.isDefault).length > 1) throw badRequest("Only one variant can be the default.");
}

function productFields(input: ProductInput) {
  const { images: _i, variants: _v, slug: _s, ...rest } = input;
  return {
    ...rest,
    nameHi: rest.nameHi ?? null, shortDescriptionHi: rest.shortDescriptionHi ?? null, subcategoryId: rest.subcategoryId ?? null,
    barcode: rest.barcode ?? null, hsnCode: rest.hsnCode ?? null, nutrition: rest.nutrition ?? null, manufacturingInfo: rest.manufacturingInfo ?? null,
    videoUrl: rest.videoUrl ?? null, gstRate: rest.gstRate ?? null, seoTitle: rest.seoTitle ?? null, seoDescription: rest.seoDescription ?? null,
  };
}

const images = (input: ProductInput): ProductImage[] =>
  input.images.map((im, i) => ({ id: newId(), url: im.url, alt: im.alt ?? input.name, publicId: im.publicId ?? null, width: null, height: null, sortOrder: i }));

/** Reserves SKUs for this product inside a transaction; fails if another product uses one. */
async function claimSkus(tx: FirebaseFirestore.Transaction, productId: string, entries: { sku: string; variantId: string | null }[]) {
  const refs = entries.map((e) => db.collection(C.skus).doc(e.sku.toUpperCase()));
  const snaps = await tx.getAll(...refs);
  snaps.forEach((s, i) => {
    if (s.exists && s.data()?.productId !== productId) throw conflict(`SKU ${entries[i]!.sku} is already used by another product.`, undefined, "DUPLICATE");
  });
  entries.forEach((e, i) => tx.set(refs[i]!, { productId, variantId: e.variantId }));
}

adminCatalogRouter.post("/products", requirePermission("products.manage"), async (req, res) => {
  const input = body(req, productInputSchema);
  assertVariants(input);
  const slug = await uniqueSlug(input.slug ?? input.name);
  const id = newId();
  const now = new Date();
  const variants: ProductVariant[] = input.variants.map((v, i) => ({
    id: newId(), label: v.label, weightGrams: v.weightGrams ?? null, sku: v.sku, barcode: v.barcode ?? null, mrpPaise: v.mrpPaise,
    salePricePaise: v.salePricePaise ?? null, isActive: v.isActive, isDefault: v.isDefault || (i === 0 && !input.variants.some((x) => x.isDefault)), sortOrder: i,
  }));
  await runTx(async (tx) => {
    await claimSkus(tx, id, [{ sku: input.sku, variantId: null }, ...variants.map((v) => ({ sku: v.sku, variantId: v.id }))]);
    const base = {
      ...productFields(input), slug, images: images(input), variants, avgRating: 0, reviewCount: 0, soldCount: 0, viewCount: 0, deletedAt: null, createdAt: now, updatedAt: now,
    };
    tx.set(products().doc(id), { ...base, ...productDerived(base) } satisfies Product);
    input.variants.forEach((v, i) =>
      tx.set(db.collection(C.inventory).doc(variants[i]!.id), {
        variantId: variants[i]!.id, productId: id, available: 0, reserved: 0, lowStockThreshold: v.lowStockThreshold, lastRestockedAt: null, lowStockAlertedAt: null, updatedAt: now,
      } satisfies Inventory),
    );
    bumpCatalog(["products", "stock"], tx);
  });
  clearCached("home:");
  await audit(req, "product.create", "Product", id, { name: input.name });
  res.status(201).json({ product: await adminProduct((await getDoc<Product>(products().doc(id)))!) });
});

adminCatalogRouter.put("/products/:id", requirePermission("products.manage"), async (req, res) => {
  const id = param(req, "id");
  const input = body(req, productInputSchema);
  assertVariants(input);
  const existing = await getDoc<Product>(products().doc(id));
  if (!existing) throw notFound("Product");
  const slug = input.slug && input.slug !== existing.slug ? await uniqueSlug(input.slug, id) : existing.slug;
  // Variants that left the form: delete if never stocked, otherwise deactivate (history must stay intact).
  const removed = existing.variants.filter((v) => !input.variants.some((x) => x.id === v.id));
  const used = new Set<string>();
  for (const v of removed) if (!(await db.collection(C.stockTransactions).where("variantId", "==", v.id).limit(1).get()).empty) used.add(v.id);

  await runTx(async (tx) => {
    const now = new Date();
    const next: ProductVariant[] = input.variants.map((v, i) => {
      const prev = v.id ? existing.variants.find((x) => x.id === v.id) : undefined;
      return {
        id: prev?.id ?? newId(), label: v.label, weightGrams: v.weightGrams ?? null, sku: v.sku, barcode: v.barcode ?? null, mrpPaise: v.mrpPaise,
        salePricePaise: v.salePricePaise ?? null, isActive: v.isActive, isDefault: v.isDefault, sortOrder: i,
      };
    });
    for (const v of removed) if (used.has(v.id)) next.push({ ...v, isActive: false, isDefault: false, sortOrder: next.length });
    if (!next.some((v) => v.isDefault && v.isActive)) {
      const first = next.find((v) => v.isActive);
      if (first) first.isDefault = true;
    }
    await claimSkus(tx, id, [{ sku: input.sku, variantId: null }, ...next.filter((v) => v.isActive || used.has(v.id)).map((v) => ({ sku: v.sku, variantId: v.id }))]);
    const invRefs = input.variants.map((_, i) => db.collection(C.inventory).doc(next[i]!.id));
    const invSnaps = await tx.getAll(...invRefs);
    // Free SKUs that are no longer used by this product.
    const keepSkus = new Set([input.sku, ...next.map((v) => v.sku)].map((s) => s.toUpperCase()));
    for (const old of [existing.sku, ...existing.variants.map((v) => v.sku)]) if (!keepSkus.has(old.toUpperCase())) tx.delete(db.collection(C.skus).doc(old.toUpperCase()));
    const base = { ...existing, ...productFields(input), slug, images: images(input), variants: next, updatedAt: now };
    const { id: _id, ...doc } = { ...base, ...productDerived(base) };
    tx.set(products().doc(id), doc);
    input.variants.forEach((v, i) => {
      const variantId = next[i]!.id;
      if (invSnaps[i]!.exists) tx.update(invRefs[i]!, { lowStockThreshold: v.lowStockThreshold, updatedAt: now });
      else
        tx.set(invRefs[i]!, {
          variantId, productId: id, available: 0, reserved: 0, lowStockThreshold: v.lowStockThreshold, lastRestockedAt: null, lowStockAlertedAt: null, updatedAt: now,
        } satisfies Inventory);
    });
    for (const v of removed.filter((x) => !used.has(x.id))) tx.delete(db.collection(C.inventory).doc(v.id));
    bumpCatalog(["products", "stock"], tx);
  });
  clearCached("home:");
  await audit(req, "product.update", "Product", id, { name: input.name });
  res.json({ product: await adminProduct((await getDoc<Product>(products().doc(id)))!) });
});

async function patchProduct(id: string, data: Partial<Product>) {
  const ref = products().doc(id);
  if (!(await ref.get()).exists) throw notFound("Product");
  await ref.update({ ...data, updatedAt: new Date() });
  bumpCatalog("products");
  clearCached("home:");
  return (await getDoc<Product>(ref))!;
}

adminCatalogRouter.patch("/products/:id/flags", requirePermission("products.manage"), async (req, res) => {
  const data = body(req, z.object({ isActive: z.boolean().optional(), isFeatured: z.boolean().optional(), isBestseller: z.boolean().optional(), isNewArrival: z.boolean().optional() }));
  const p = await patchProduct(param(req, "id"), data);
  await audit(req, "product.flags", "Product", p.id, data);
  res.json({ product: p });
});

adminCatalogRouter.post("/products/:id/archive", requirePermission("products.manage"), async (req, res) => {
  // Carts drop archived products automatically (they no longer resolve in the catalogue).
  const p = await patchProduct(param(req, "id"), { deletedAt: new Date(), isActive: false });
  await audit(req, "product.archive", "Product", p.id);
  res.json({ product: p });
});

adminCatalogRouter.post("/products/:id/restore", requirePermission("products.manage"), async (req, res) => {
  const p = await patchProduct(param(req, "id"), { deletedAt: null });
  await audit(req, "product.restore", "Product", p.id);
  res.json({ product: p });
});

// ── Categories ──
adminCatalogRouter.get("/categories", requireAnyPermission("products.view", "categories.manage", "content.manage", "coupons.manage"), async (_req, res) => {
  const snap = await catalog();
  const counts = new Map<string, number>();
  for (const p of snap.products) counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1);
  res.json({
    categories: snap.categories.map((c) => ({
      ...c,
      _count: { products: counts.get(c.id) ?? 0 },
      parent: c.parentId ? { name: snap.categoryById.get(c.parentId)?.name ?? "" } : null,
    })),
  });
});

async function slugTaken(slug: string, excludeId?: string) {
  return (await categories().where("slug", "==", slug).get()).docs.some((d) => d.id !== excludeId);
}

adminCatalogRouter.post("/categories", requirePermission("categories.manage"), async (req, res) => {
  const input = body(req, categoryInputSchema);
  const slug = slugify(input.slug ?? input.name);
  if (await slugTaken(slug)) throw conflict("A category with this slug already exists.");
  const now = new Date();
  const ref = categories().doc();
  const c: Category = {
    name: input.name, nameHi: input.nameHi ?? null, slug, description: input.description ?? null, imageUrl: input.imageUrl ?? null,
    accentColor: input.accentColor ?? null, parentId: input.parentId ?? null, sortOrder: input.sortOrder, isActive: input.isActive, gstRate: input.gstRate ?? null,
    createdAt: now, updatedAt: now,
  };
  await ref.set(c);
  bumpCatalog("products");
  clearCached("home:");
  await audit(req, "category.create", "Category", ref.id, { name: c.name });
  res.status(201).json({ category: { ...c, id: ref.id } });
});

adminCatalogRouter.put("/categories/:id", requirePermission("categories.manage"), async (req, res) => {
  const input = body(req, categoryInputSchema);
  const id = param(req, "id");
  if (input.parentId === id) throw badRequest("A category can't be its own parent.");
  const existing = await getDoc<Category>(categories().doc(id));
  if (!existing) throw notFound("Category");
  const slug = input.slug ? slugify(input.slug) : existing.slug;
  if (slug !== existing.slug && (await slugTaken(slug, id))) throw conflict("A category with this slug already exists.");
  const patch = {
    name: input.name, nameHi: input.nameHi ?? null, slug, description: input.description ?? null, imageUrl: input.imageUrl ?? existing.imageUrl,
    accentColor: input.accentColor ?? null, parentId: input.parentId ?? null, sortOrder: input.sortOrder, isActive: input.isActive, gstRate: input.gstRate ?? null, updatedAt: new Date(),
  };
  await categories().doc(id).update(patch);
  bumpCatalog("products");
  clearCached("home:");
  await audit(req, "category.update", "Category", id, { name: input.name });
  res.json({ category: { ...existing, ...patch } });
});

adminCatalogRouter.delete("/categories/:id", requirePermission("categories.manage"), async (req, res) => {
  const id = param(req, "id");
  const count = (await products().where("categoryId", "==", id).select().get()).size;
  if (count) throw conflict(`Move or archive the ${count} product(s) in this category first.`);
  await categories().doc(id).delete();
  bumpCatalog("products");
  clearCached("home:");
  await audit(req, "category.delete", "Category", id);
  res.json({ ok: true });
});

// ── Collections ──
adminCatalogRouter.get("/collections", requireAnyPermission("categories.manage", "content.manage"), async (_req, res) => {
  const rows = (await getDocs<Collection>(collections())).sort((a, b) => +b.createdAt - +a.createdAt);
  res.json({ collections: rows.map((c) => ({ ...c, productIds: [...c.products].sort((a, b) => a.sortOrder - b.sortOrder).map((p) => p.productId) })) });
});

async function saveCollection(id: string | null, input: z.infer<typeof collectionInputSchema>) {
  const { productIds, slug: s, ...data } = input;
  const slug = slugify(s ?? input.name);
  const dup = (await collections().where("slug", "==", slug).get()).docs.some((d) => d.id !== id);
  if (dup) throw conflict("A collection with this slug already exists.");
  const ref = id ? collections().doc(id) : collections().doc();
  const existing = id ? await getDoc<Collection>(ref) : null;
  if (id && !existing) throw notFound("Collection");
  const now = new Date();
  const doc = {
    ...data, nameHi: data.nameHi ?? null, description: data.description ?? null, slug,
    products: productIds.map((productId, i) => ({ productId, sortOrder: i })),
    createdAt: existing?.createdAt ?? now, updatedAt: now,
  };
  await ref.set(doc, { merge: true });
  clearCached("home:");
  return { ...existing, ...doc, id: ref.id };
}

adminCatalogRouter.post("/collections", requireAnyPermission("categories.manage", "content.manage"), async (req, res) => {
  const c = await saveCollection(null, body(req, collectionInputSchema));
  await audit(req, "collection.create", "Collection", c.id);
  res.status(201).json({ collection: c });
});

adminCatalogRouter.put("/collections/:id", requireAnyPermission("categories.manage", "content.manage"), async (req, res) => {
  const c = await saveCollection(param(req, "id"), body(req, collectionInputSchema));
  await audit(req, "collection.update", "Collection", c.id);
  res.json({ collection: c });
});

adminCatalogRouter.delete("/collections/:id", requireAnyPermission("categories.manage", "content.manage"), async (req, res) => {
  await collections().doc(param(req, "id")).delete();
  clearCached("home:");
  await audit(req, "collection.delete", "Collection", param(req, "id"));
  res.json({ ok: true });
});
