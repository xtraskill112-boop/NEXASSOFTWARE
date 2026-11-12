/**
 * StockSense demo seed.
 * Creates users for every role, three warehouses, sample products and ~30 days of
 * consistent stock movement history (stock levels are derived from the movements).
 *
 * Idempotent: if users already exist the seed is skipped (use `npm run db:reset` to start over).
 */
import 'dotenv/config';
import { PrismaClient, Prisma, type MovementType, type Role, type Warehouse } from '@prisma/client';
import bcrypt from 'bcrypt';
import { customers, seedProducts, seedUsers, seedWarehouses, suppliers } from './seed-data';

const prisma = new PrismaClient();
const ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);
const HISTORY_DAYS = 30;

// Deterministic PRNG so every fresh install gets the same demo data.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261203);
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
const between = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;

interface PlannedMovement {
  id: string;
  type: MovementType;
  productId: string;
  sku: string;
  fromWarehouseId: string | null;
  toWarehouseId: string | null;
  quantity: number;
  reference: string;
  notes: string | null;
  performedById: string;
  createdAt: Date;
  details: Prisma.InputJsonValue;
}

function atDay(daysAgo: number, hour: number, minute: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, between(0, 59), 0);
  // Never place history in the future.
  return d.getTime() > Date.now() ? new Date(Date.now() - between(1, 60) * 60_000) : d;
}

