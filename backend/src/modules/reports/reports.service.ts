import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { money } from '../../lib/serialize';
import type { LowStockQuery } from './reports.schemas';

interface LowStockRow {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  unit_price: Prisma.Decimal;
  reorder_level: number;
  quantity: number;
}

/**
 * Low-stock report.
 * A product is "low stock" when its on-hand quantity is at or below its reorder level and
 * "out of stock" when it is zero. Without a warehouse filter the quantity is the total across
 * all warehouses; with a warehouse filter it is the quantity held in that warehouse.
 * Suggested reorder quantity tops stock back up to twice the reorder level.
 */
export async function lowStockReport(q: LowStockQuery) {
  let warehouse: { id: string; code: string; name: string } | null = null;
  if (q.warehouseId) {
    warehouse = await prisma.warehouse.findUnique({ where: { id: q.warehouseId }, select: { id: true, code: true, name: true } });
    if (!warehouse) throw AppError.notFound('Warehouse');
  }

  const qtyExpr = q.warehouseId
    ? Prisma.sql`COALESCE(SUM(sl.quantity) FILTER (WHERE sl.warehouse_id = ${q.warehouseId}::uuid), 0)::int`
    : Prisma.sql`COALESCE(SUM(sl.quantity), 0)::int`;

  const conditions: Prisma.Sql[] = [Prisma.sql`p.is_active = true`];
  if (q.category) conditions.push(Prisma.sql`p.category = ${q.category}`);
  if (q.search) {
    const like = `%${q.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conditions.push(Prisma.sql`(p.name ILIKE ${like} OR p.sku ILIKE ${like})`);
  }

  const having =
    q.status === 'out'
      ? Prisma.sql`${qtyExpr} = 0`
      : q.status === 'low'
        ? Prisma.sql`${qtyExpr} > 0 AND ${qtyExpr} <= p.reorder_level`
        : Prisma.sql`${qtyExpr} <= p.reorder_level`;

  const rows = await prisma.$queryRaw<LowStockRow[]>`
    SELECT p.id, p.sku, p.name, p.category, p.unit, p.unit_price, p.reorder_level, ${qtyExpr} AS quantity
      FROM products p
      LEFT JOIN stock_levels sl ON sl.product_id = p.id
     WHERE ${Prisma.join(conditions, ' AND ')}
     GROUP BY p.id
    HAVING ${having}
     ORDER BY ${qtyExpr} ASC, (${qtyExpr}::numeric / GREATEST(p.reorder_level, 1)) ASC, p.name ASC`;

  const levels = rows.length
    ? await prisma.stockLevel.findMany({
        where: { productId: { in: rows.map((r) => r.id) } },
        include: { warehouse: { select: { id: true, code: true, name: true } } },
        orderBy: { warehouse: { code: 'asc' } },
      })
    : [];

  const items = rows.map((r) => {
    const suggestedReorderQty = Math.max(r.reorder_level * 2 - r.quantity, 0);
    return {
      productId: r.id,
      sku: r.sku,
      name: r.name,
      category: r.category,
      unit: r.unit,
      unitPrice: money(r.unit_price),
      reorderLevel: r.reorder_level,
      quantity: r.quantity,
      shortfall: Math.max(r.reorder_level - r.quantity, 0),
      suggestedReorderQty,
      estimatedReorderCost: money(suggestedReorderQty * Number(r.unit_price)),
      status: r.quantity === 0 ? ('OUT_OF_STOCK' as const) : ('LOW_STOCK' as const),
      stockByWarehouse: levels
        .filter((l) => l.productId === r.id)
        .map((l) => ({ warehouseId: l.warehouse.id, warehouseCode: l.warehouse.code, warehouseName: l.warehouse.name, quantity: l.quantity })),
    };
  });

  return {
    scope: warehouse ? { type: 'WAREHOUSE' as const, warehouse } : { type: 'ALL_WAREHOUSES' as const, warehouse: null },
    summary: {
      totalItems: items.length,
      outOfStock: items.filter((i) => i.status === 'OUT_OF_STOCK').length,
      lowStock: items.filter((i) => i.status === 'LOW_STOCK').length,
      estimatedReorderCost: money(items.reduce((s, i) => s + i.estimatedReorderCost, 0)),
    },
    data: items,
    generatedAt: new Date(),
  };
}

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  // Prevent CSV/formula injection when opened in spreadsheet software.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function lowStockCsv(report: Awaited<ReturnType<typeof lowStockReport>>, warehouseCodes: string[]): string {
  const header = [
    'SKU',
    'Product',
    'Category',
    'Unit',
    'Status',
    'On Hand',
    'Reorder Level',
    'Shortfall',
    'Suggested Reorder Qty',
    'Unit Price (INR)',
    'Estimated Reorder Cost (INR)',
    ...warehouseCodes.map((c) => `Qty @ ${c}`),
  ];
  const lines = [header.map(csvCell).join(',')];
  for (const i of report.data) {
    const byCode = new Map(i.stockByWarehouse.map((w) => [w.warehouseCode, w.quantity]));
    lines.push(
      [
        i.sku,
        i.name,
        i.category,
        i.unit,
        i.status === 'OUT_OF_STOCK' ? 'Out of stock' : 'Low stock',
        i.quantity,
        i.reorderLevel,
        i.shortfall,
        i.suggestedReorderQty,
        i.unitPrice.toFixed(2),
        i.estimatedReorderCost.toFixed(2),
        ...warehouseCodes.map((c) => byCode.get(c) ?? 0),
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}
