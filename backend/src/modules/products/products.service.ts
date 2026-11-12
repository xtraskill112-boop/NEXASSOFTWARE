import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { AuditAction, writeAudit, type AuditContext } from '../../lib/audit';
import { paginated } from '../../lib/pagination';
import { money } from '../../lib/serialize';
import { applyStockIn, serializeMovement } from '../inventory/inventory.service';
import type { CreateProductInput, ListProductsQuery, UpdateProductInput } from './products.schemas';

export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export function stockStatus(totalStock: number, reorderLevel: number): StockStatus {
  if (totalStock <= 0) return 'OUT_OF_STOCK';
  if (totalStock <= reorderLevel) return 'LOW_STOCK';
  return 'IN_STOCK';
}

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  unit: string;
  unit_price: Prisma.Decimal;
  reorder_level: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  total_stock: number;
  stock_value: Prisma.Decimal;
  total_count: bigint;
}

const SORT_COLUMNS: Record<ListProductsQuery['sortBy'], string> = {
  name: 'p.name',
  sku: 'p.sku',
  category: 'p.category',
  unitPrice: 'p.unit_price',
  totalStock: 't.total_stock',
  stockValue: 't.stock_value',
  createdAt: 'p.created_at',
  updatedAt: 'p.updated_at',
};

async function stockByWarehouse(productIds: string[]) {
  if (productIds.length === 0) return new Map<string, { warehouseId: string; warehouseCode: string; warehouseName: string; quantity: number }[]>();
  const levels = await prisma.stockLevel.findMany({
    where: { productId: { in: productIds } },
    include: { warehouse: { select: { id: true, code: true, name: true } } },
    orderBy: { warehouse: { code: 'asc' } },
  });
  const map = new Map<string, { warehouseId: string; warehouseCode: string; warehouseName: string; quantity: number }[]>();
  for (const l of levels) {
    const list = map.get(l.productId) ?? [];
    list.push({ warehouseId: l.warehouse.id, warehouseCode: l.warehouse.code, warehouseName: l.warehouse.name, quantity: l.quantity });
    map.set(l.productId, list);
  }
  return map;
}

export async function listProducts(q: ListProductsQuery) {
  const conditions: Prisma.Sql[] = [];
  if (q.status === 'active') conditions.push(Prisma.sql`p.is_active = true`);
  if (q.status === 'inactive') conditions.push(Prisma.sql`p.is_active = false`);
  if (q.category) conditions.push(Prisma.sql`p.category = ${q.category}`);
  if (q.search) {
    const like = `%${q.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conditions.push(
      Prisma.sql`(p.name ILIKE ${like} OR p.sku ILIKE ${like} OR p.category ILIKE ${like} OR COALESCE(p.description, '') ILIKE ${like})`,
    );
  }
  if (q.stockStatus === 'out_of_stock') conditions.push(Prisma.sql`t.total_stock = 0`);
  if (q.stockStatus === 'low_stock') conditions.push(Prisma.sql`t.total_stock <= p.reorder_level`);
  if (q.stockStatus === 'in_stock') conditions.push(Prisma.sql`t.total_stock > p.reorder_level`);
  if (q.warehouseId) {
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM stock_levels s2 WHERE s2.product_id = p.id AND s2.warehouse_id = ${q.warehouseId}::uuid AND s2.quantity > 0)`,
    );
  }

  const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
  const orderBy = Prisma.raw(`${SORT_COLUMNS[q.sortBy]} ${q.sortOrder === 'desc' ? 'DESC' : 'ASC'}, p.sku ASC`);
  const offset = (q.page - 1) * q.pageSize;

  const rows = await prisma.$queryRaw<ProductRow[]>`
    WITH totals AS (
      SELECT p.id,
             COALESCE(SUM(sl.quantity), 0)::int AS total_stock,
             (COALESCE(SUM(sl.quantity), 0) * p.unit_price)::numeric(16,2) AS stock_value
        FROM products p
        LEFT JOIN stock_levels sl ON sl.product_id = p.id
       GROUP BY p.id
    )
    SELECT p.id, p.sku, p.name, p.description, p.category, p.unit, p.unit_price, p.reorder_level,
           p.is_active, p.created_at, p.updated_at, t.total_stock, t.stock_value,
           COUNT(*) OVER() AS total_count
      FROM products p
      JOIN totals t ON t.id = p.id
      ${where}
     ORDER BY ${orderBy}
     LIMIT ${q.pageSize} OFFSET ${offset}`;

  const total = rows.length ? Number(rows[0]!.total_count) : await countProducts(where);
  const byWarehouse = await stockByWarehouse(rows.map((r) => r.id));

  const items = rows.map((r) => ({
    id: r.id,
    sku: r.sku,
    name: r.name,
    description: r.description,
    category: r.category,
    unit: r.unit,
    unitPrice: money(r.unit_price),
    reorderLevel: r.reorder_level,
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    totalStock: r.total_stock,
    stockValue: money(r.stock_value),
    stockStatus: stockStatus(r.total_stock, r.reorder_level),
    stockByWarehouse: byWarehouse.get(r.id) ?? [],
  }));

  return paginated(items, total, q);
}

