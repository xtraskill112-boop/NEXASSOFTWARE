import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { money } from '../../lib/serialize';
import { describeActivity } from '../audit/audit.describe';
import { listWarehouses } from '../warehouses/warehouses.service';
import { env } from '../../config/env';

interface TotalsRow {
  total_skus: number;
  inactive_products: number;
  total_units: bigint;
  total_value: Prisma.Decimal;
  low_stock: number;
  out_of_stock: number;
}

interface TrendRow {
  day: Date;
  stock_in: bigint;
  stock_out: bigint;
  transfer: bigint;
}

interface CategoryRow {
  category: string;
  product_count: number;
  units: bigint;
  value: Prisma.Decimal;
}

interface LowStockRow {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  reorder_level: number;
  total_stock: number;
}

const TREND_DAYS = 14;

/** All figures are computed live from the database. */
export async function getDashboardSummary() {
  const tz = env.APP_TIMEZONE;
  const [totals] = await prisma.$queryRaw<TotalsRow[]>`
    WITH t AS (
      SELECT p.id, p.is_active, p.unit_price, p.reorder_level, COALESCE(SUM(sl.quantity), 0) AS qty
        FROM products p
        LEFT JOIN stock_levels sl ON sl.product_id = p.id
       GROUP BY p.id
    )
    SELECT COUNT(*) FILTER (WHERE is_active)::int                          AS total_skus,
           COUNT(*) FILTER (WHERE NOT is_active)::int                      AS inactive_products,
           COALESCE(SUM(qty) FILTER (WHERE is_active), 0)::bigint          AS total_units,
           COALESCE(SUM(qty * unit_price) FILTER (WHERE is_active), 0)::numeric(18,2) AS total_value,
           COUNT(*) FILTER (WHERE is_active AND qty <= reorder_level)::int AS low_stock,
           COUNT(*) FILTER (WHERE is_active AND qty = 0)::int              AS out_of_stock
      FROM t`;

  const trendRows = await prisma.$queryRaw<TrendRow[]>`
    WITH days AS (
      SELECT generate_series(
        date_trunc('day', now() AT TIME ZONE ${tz}) - (${TREND_DAYS - 1}::int * interval '1 day'),
        date_trunc('day', now() AT TIME ZONE ${tz}),
        interval '1 day'
      ) AS day
    )
    SELECT d.day,
           COALESCE(SUM(m.quantity) FILTER (WHERE m.type = 'STOCK_IN'), 0)::bigint  AS stock_in,
           COALESCE(SUM(m.quantity) FILTER (WHERE m.type = 'STOCK_OUT'), 0)::bigint AS stock_out,
           COALESCE(SUM(m.quantity) FILTER (WHERE m.type = 'TRANSFER'), 0)::bigint  AS transfer
      FROM days d
      LEFT JOIN stock_movements m
        ON (m.created_at AT TIME ZONE ${tz}) >= d.day
       AND (m.created_at AT TIME ZONE ${tz}) < d.day + interval '1 day'
     GROUP BY d.day
     ORDER BY d.day`;

  const categoryRows = await prisma.$queryRaw<CategoryRow[]>`
    SELECT p.category,
           COUNT(DISTINCT p.id)::int AS product_count,
           COALESCE(SUM(sl.quantity), 0)::bigint AS units,
           COALESCE(SUM(sl.quantity * p.unit_price), 0)::numeric(18,2) AS value
      FROM products p
      LEFT JOIN stock_levels sl ON sl.product_id = p.id
     WHERE p.is_active
     GROUP BY p.category
     ORDER BY value DESC`;

  const lowStockRows = await prisma.$queryRaw<LowStockRow[]>`
    SELECT p.id, p.sku, p.name, p.category, p.unit, p.reorder_level,
           COALESCE(SUM(sl.quantity), 0)::int AS total_stock
      FROM products p
      LEFT JOIN stock_levels sl ON sl.product_id = p.id
     WHERE p.is_active
     GROUP BY p.id
    HAVING COALESCE(SUM(sl.quantity), 0) <= p.reorder_level
     ORDER BY (COALESCE(SUM(sl.quantity), 0)::numeric / GREATEST(p.reorder_level, 1)) ASC, p.name ASC
     LIMIT 6`;

  const [today] = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM stock_movements
     WHERE (created_at AT TIME ZONE ${tz}) >= date_trunc('day', now() AT TIME ZONE ${tz})`;

  const [warehouses, activeUsers, recentLogs] = await Promise.all([
    listWarehouses(false),
    prisma.user.count({ where: { isActive: true } }),
    prisma.auditLog.findMany({
      where: { action: { notIn: ['AUTH_LOGIN', 'AUTH_LOGOUT', 'AUTH_LOGIN_FAILED'] } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { user: { select: { id: true, name: true, role: true } } },
    }),
  ]);

  return {
    kpis: {
      totalSkus: totals?.total_skus ?? 0,
      inactiveProducts: totals?.inactive_products ?? 0,
      totalInventory: Number(totals?.total_units ?? 0),
      lowStockCount: totals?.low_stock ?? 0,
      outOfStockCount: totals?.out_of_stock ?? 0,
      totalStockValue: money(totals?.total_value),
      warehouseCount: warehouses.length,
      todayMovements: today?.count ?? 0,
      activeUsers,
    },
    warehouses: warehouses.map((w) => ({
      id: w.id,
      code: w.code,
      name: w.name,
      city: w.city,
      capacity: w.capacity,
      totalUnits: w.totalUnits,
      skuCount: w.skuCount,
      stockValue: w.stockValue,
      lowStockCount: w.lowStockCount,
      utilization: w.utilization,
    })),
    movementTrend: trendRows.map((r) => ({
      date: r.day.toISOString().slice(0, 10),
      stockIn: Number(r.stock_in),
      stockOut: Number(r.stock_out),
      transfer: Number(r.transfer),
    })),
    categoryBreakdown: categoryRows.map((r) => ({
      category: r.category,
      productCount: r.product_count,
      units: Number(r.units),
      value: money(r.value),
    })),
    lowStockItems: lowStockRows.map((r) => ({
      id: r.id,
      sku: r.sku,
      name: r.name,
      category: r.category,
      unit: r.unit,
      reorderLevel: r.reorder_level,
      totalStock: r.total_stock,
      status: r.total_stock === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
    })),
    recentActivities: recentLogs.map((log) => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      description: describeActivity(log.action, log.details),
      createdAt: log.createdAt,
      user: log.user,
    })),
    timezone: tz,
    generatedAt: new Date(),
  };
}
