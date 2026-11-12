import { Prisma, type MovementType } from '@prisma/client';
import { prisma, type TxClient } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { AuditAction, writeAudit, type AuditContext } from '../../lib/audit';
import { paginated, toSkipTake } from '../../lib/pagination';
import { money } from '../../lib/serialize';
import type { ListMovementsQuery, StockLevelsQuery, StockMovementInput, TransferInput } from './inventory.schemas';

/**
 * Inventory operations.
 *
 * Concurrency strategy (stock must never become negative):
 *  1. Every operation runs inside a single database transaction together with its
 *     stock_movements row and audit_logs row - all succeed or all roll back.
 *  2. Decrements use an atomic conditional UPDATE (`... WHERE quantity >= n`), which takes a
 *     row lock; concurrent requests on the same row are serialised by PostgreSQL and the
 *     loser re-evaluates the predicate against the committed value.
 *  3. Transfers lock both stock rows with SELECT ... FOR UPDATE in a deterministic order
 *     (ordered by warehouse id) so opposite-direction transfers cannot deadlock.
 *  4. A CHECK (quantity >= 0) constraint on stock_levels is the final safety net.
 *  5. Deadlocks / serialization failures (should they ever occur) are retried automatically.
 */

const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;
const MAX_RETRIES = 3;

const movementInclude = {
  product: { select: { id: true, sku: true, name: true, unit: true, unitPrice: true } },
  fromWarehouse: { select: { id: true, code: true, name: true } },
  toWarehouse: { select: { id: true, code: true, name: true } },
  performedBy: { select: { id: true, name: true, role: true } },
} satisfies Prisma.StockMovementInclude;

type MovementWithRelations = Prisma.StockMovementGetPayload<{ include: typeof movementInclude }>;

export function serializeMovement(m: MovementWithRelations) {
  return {
    id: m.id,
    type: m.type,
    quantity: m.quantity,
    reference: m.reference,
    notes: m.notes,
    createdAt: m.createdAt,
    value: money(Number(m.product.unitPrice) * m.quantity),
    product: { id: m.product.id, sku: m.product.sku, name: m.product.name, unit: m.product.unit },
    fromWarehouse: m.fromWarehouse,
    toWarehouse: m.toWarehouse,
    performedBy: m.performedBy,
  };
}

function isRetryable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2034') return true;
    const pgCode = (err.meta as { code?: string } | undefined)?.code;
    if (err.code === 'P2010' && (pgCode === '40P01' || pgCode === '40001')) return true;
  }
  const msg = err instanceof Error ? err.message : '';
  return /deadlock detected|could not serialize access/i.test(msg);
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt >= MAX_RETRIES || !isRetryable(err)) throw err;
      await new Promise((r) => setTimeout(r, 25 * attempt + Math.random() * 50));
    }
  }
}

async function loadActiveProduct(client: TxClient | typeof prisma, productId: string) {
  const product = await client.product.findUnique({
    where: { id: productId },
    select: { id: true, sku: true, name: true, unit: true, unitPrice: true, reorderLevel: true, isActive: true },
  });
  if (!product) throw AppError.notFound('Product');
  if (!product.isActive) throw AppError.conflict(`Product ${product.sku} is inactive. Activate it before moving stock.`);
  return product;
}

async function loadActiveWarehouse(client: TxClient | typeof prisma, warehouseId: string, label = 'Warehouse') {
  const warehouse = await client.warehouse.findUnique({
    where: { id: warehouseId },
    select: { id: true, code: true, name: true, isActive: true },
  });
  if (!warehouse) throw AppError.notFound(label);
  if (!warehouse.isActive) throw AppError.conflict(`${label} ${warehouse.code} is inactive`);
  return warehouse;
}