async function countProducts(where: Prisma.Sql) {
  // Only reached when the requested page is empty; keeps pagination metadata accurate.
  const [row] = await prisma.$queryRaw<{ count: bigint }[]>`
    WITH totals AS (
      SELECT p.id, COALESCE(SUM(sl.quantity), 0)::int AS total_stock
        FROM products p LEFT JOIN stock_levels sl ON sl.product_id = p.id GROUP BY p.id
    )
    SELECT COUNT(*) AS count FROM products p JOIN totals t ON t.id = p.id ${where}`;
  return Number(row?.count ?? 0);
}

export async function getProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      stockLevels: {
        include: { warehouse: { select: { id: true, code: true, name: true, city: true, isActive: true } } },
        orderBy: { warehouse: { code: 'asc' } },
      },
    },
  });
  if (!product) throw AppError.notFound('Product');

  const warehouses = await prisma.warehouse.findMany({ orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, city: true, isActive: true } });
  const levelByWarehouse = new Map(product.stockLevels.map((l) => [l.warehouseId, l]));
  const totalStock = product.stockLevels.reduce((sum, l) => sum + l.quantity, 0);

  const recentMovements = await prisma.stockMovement.findMany({
    where: { productId: id },
    include: {
      product: { select: { id: true, sku: true, name: true, unit: true, unitPrice: true } },
      fromWarehouse: { select: { id: true, code: true, name: true } },
      toWarehouse: { select: { id: true, code: true, name: true } },
      performedBy: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    category: product.category,
    unit: product.unit,
    unitPrice: money(product.unitPrice),
    reorderLevel: product.reorderLevel,
    isActive: product.isActive,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    totalStock,
    stockValue: money(Number(product.unitPrice) * totalStock),
    stockStatus: stockStatus(totalStock, product.reorderLevel),
    stockByWarehouse: warehouses
      .filter((w) => w.isActive || levelByWarehouse.has(w.id))
      .map((w) => ({
        warehouseId: w.id,
        warehouseCode: w.code,
        warehouseName: w.name,
        city: w.city,
        warehouseActive: w.isActive,
        quantity: levelByWarehouse.get(w.id)?.quantity ?? 0,
        updatedAt: levelByWarehouse.get(w.id)?.updatedAt ?? null,
      })),
    recentMovements: recentMovements.map(serializeMovement),
  };
}

export async function listCategories() {
  const rows = await prisma.product.groupBy({
    by: ['category'],
    _count: { _all: true },
    orderBy: { category: 'asc' },
  });
  return rows.map((r) => ({ name: r.category, productCount: r._count._all }));
}

export async function createProduct(input: CreateProductInput, ctx: AuditContext) {
  const existing = await prisma.product.findUnique({ where: { sku: input.sku }, select: { id: true } });
  if (existing) throw AppError.conflict(`A product with SKU ${input.sku} already exists`);

  const opening = input.openingStock ?? [];
  if (opening.length) {
    const warehouses = await prisma.warehouse.findMany({ where: { id: { in: opening.map((o) => o.warehouseId) } } });
    for (const o of opening) {
      const w = warehouses.find((x) => x.id === o.warehouseId);
      if (!w) throw AppError.badRequest('Opening stock references an unknown warehouse', [{ path: 'openingStock', message: 'Unknown warehouse' }]);
      if (!w.isActive) throw AppError.conflict(`Warehouse ${w.code} is inactive`);
    }
    if (!input.isActive) throw AppError.badRequest('Opening stock cannot be added to an inactive product');
  }

  const productId = await prisma.$transaction(
    async (tx) => {
      const product = await tx.product.create({
        data: {
          sku: input.sku,
          name: input.name,
          description: input.description ?? null,
          category: input.category,
          unit: input.unit,
          unitPrice: new Prisma.Decimal(input.unitPrice),
          reorderLevel: input.reorderLevel,
          isActive: input.isActive,
        },
      });

      await writeAudit(
        ctx,
        {
          action: AuditAction.PRODUCT_CREATED,
          entityType: 'Product',
          entityId: product.id,
          details: {
            sku: product.sku,
            name: product.name,
            category: product.category,
            unitPrice: input.unitPrice,
            reorderLevel: product.reorderLevel,
            openingStock: opening.map((o) => ({ warehouseId: o.warehouseId, quantity: o.quantity })),
          },
        },
        tx,
      );

      for (const o of opening) {
        const warehouse = await tx.warehouse.findUniqueOrThrow({ where: { id: o.warehouseId }, select: { code: true } });
        await applyStockIn(
          tx,
          ctx,
          { productId: product.id, warehouseId: o.warehouseId, quantity: o.quantity, reference: 'OPENING-STOCK', notes: 'Opening stock on product creation' },
          { sku: product.sku, warehouseCode: warehouse.code },
        );
      }
      return product.id;
    },
    { timeout: 20_000 },
  );

  return getProduct(productId);
}

export async function updateProduct(id: string, input: UpdateProductInput, ctx: AuditContext) {
  await prisma.$transaction(async (tx) => {
    const current = await tx.product.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('Product');

    if (input.sku && input.sku !== current.sku) {
      const taken = await tx.product.findUnique({ where: { sku: input.sku }, select: { id: true } });
      if (taken) throw AppError.conflict(`A product with SKU ${input.sku} already exists`);
    }

    const data: Prisma.ProductUpdateInput = {};
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const track = <K extends keyof UpdateProductInput>(key: K, currentValue: unknown, nextValue: unknown) => {
      if (nextValue === undefined) return;
      const normalisedCurrent = currentValue instanceof Prisma.Decimal ? Number(currentValue) : currentValue;
      if (normalisedCurrent !== nextValue) changes[key] = { from: normalisedCurrent, to: nextValue };
    };

    track('sku', current.sku, input.sku);
    track('name', current.name, input.name);
    track('description', current.description, input.description);
    track('category', current.category, input.category);
    track('unit', current.unit, input.unit);
    track('unitPrice', current.unitPrice, input.unitPrice);
    track('reorderLevel', current.reorderLevel, input.reorderLevel);

    if (input.sku !== undefined) data.sku = input.sku;
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.category !== undefined) data.category = input.category;
    if (input.unit !== undefined) data.unit = input.unit;
    if (input.unitPrice !== undefined) data.unitPrice = new Prisma.Decimal(input.unitPrice);
    if (input.reorderLevel !== undefined) data.reorderLevel = input.reorderLevel;

    await tx.product.update({ where: { id }, data });
    await writeAudit(
      ctx,
      {
        action: AuditAction.PRODUCT_UPDATED,
        entityType: 'Product',
        entityId: id,
        details: { sku: input.sku ?? current.sku, changes } as Prisma.InputJsonValue,
      },
      tx,
    );
  });
  return getProduct(id);
}

