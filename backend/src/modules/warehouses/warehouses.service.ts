import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { AuditAction, writeAudit, type AuditContext } from '../../lib/audit';
import { money } from '../../lib/serialize';
import type { CreateWarehouseInput, UpdateWarehouseInput } from './warehouses.schemas';

interface WarehouseStatsRow {
  warehouse_id: string;
  total_units: number;
  sku_count: number;
  stock_value: Prisma.Decimal;
  low_stock_count: number;
}

export async function warehouseStats(warehouseIds?: string[]) {
  const filter = warehouseIds?.length
    ? Prisma.sql`WHERE sl.warehouse_id IN (${Prisma.join(warehouseIds.map((id) => Prisma.sql`${id}::uuid`))})`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<WarehouseStatsRow[]>`
    SELECT sl.warehouse_id::text AS warehouse_id,
           COALESCE(SUM(sl.quantity), 0)::int AS total_units,
           COUNT(*) FILTER (WHERE sl.quantity > 0)::int AS sku_count,
           COALESCE(SUM(sl.quantity * p.unit_price), 0)::numeric(16,2) AS stock_value,
           COUNT(*) FILTER (WHERE p.is_active AND sl.quantity <= p.reorder_level)::int AS low_stock_count
      FROM stock_levels sl
      JOIN products p ON p.id = sl.product_id
      ${filter}
     GROUP BY sl.warehouse_id`;
  return new Map(rows.map((r) => [r.warehouse_id, r]));
}

type WarehouseRecord = Prisma.WarehouseGetPayload<object>;

function withStats(w: WarehouseRecord, stats?: WarehouseStatsRow) {
  const totalUnits = stats?.total_units ?? 0;
  return {
    ...w,
    totalUnits,
    skuCount: stats?.sku_count ?? 0,
    stockValue: money(stats?.stock_value),
    lowStockCount: stats?.low_stock_count ?? 0,
    utilization: w.capacity ? Math.min(100, Math.round((totalUnits / w.capacity) * 1000) / 10) : null,
  };
}

export async function listWarehouses(includeInactive = true) {
  const warehouses = await prisma.warehouse.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
  });
  const stats = await warehouseStats();
  return warehouses.map((w) => withStats(w, stats.get(w.id)));
}

export async function getWarehouse(id: string) {
  const warehouse = await prisma.warehouse.findUnique({ where: { id } });
  if (!warehouse) throw AppError.notFound('Warehouse');
  const stats = await warehouseStats([id]);

  const recentMovements = await prisma.stockMovement.findMany({
    where: { OR: [{ fromWarehouseId: id }, { toWarehouseId: id }] },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      product: { select: { id: true, sku: true, name: true, unit: true } },
      fromWarehouse: { select: { id: true, code: true, name: true } },
      toWarehouse: { select: { id: true, code: true, name: true } },
      performedBy: { select: { id: true, name: true, role: true } },
    },
  });

  return { ...withStats(warehouse, stats.get(id)), recentMovements };
}

export async function createWarehouse(input: CreateWarehouseInput, ctx: AuditContext) {
  const exists = await prisma.warehouse.findUnique({ where: { code: input.code }, select: { id: true } });
  if (exists) throw AppError.conflict(`A warehouse with code ${input.code} already exists`);

  const warehouse = await prisma.$transaction(async (tx) => {
    const w = await tx.warehouse.create({
      data: { code: input.code, name: input.name, city: input.city, address: input.address ?? null, capacity: input.capacity ?? null },
    });
    await writeAudit(
      ctx,
      { action: AuditAction.WAREHOUSE_CREATED, entityType: 'Warehouse', entityId: w.id, details: { code: w.code, name: w.name, city: w.city } },
      tx,
    );
    return w;
  });
  return withStats(warehouse);
}

export async function updateWarehouse(id: string, input: UpdateWarehouseInput, ctx: AuditContext) {
  await prisma.$transaction(async (tx) => {
    const current = await tx.warehouse.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('Warehouse');
    if (input.code && input.code !== current.code) {
      const taken = await tx.warehouse.findUnique({ where: { code: input.code }, select: { id: true } });
      if (taken) throw AppError.conflict(`A warehouse with code ${input.code} already exists`);
    }

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of ['code', 'name', 'city', 'address', 'capacity'] as const) {
      if (input[key] !== undefined && input[key] !== current[key]) changes[key] = { from: current[key], to: input[key] };
    }

    await tx.warehouse.update({
      where: { id },
      data: {
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
      },
    });
    await writeAudit(
      ctx,
      { action: AuditAction.WAREHOUSE_UPDATED, entityType: 'Warehouse', entityId: id, details: { code: input.code ?? current.code, changes } as Prisma.InputJsonValue },
      tx,
    );
  });
  return getWarehouse(id);
}

export async function setWarehouseStatus(id: string, isActive: boolean, ctx: AuditContext) {
  await prisma.$transaction(async (tx) => {
    const current = await tx.warehouse.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('Warehouse');

    if (!isActive) {
      const agg = await tx.stockLevel.aggregate({ where: { warehouseId: id }, _sum: { quantity: true } });
      const onHand = agg._sum.quantity ?? 0;
      if (onHand > 0) {
        throw AppError.conflict(
          `Warehouse ${current.code} still holds ${onHand} units. Transfer or issue all stock before deactivating it.`,
          { onHand },
        );
      }
    }

    await tx.warehouse.update({ where: { id }, data: { isActive } });
    await writeAudit(
      ctx,
      {
        action: isActive ? AuditAction.WAREHOUSE_ACTIVATED : AuditAction.WAREHOUSE_DEACTIVATED,
        entityType: 'Warehouse',
        entityId: id,
        details: { code: current.code },
      },
      tx,
    );
  });
  return getWarehouse(id);
}