/** Makes sure a stock_levels row exists (committed) so it can be row-locked. Idempotent. */
async function ensureStockRow(productId: string, warehouseId: string) {
  await prisma.$executeRaw`
    INSERT INTO stock_levels (id, product_id, warehouse_id, quantity, updated_at)
    VALUES (gen_random_uuid(), ${productId}::uuid, ${warehouseId}::uuid, 0, now())
    ON CONFLICT (product_id, warehouse_id) DO NOTHING`;
}

async function currentQuantity(client: TxClient | typeof prisma, productId: string, warehouseId: string) {
  const row = await client.stockLevel.findUnique({
    where: { productId_warehouseId: { productId, warehouseId } },
    select: { quantity: true },
  });
  return row?.quantity ?? 0;
}

async function recordRejection(ctx: AuditContext, type: MovementType, details: Record<string, unknown>) {
  try {
    await writeAudit(ctx, {
      action: AuditAction.STOCK_OPERATION_REJECTED,
      entityType: 'StockMovement',
      details: { type, reason: 'INSUFFICIENT_STOCK', ...details } as Prisma.InputJsonValue,
    });
  } catch {
    // Never mask the original business error because of an audit write failure.
  }
}

/** Adds stock inside an existing transaction (used by stock-in and product opening stock). */
export async function applyStockIn(
  tx: TxClient,
  ctx: AuditContext,
  input: { productId: string; warehouseId: string; quantity: number; reference?: string | null; notes?: string | null },
  meta: { sku: string; warehouseCode: string },
) {
  const rows = await tx.$queryRaw<{ quantity: number }[]>`
    INSERT INTO stock_levels (id, product_id, warehouse_id, quantity, updated_at)
    VALUES (gen_random_uuid(), ${input.productId}::uuid, ${input.warehouseId}::uuid, ${input.quantity}, now())
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET quantity = stock_levels.quantity + EXCLUDED.quantity, updated_at = now()
    RETURNING quantity`;
  const newQuantity = rows[0]!.quantity;

  const movement = await tx.stockMovement.create({
    data: {
      type: 'STOCK_IN',
      productId: input.productId,
      toWarehouseId: input.warehouseId,
      quantity: input.quantity,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      performedById: ctx.userId!,
    },
    include: movementInclude,
  });

  await writeAudit(
    ctx,
    {
      action: AuditAction.STOCK_IN,
      entityType: 'StockMovement',
      entityId: movement.id,
      details: {
        productId: input.productId,
        sku: meta.sku,
        warehouseId: input.warehouseId,
        warehouse: meta.warehouseCode,
        quantity: input.quantity,
        reference: input.reference ?? null,
        balanceAfter: newQuantity,
      },
    },
    tx,
  );

  return { movement, newQuantity };
}

export async function stockIn(input: StockMovementInput, ctx: AuditContext) {
  const product = await loadActiveProduct(prisma, input.productId);
  const warehouse = await loadActiveWarehouse(prisma, input.warehouseId);

  return withRetry(async () => {
    const { movement, newQuantity } = await prisma.$transaction(
      (tx) => applyStockIn(tx, ctx, input, { sku: product.sku, warehouseCode: warehouse.code }),
      TX_OPTIONS,
    );
    return {
      movement: serializeMovement(movement),
      stockLevels: [{ warehouseId: warehouse.id, warehouseCode: warehouse.code, quantity: newQuantity }],
    };
  });
}