export async function setProductStatus(id: string, isActive: boolean, ctx: AuditContext) {
  await prisma.$transaction(async (tx) => {
    const current = await tx.product.findUnique({ where: { id }, select: { id: true, sku: true, isActive: true } });
    if (!current) throw AppError.notFound('Product');
    await tx.product.update({ where: { id }, data: { isActive } });
    await writeAudit(
      ctx,
      {
        action: isActive ? AuditAction.PRODUCT_ACTIVATED : AuditAction.PRODUCT_DEACTIVATED,
        entityType: 'Product',
        entityId: id,
        details: { sku: current.sku, previous: current.isActive },
      },
      tx,
    );
  });
  return getProduct(id);
}

/**
 * Hard delete is only permitted for products that never had stock activity.
 * Products with history must be deactivated so the audit trail stays intact.
 */
export async function deleteProduct(id: string, ctx: AuditContext) {
  await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id },
      include: { _count: { select: { movements: true } }, stockLevels: { select: { quantity: true } } },
    });
    if (!product) throw AppError.notFound('Product');

    const onHand = product.stockLevels.reduce((s, l) => s + l.quantity, 0);
    if (product._count.movements > 0 || onHand > 0) {
      throw AppError.conflict(
        'This product has stock or movement history and cannot be permanently deleted. Deactivate it instead.',
        { movements: product._count.movements, onHand },
      );
    }

    await tx.product.delete({ where: { id } });
    await writeAudit(
      ctx,
      { action: AuditAction.PRODUCT_DELETED, entityType: 'Product', entityId: id, details: { sku: product.sku, name: product.name } },
      tx,
    );
  });
}
