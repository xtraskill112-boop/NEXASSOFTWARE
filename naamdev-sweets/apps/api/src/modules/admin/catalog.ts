import { Router } from "express";
import { z } from "zod";
import { prisma, type Prisma } from "@naamdev/db";
import { categoryInputSchema, collectionInputSchema, paginationSchema, productInputSchema, sellingPrice, slugify, type ProductInput } from "@naamdev/shared";
import { audit } from "../../lib/audit";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { body, pageMeta, paginate, param, query } from "../../lib/http";
import { requireAnyPermission, requirePermission } from "../../middleware/auth";

export const adminCatalogRouter = Router();

const productAdminInclude = {
  images: { orderBy: { sortOrder: "asc" } },
  category: { select: { id: true, name: true, slug: true } },
  subcategory: { select: { id: true, name: true } },
  variants: { orderBy: { sortOrder: "asc" }, include: { inventory: true } },
} satisfies Prisma.ProductInclude;

adminCatalogRouter.get("/products", requireAnyPermission("products.view", "inventory.view"), async (req, res) => {
  const q = query(req, paginationSchema.extend({
    q: z.string().trim().max(60).optional(),
    categoryId: z.string().optional(),
    status: z.enum(["active", "inactive", "archived", "all"]).default("all"),
    stock: z.enum(["low", "out", "all"]).default("all"),
  }));
  const where: Prisma.ProductWhereInput = {};
  if (q.status === "archived") where.deletedAt = { not: null };
  else {
    where.deletedAt = null;
    if (q.status === "active") where.isActive = true;
    if (q.status === "inactive") where.isActive = false;
  }
  if (q.categoryId) where.categoryId = q.categoryId;
  if (q.q) where.OR = [{ name: { contains: q.q, mode: "insensitive" } }, { sku: { contains: q.q, mode: "insensitive" } }, { variants: { some: { sku: { contains: q.q, mode: "insensitive" } } } }];
  if (q.stock === "out") where.variants = { some: { isActive: true, inventory: { available: { lte: 0 } } } };
  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({ where, include: productAdminInclude, orderBy: { updatedAt: "desc" }, ...paginate(q.page, q.pageSize) }),
  ]);
  let items = rows.map((p) => ({
    id: p.id, name: p.name, slug: p.slug, sku: p.sku, image: p.images[0]?.url ?? null, category: p.category, isActive: p.isActive, deletedAt: p.deletedAt,
    isFeatured: p.isFeatured, isBestseller: p.isBestseller, isNewArrival: p.isNewArrival, avgRating: p.avgRating, reviewCount: p.reviewCount, soldCount: p.soldCount,
    variants: p.variants.map((v) => ({ id: v.id, label: v.label, sku: v.sku, pricePaise: sellingPrice(v), mrpPaise: v.mrpPaise, available: v.inventory?.available ?? 0, reserved: v.inventory?.reserved ?? 0, lowStockThreshold: v.inventory?.lowStockThreshold ?? 0, isActive: v.isActive })),
    totalStock: p.variants.reduce((s, v) => s + (v.inventory?.available ?? 0), 0),
    lowStock: p.variants.some((v) => v.isActive && (v.inventory?.available ?? 0) <= (v.inventory?.lowStockThreshold ?? 0)),
  }));
  if (q.stock === "low") items = items.filter((i) => i.lowStock);
  res.json({ items, meta: pageMeta(total, q.page, q.pageSize) });
});

adminCatalogRouter.get("/products/:id", requireAnyPermission("products.view", "inventory.view"), async (req, res) => {
  const p = await prisma.product.findUnique({ where: { id: param(req, "id") }, include: { ...productAdminInclude, collections: { select: { collectionId: true } } } });
  if (!p) throw notFound("Product");
  res.json({ product: p });
});

async function uniqueSlug(base: string, excludeId?: string) {
  let slug = slugify(base) || "product";
  let n = 1;
  while (await prisma.product.findFirst({ where: { slug, id: excludeId ? { not: excludeId } : undefined } })) slug = `${slugify(base)}-${++n}`;
  return slug;
}