export async function stockOut(input: StockMovementInput, ctx: AuditContext) {
  const product = await loadActiveProduct(prisma, input.productId);
  const warehouse = await loadActiveWarehouse(prisma, input.warehouseId);

  try {
    return await withRetry(async () => {
      const { movement, newQuantity } = await prisma.$transaction(async (tx) => {
        // Atomic conditional decrement: only succeeds if enough stock is available *right now*.
        const rows = await tx.$queryRaw<{ quantity: number }[]>`
          UPDATE stock_levels
             SET quantity = quantity - ${input.quantity}, updated_at = now()
           WHERE product_id = ${input.productId}::uuid
             AND warehouse_id = ${input.warehouseId}::uuid
             AND quantity >= ${input.quantity}
          RETURNING quantity`;

        if (rows.length === 0) {
          const available = await currentQuantity(tx, input.productId, input.warehouseId);
          throw AppError.insufficientStock({
            available,
            requested: input.quantity,
            productId: input.productId,
            warehouseId: input.warehouseId,
          });
        }
        const balance = rows[0]!.quantity;

        const created = await tx.stockMovement.create({
          data: {
            type: 'STOCK_OUT',
            productId: input.productId,
            fromWarehouseId: input.warehouseId,
            quantity: input.quantity,
            reference: input.reference ?? null,
            notes: input.notes ?? null,
            performedById: ctx.userId!,
          },
          include: movementInclude,
        });

        await writeAudit(
          ctx,
          {
            action: AuditAction.STOCK_OUT,
            entityType: 'StockMovement',
            entityId: created.id,
            details: {
              productId: product.id,
              sku: product.sku,
              warehouseId: warehouse.id,
              warehouse: warehouse.code,
              quantity: input.quantity,
              reference: input.reference ?? null,
              balanceAfter: balance,
            },
          },
          tx,
        );
        return { movement: created, newQuantity: balance };
      }, TX_OPTIONS);

      return {
        movement: serializeMovement(movement),
        stockLevels: [{ warehouseId: warehouse.id, warehouseCode: warehouse.code, quantity: newQuantity }],
      };
    });
  } catch (err) {
    if (err instanceof AppError && err.code === 'INSUFFICIENT_STOCK') {
      await recordRejection(ctx, 'STOCK_OUT', {
        sku: product.sku,
        warehouse: warehouse.code,
        ...(err.details as Record<string, unknown>),
      });
    }
    throw err;
  }
}

export async function transfer(input: TransferInput, ctx: AuditContext) {
  if (input.fromWarehouseId === input.toWarehouseId) {
    throw AppError.badRequest('Source and destination warehouses must be different', [
      { path: 'toWarehouseId', message: 'Destination must differ from source' },
    ]);
  }
  const product = await loadActiveProduct(prisma, input.productId);
  const from = await loadActiveWarehouse(prisma, input.fromWarehouseId, 'Source warehouse');
  const to = await loadActiveWarehouse(prisma, input.toWarehouseId, 'Destination warehouse');

  // Destination row must exist (committed) so both rows can be locked in a deterministic order.
  await ensureStockRow(input.productId, input.toWarehouseId);

  try {
    return await withRetry(async () => {
      const result = await prisma.$transaction(async (tx) => {
        const ordered = [input.fromWarehouseId, input.toWarehouseId].sort();
        const locked = await tx.$queryRaw<{ warehouse_id: string; quantity: number }[]>`
          SELECT warehouse_id::text AS warehouse_id, quantity
            FROM stock_levels
           WHERE product_id = ${input.productId}::uuid
             AND warehouse_id IN (${Prisma.join(ordered.map((id) => Prisma.sql`${id}::uuid`))})
           ORDER BY warehouse_id
           FOR UPDATE`;

        const source = locked.find((r) => r.warehouse_id === input.fromWarehouseId);
        const available = source?.quantity ?? 0;
        if (available < input.quantity) {
          throw AppError.insufficientStock({
            available,
            requested: input.quantity,
            productId: input.productId,
            warehouseId: input.fromWarehouseId,
          });
        }

        const [fromRow] = await tx.$queryRaw<{ quantity: number }[]>`
          UPDATE stock_levels SET quantity = quantity - ${input.quantity}, updated_at = now()
           WHERE product_id = ${input.productId}::uuid AND warehouse_id = ${input.fromWarehouseId}::uuid
          RETURNING quantity`;
        const [toRow] = await tx.$queryRaw<{ quantity: number }[]>`
          UPDATE stock_levels SET quantity = quantity + ${input.quantity}, updated_at = now()
           WHERE product_id = ${input.productId}::uuid AND warehouse_id = ${input.toWarehouseId}::uuid
          RETURNING quantity`;

        const movement = await tx.stockMovement.create({
          data: {
            type: 'TRANSFER',
            productId: input.productId,
            fromWarehouseId: input.fromWarehouseId,
            toWarehouseId: input.toWarehouseId,
            quantity: input.quantity,
            reference: input.reference ?? null,
            notes: input.notes ?? null,
            performedById: ctx.userId!,
          },
          include: movementInclude,
        });

        await writeAudit(
          ctx,
          {
            action: AuditAction.STOCK_TRANSFER,
            entityType: 'StockMovement',
            entityId: movement.id,
            details: {
              productId: product.id,
              sku: product.sku,
              fromWarehouseId: from.id,
              from: from.code,
              toWarehouseId: to.id,
              to: to.code,
              quantity: input.quantity,
              reference: input.reference ?? null,
              fromBalanceAfter: fromRow!.quantity,
              toBalanceAfter: toRow!.quantity,
            },
          },
          tx,
        );

        return { movement, fromQty: fromRow!.quantity, toQty: toRow!.quantity };
      }, TX_OPTIONS);

      return {
        movement: serializeMovement(result.movement),
        stockLevels: [
          { warehouseId: from.id, warehouseCode: from.code, quantity: result.fromQty },
          { warehouseId: to.id, warehouseCode: to.code, quantity: result.toQty },
        ],
      };
    });
  } catch (err) {
    if (err instanceof AppError && err.code === 'INSUFFICIENT_STOCK') {
      await recordRejection(ctx, 'TRANSFER', {
        sku: product.sku,
        from: from.code,
        to: to.code,
        ...(err.details as Record<string, unknown>),
      });
    }
    throw err;
  }
}