async function main() {
  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    console.log(`Seed skipped: database already contains ${existingUsers} user(s).`);
    return;
  }

  console.log('Seeding StockSense demo data...');

  // ---- Users --------------------------------------------------------------
  const users: Record<Role | 'STAFF2', { id: string; name: string }> = {} as never;
  for (const u of seedUsers) {
    const password = process.env[u.passwordEnv] || u.defaultPassword;
    const created = await prisma.user.create({
      data: {
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        passwordHash: await bcrypt.hash(password, ROUNDS),
        createdAt: atDay(HISTORY_DAYS + 5, 9, 0),
      },
    });
    const key = u.role === 'STAFF' && !u.isActive ? 'STAFF2' : u.role;
    users[key] = { id: created.id, name: created.name };
  }
  const admin = users.ADMIN;
  const manager = users.MANAGER;
  const staff = users.STAFF;

  const audit: Prisma.AuditLogCreateManyInput[] = [];
  const systemMeta = { ipAddress: '10.0.0.12', userAgent: 'StockSense Seed' };

  for (const u of seedUsers.filter((x) => x.role !== 'ADMIN')) {
    const created = await prisma.user.findUniqueOrThrow({ where: { email: u.email } });
    audit.push({
      userId: admin.id,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: created.id,
      details: { name: created.name, email: created.email, role: created.role },
      createdAt: atDay(HISTORY_DAYS + 4, 10, between(0, 59)),
      ...systemMeta,
    });
    if (!u.isActive) {
      audit.push({
        userId: admin.id,
        action: 'USER_DEACTIVATED',
        entityType: 'User',
        entityId: created.id,
        details: { email: created.email },
        createdAt: atDay(6, 11, 15),
        ...systemMeta,
      });
    }
  }

  // ---- Warehouses ---------------------------------------------------------
  const warehouses: Warehouse[] = [];
  for (const w of seedWarehouses) {
    const created = await prisma.warehouse.create({ data: { ...w, createdAt: atDay(HISTORY_DAYS + 3, 9, 30) } });
    warehouses.push(created);
    audit.push({
      userId: admin.id,
      action: 'WAREHOUSE_CREATED',
      entityType: 'Warehouse',
      entityId: created.id,
      details: { code: created.code, name: created.name, city: created.city },
      createdAt: atDay(HISTORY_DAYS + 3, 9, 30),
      ...systemMeta,
    });
  }

  // ---- Products -----------------------------------------------------------
  const products = [];
  for (const p of seedProducts) {
    const created = await prisma.product.create({
      data: {
        sku: p.sku,
        name: p.name,
        description: p.description,
        category: p.category,
        unit: p.unit,
        unitPrice: new Prisma.Decimal(p.unitPrice),
        reorderLevel: p.reorderLevel,
        isActive: p.isActive ?? true,
        createdAt: atDay(HISTORY_DAYS + 1, 10, between(0, 59)),
      },
    });
    products.push({ record: created, spec: p });
    audit.push({
      userId: manager.id,
      action: 'PRODUCT_CREATED',
      entityType: 'Product',
      entityId: created.id,
      details: { sku: created.sku, name: created.name, category: created.category, unitPrice: p.unitPrice, reorderLevel: p.reorderLevel },
      createdAt: atDay(HISTORY_DAYS + 1, 10, between(0, 59)),
      ...systemMeta,
    });
  }

  // ---- Simulated stock history -----------------------------------------------
  const qty = new Map<string, number>(); // `${productId}:${warehouseId}` -> quantity
  const key = (p: string, w: string) => `${p}:${w}`;
  const planned: PlannedMovement[] = [];
  let poCounter = 4100;
  let invCounter = 9800;
  let trCounter = 300;

  const plan = (m: Omit<PlannedMovement, 'id' | 'details'> & { sku: string }) => {
    const id = crypto.randomUUID();
    const wFrom = warehouses.find((w) => w.id === m.fromWarehouseId);
    const wTo = warehouses.find((w) => w.id === m.toWarehouseId);
    let details: Prisma.InputJsonValue;
    if (m.type === 'STOCK_IN') {
      const after = (qty.get(key(m.productId, m.toWarehouseId!)) ?? 0) + m.quantity;
      qty.set(key(m.productId, m.toWarehouseId!), after);
      details = { productId: m.productId, sku: m.sku, warehouseId: wTo!.id, warehouse: wTo!.code, quantity: m.quantity, reference: m.reference, balanceAfter: after };
    } else if (m.type === 'STOCK_OUT') {
      const after = (qty.get(key(m.productId, m.fromWarehouseId!)) ?? 0) - m.quantity;
      if (after < 0) throw new Error('Seed simulation produced negative stock');
      qty.set(key(m.productId, m.fromWarehouseId!), after);
      details = { productId: m.productId, sku: m.sku, warehouseId: wFrom!.id, warehouse: wFrom!.code, quantity: m.quantity, reference: m.reference, balanceAfter: after };
    } else {
      const fromAfter = (qty.get(key(m.productId, m.fromWarehouseId!)) ?? 0) - m.quantity;
      if (fromAfter < 0) throw new Error('Seed simulation produced negative stock');
      const toAfter = (qty.get(key(m.productId, m.toWarehouseId!)) ?? 0) + m.quantity;
      qty.set(key(m.productId, m.fromWarehouseId!), fromAfter);
      qty.set(key(m.productId, m.toWarehouseId!), toAfter);
      details = {
        productId: m.productId, sku: m.sku, fromWarehouseId: wFrom!.id, from: wFrom!.code, toWarehouseId: wTo!.id, to: wTo!.code,
        quantity: m.quantity, reference: m.reference, fromBalanceAfter: fromAfter, toBalanceAfter: toAfter,
      };
    }
    planned.push({ ...m, id, details });
  };

  // Opening stock (goods received from suppliers)
  for (const { record, spec } of products) {
    spec.opening.forEach((q, idx) => {
      if (q <= 0) return;
      plan({
        type: 'STOCK_IN', productId: record.id, sku: record.sku, fromWarehouseId: null, toWarehouseId: warehouses[idx]!.id,
        quantity: q, reference: `PO-${poCounter++}`, notes: `Opening stock from ${pick(suppliers)}`,
        performedById: staff.id, createdAt: atDay(HISTORY_DAYS, 9 + idx, between(0, 59)),
      });
    });
  }

  // Daily operations
  for (let day = HISTORY_DAYS - 1; day >= 0; day--) {
    for (const { record, spec } of products) {
      if (spec.demand <= 0 || spec.isActive === false) continue;
      const lowByDesign = spec.opening.reduce((a, b) => a + b, 0) < spec.reorderLevel * 2;

      // Customer dispatches (stock out)
      if (rand() < spec.demand * 0.55) {
        const w = pick(warehouses);
        const onHand = qty.get(key(record.id, w.id)) ?? 0;
        const want = Math.max(1, Math.round(onHand * (0.04 + rand() * 0.08)));
        if (onHand > 0 && want <= onHand) {
          plan({
            type: 'STOCK_OUT', productId: record.id, sku: record.sku, fromWarehouseId: w.id, toWarehouseId: null,
            quantity: want, reference: `INV-${invCounter++}`, notes: `Dispatched to ${pick(customers)}`,
            performedById: rand() < 0.8 ? staff.id : manager.id, createdAt: atDay(day, between(10, 17), between(0, 59)),
          });
        }
      }

      // Replenishment from suppliers when warehouse stock runs down
      if (!lowByDesign && rand() < 0.45) {
        for (const w of warehouses) {
          const onHand = qty.get(key(record.id, w.id)) ?? 0;
          const idx = warehouses.indexOf(w);
          const target = spec.opening[idx]!;
          if (target > 0 && onHand < target * 0.7) {
            plan({
              type: 'STOCK_IN', productId: record.id, sku: record.sku, fromWarehouseId: null, toWarehouseId: w.id,
              quantity: Math.round(target * (0.4 + rand() * 0.3)), reference: `PO-${poCounter++}`, notes: `Replenishment from ${pick(suppliers)}`,
              performedById: staff.id, createdAt: atDay(day, between(8, 10), between(0, 59)),
            });
            break;
          }
        }
      }

      // Inter-warehouse transfers (hub -> regional)
      if (rand() < 0.06) {
        const from = warehouses[0]!;
        const to = rand() < 0.5 ? warehouses[1]! : warehouses[2]!;
        const onHand = qty.get(key(record.id, from.id)) ?? 0;
        const move = Math.round(onHand * 0.15);
        if (move >= 1) {
          plan({
            type: 'TRANSFER', productId: record.id, sku: record.sku, fromWarehouseId: from.id, toWarehouseId: to.id,
            quantity: move, reference: `TRF-${trCounter++}`, notes: `Stock balancing ${from.city} to ${to.city}`,
            performedById: manager.id, createdAt: atDay(day, between(11, 16), between(0, 59)),
          });
        }
      }
    }
  }

  planned.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  await prisma.stockMovement.createMany({
    data: planned.map((m) => ({
      id: m.id,
      type: m.type,
      productId: m.productId,
      fromWarehouseId: m.fromWarehouseId,
      toWarehouseId: m.toWarehouseId,
      quantity: m.quantity,
      reference: m.reference,
      notes: m.notes,
      performedById: m.performedById,
      createdAt: m.createdAt,
    })),
  });

  for (const m of planned) {
    audit.push({
      userId: m.performedById,
      action: m.type === 'TRANSFER' ? 'STOCK_TRANSFER' : m.type,
      entityType: 'StockMovement',
      entityId: m.id,
      details: m.details,
      createdAt: m.createdAt,
      ...systemMeta,
    });
  }

  // Final stock levels = result of the simulated movements (one row per product/warehouse pair)
  const levelRows: Prisma.StockLevelCreateManyInput[] = [];
  for (const { record } of products) {
    for (const w of warehouses) {
      const q = qty.get(key(record.id, w.id));
      if (q !== undefined) levelRows.push({ productId: record.id, warehouseId: w.id, quantity: q });
    }
  }
  await prisma.stockLevel.createMany({ data: levelRows });

  // A handful of login events so the audit trail looks like a living system
  for (let d = 5; d >= 0; d--) {
    for (const u of [admin, manager, staff]) {
      audit.push({ userId: u.id, action: 'AUTH_LOGIN', entityType: 'User', entityId: u.id, details: {}, createdAt: atDay(d, 8, between(30, 59)), ...systemMeta });
    }
  }

  await prisma.auditLog.createMany({ data: audit });

  console.log(`  users:           ${seedUsers.length}`);
  console.log(`  warehouses:      ${warehouses.length}`);
  console.log(`  products:        ${products.length}`);
  console.log(`  stock_levels:    ${levelRows.length}`);
  console.log(`  stock_movements: ${planned.length}`);
  console.log(`  audit_logs:      ${audit.length}`);
  console.log('Seed completed.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