function productData(input: ProductInput) {
  const { images: _i, variants: _v, slug: _s, nutrition, ...rest } = input;
  return { ...rest, nutrition: nutrition ?? undefined };
}

function assertVariants(input: ProductInput) {
  const skus = input.variants.map((v) => v.sku.toUpperCase());
  if (new Set(skus).size !== skus.length) throw badRequest("Each variant needs a unique SKU.");
  if (input.variants.filter((v) => v.isDefault).length > 1) throw badRequest("Only one variant can be the default.");
}

adminCatalogRouter.post("/products", requirePermission("products.manage"), async (req, res) => {
  const input = body(req, productInputSchema);
  assertVariants(input);
  const slug = input.slug ? await uniqueSlug(input.slug) : await uniqueSlug(input.name);
  const product = await prisma.$transaction(async (tx) => {
    const p = await tx.product.create({
      data: {
        ...productData(input),
        slug,
        images: { create: input.images.map((im, i) => ({ url: im.url, alt: im.alt ?? input.name, publicId: im.publicId, sortOrder: i })) },
      },
    });
    for (const [i, v] of input.variants.entries()) {
      const { lowStockThreshold, id: _id, ...vd } = v;
      await tx.productVariant.create({ data: { ...vd, productId: p.id, sortOrder: i, isDefault: v.isDefault || (i === 0 && !input.variants.some((x) => x.isDefault)), inventory: { create: { lowStockThreshold } } } });
    }
    return p;
  });
  await audit(req, "product.create", "Product", product.id, { name: product.name });
  res.status(201).json({ product: await prisma.product.findUnique({ where: { id: product.id }, include: productAdminInclude }) });
});

adminCatalogRouter.put("/products/:id", requirePermission("products.manage"), async (req, res) => {
  const id = param(req, "id");
  const input = body(req, productInputSchema);
  assertVariants(input);
  const existing = await prisma.product.findUnique({ where: { id }, include: { variants: true } });
  if (!existing) throw notFound("Product");
  const slug = input.slug && input.slug !== existing.slug ? await uniqueSlug(input.slug, id) : existing.slug;
  await prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id }, data: { ...productData(input), slug } });
    await tx.productImage.deleteMany({ where: { productId: id } });
    await tx.productImage.createMany({ data: input.images.map((im, i) => ({ productId: id, url: im.url, alt: im.alt ?? input.name, publicId: im.publicId, sortOrder: i })) });
    const keep = new Set<string>();
    for (const [i, v] of input.variants.entries()) {
      const { lowStockThreshold, id: vid, ...vd } = v;
      if (vid && existing.variants.some((x) => x.id === vid)) {
        await tx.productVariant.update({ where: { id: vid }, data: { ...vd, sortOrder: i } });
        await tx.inventory.upsert({ where: { variantId: vid }, update: { lowStockThreshold }, create: { variantId: vid, lowStockThreshold } });
        keep.add(vid);
      } else {
        const created = await tx.productVariant.create({ data: { ...vd, productId: id, sortOrder: i, inventory: { create: { lowStockThreshold } } } });
        keep.add(created.id);
      }
    }
    for (const old of existing.variants.filter((v) => !keep.has(v.id))) {
      const used = (await tx.orderItem.count({ where: { variantId: old.id } })) + (await tx.inventoryBatch.count({ where: { variantId: old.id } }));
      if (used) await tx.productVariant.update({ where: { id: old.id }, data: { isActive: false, isDefault: false } });
      else await tx.productVariant.delete({ where: { id: old.id } });
    }
    const defaults = await tx.productVariant.count({ where: { productId: id, isDefault: true, isActive: true } });
    if (!defaults) {
      const first = await tx.productVariant.findFirst({ where: { productId: id, isActive: true }, orderBy: { sortOrder: "asc" } });
      if (first) await tx.productVariant.update({ where: { id: first.id }, data: { isDefault: true } });
    }
  });
  await audit(req, "product.update", "Product", id, { name: input.name });
  res.json({ product: await prisma.product.findUnique({ where: { id }, include: productAdminInclude }) });
});