export async function listMovements(q: ListMovementsQuery) {
  const where: Prisma.StockMovementWhereInput = {
    ...(q.type ? { type: q.type } : {}),
    ...(q.productId ? { productId: q.productId } : {}),
    ...(q.userId ? { performedById: q.userId } : {}),
    ...(q.warehouseId ? { OR: [{ fromWarehouseId: q.warehouseId }, { toWarehouseId: q.warehouseId }] } : {}),
    ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
    ...(q.search
      ? {
          AND: [
            {
              OR: [
                { reference: { contains: q.search, mode: 'insensitive' } },
                { notes: { contains: q.search, mode: 'insensitive' } },
                { product: { name: { contains: q.search, mode: 'insensitive' } } },
                { product: { sku: { contains: q.search, mode: 'insensitive' } } },
              ],
            },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.stockMovement.findMany({ where, include: movementInclude, orderBy: { createdAt: 'desc' }, ...toSkipTake(q) }),
    prisma.stockMovement.count({ where }),
  ]);
  return paginated(items.map(serializeMovement), total, q);
}

export async function listStockLevels(q: StockLevelsQuery) {
  const where: Prisma.StockLevelWhereInput = {
    ...(q.warehouseId ? { warehouseId: q.warehouseId } : {}),
    ...(q.productId ? { productId: q.productId } : {}),
    ...(q.onlyInStock ? { quantity: { gt: 0 } } : {}),
    product: {
      ...(q.includeInactive ? {} : { isActive: true }),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { sku: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
  };

  const [items, total] = await Promise.all([
    prisma.stockLevel.findMany({
      where,
      include: {
        product: { select: { id: true, sku: true, name: true, category: true, unit: true, unitPrice: true, reorderLevel: true, isActive: true } },
        warehouse: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ product: { name: 'asc' } }, { warehouse: { code: 'asc' } }],
      ...toSkipTake(q),
    }),
    prisma.stockLevel.count({ where }),
  ]);

  return paginated(
    items.map((s) => ({
      id: s.id,
      quantity: s.quantity,
      updatedAt: s.updatedAt,
      value: money(Number(s.product.unitPrice) * s.quantity),
      product: { ...s.product, unitPrice: money(s.product.unitPrice) },
      warehouse: s.warehouse,
    })),
    total,
    q,
  );
}