adminCatalogRouter.patch("/products/:id/flags", requirePermission("products.manage"), async (req, res) => {
  const data = body(req, z.object({ isActive: z.boolean().optional(), isFeatured: z.boolean().optional(), isBestseller: z.boolean().optional(), isNewArrival: z.boolean().optional() }));
  const p = await prisma.product.update({ where: { id: param(req, "id") }, data });
  await audit(req, "product.flags", "Product", p.id, data);
  res.json({ product: p });
});

adminCatalogRouter.post("/products/:id/archive", requirePermission("products.manage"), async (req, res) => {
  const p = await prisma.product.update({ where: { id: param(req, "id") }, data: { deletedAt: new Date(), isActive: false } });
  await prisma.cartItem.deleteMany({ where: { variant: { productId: p.id } } });
  await audit(req, "product.archive", "Product", p.id);
  res.json({ product: p });
});

adminCatalogRouter.post("/products/:id/restore", requirePermission("products.manage"), async (req, res) => {
  const p = await prisma.product.update({ where: { id: param(req, "id") }, data: { deletedAt: null } });
  await audit(req, "product.restore", "Product", p.id);
  res.json({ product: p });
});

// ── Categories ──
adminCatalogRouter.get("/categories", requireAnyPermission("products.view", "categories.manage", "content.manage", "coupons.manage"), async (_req, res) => {
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { products: { where: { deletedAt: null } } } }, parent: { select: { name: true } } } });
  res.json({ categories });
});

adminCatalogRouter.post("/categories", requirePermission("categories.manage"), async (req, res) => {
  const input = body(req, categoryInputSchema);
  const slug = slugify(input.slug ?? input.name);
  if (await prisma.category.findUnique({ where: { slug } })) throw conflict("A category with this slug already exists.");
  const c = await prisma.category.create({ data: { ...input, slug } });
  await audit(req, "category.create", "Category", c.id, { name: c.name });
  res.status(201).json({ category: c });
});

adminCatalogRouter.put("/categories/:id", requirePermission("categories.manage"), async (req, res) => {
  const input = body(req, categoryInputSchema);
  const id = param(req, "id");
  if (input.parentId === id) throw badRequest("A category can't be its own parent.");
  const c = await prisma.category.update({ where: { id }, data: { ...input, slug: input.slug ? slugify(input.slug) : undefined } });
  await audit(req, "category.update", "Category", id, { name: c.name });
  res.json({ category: c });
});

adminCatalogRouter.delete("/categories/:id", requirePermission("categories.manage"), async (req, res) => {
  const id = param(req, "id");
  const count = await prisma.product.count({ where: { categoryId: id } });
  if (count) throw conflict(`Move or archive the ${count} product(s) in this category first.`);
  await prisma.category.delete({ where: { id } });
  await audit(req, "category.delete", "Category", id);
  res.json({ ok: true });
});

// ── Collections ──
adminCatalogRouter.get("/collections", requireAnyPermission("categories.manage", "content.manage"), async (_req, res) => {
  const collections = await prisma.collection.findMany({ orderBy: { createdAt: "desc" }, include: { products: { orderBy: { sortOrder: "asc" }, select: { productId: true } } } });
  res.json({ collections: collections.map((c) => ({ ...c, productIds: c.products.map((p) => p.productId) })) });
});

async function saveCollection(id: string | null, input: z.infer<typeof collectionInputSchema>) {
  const { productIds, slug: s, ...data } = input;
  const slug = slugify(s ?? input.name);
  return prisma.$transaction(async (tx) => {
    const c = id ? await tx.collection.update({ where: { id }, data: { ...data, slug } }) : await tx.collection.create({ data: { ...data, slug } });
    await tx.collectionProduct.deleteMany({ where: { collectionId: c.id } });
    if (productIds.length) await tx.collectionProduct.createMany({ data: productIds.map((productId, i) => ({ collectionId: c.id, productId, sortOrder: i })) });
    return c;
  });
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
  await prisma.collection.delete({ where: { id: param(req, "id") } });
  await audit(req, "collection.delete", "Collection", param(req, "id"));
  res.json({ ok: true });
});
