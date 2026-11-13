/**
 * Standalone demo data store.
 * Replaces PostgreSQL with an in-memory database persisted to the browser's localStorage,
 * seeded with the same deterministic demo dataset as the server edition.
 */
import { sha256Hex } from './sha256';
import { customers, seedProducts, seedUsers, seedWarehouses, suppliers } from './seedData';

export type Role = 'ADMIN' | 'MANAGER' | 'STAFF';
export type MovementType = 'STOCK_IN' | 'STOCK_OUT' | 'TRANSFER';

export interface UserRec {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  salt: string;
  role: Role;
  isActive: boolean;
  tokenVersion: number;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface WarehouseRec {
  id: string;
  code: string;
  name: string;
  city: string;
  address: string | null;
  capacity: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface ProductRec {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  unit: string;
  unitPrice: number;
  reorderLevel: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface StockLevelRec {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  updatedAt: string;
}
export interface MovementRec {
  id: string;
  type: MovementType;
  productId: string;
  fromWarehouseId: string | null;
  toWarehouseId: string | null;
  quantity: number;
  reference: string | null;
  notes: string | null;
  performedById: string;
  createdAt: string;
}
export interface AuditRec {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}
export interface SessionRec {
  userId: string;
  ver: number;
  exp: number;
}
export interface DB {
  version: 1;
  seededAt: string;
  users: UserRec[];
  warehouses: WarehouseRec[];
  products: ProductRec[];
  stockLevels: StockLevelRec[];
  movements: MovementRec[];
  auditLogs: AuditRec[];
  sessions: Record<string, SessionRec>;
}

const KEY = 'stocksense.standalone.db.v1';
let cache: DB | null = null;

/** UUID v4 using getRandomValues (available even outside secure contexts such as file://). */
export function uid(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function randomToken(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function hashPassword(password: string, salt: string): string {
  return sha256Hex(`${salt}:${password}`);
}

export function newPasswordRecord(password: string) {
  const salt = randomToken().slice(0, 32);
  return { salt, passwordHash: hashPassword(password, salt) };
}

export function getDb(): DB {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (parsed?.version === 1 && Array.isArray(parsed.users)) {
        cache = parsed;
        return cache;
      }
    }
  } catch {
    /* storage unavailable or corrupt: fall through to a fresh seed */
  }
  cache = createSeededDb();
  saveDb();
  return cache;
}

export function saveDb() {
  if (!cache) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* storage full or blocked: keep working in memory for this tab */
  }
}

export function resetDb() {
  cache = createSeededDb();
  saveDb();
}

/* ---------------------------------------------------------------------------
 * Deterministic demo seed (port of backend/prisma/seed.ts)
 * ------------------------------------------------------------------------- */

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

function createSeededDb(): DB {
  const rand = mulberry32(20261203);
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
  const between = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
  const HISTORY_DAYS = 30;
  const atDay = (daysAgo: number, hour: number, minute: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, minute, between(0, 59), 0);
    return (d.getTime() > Date.now() ? new Date(Date.now() - between(1, 60) * 60_000) : d).toISOString();
  };

  const db: DB = { version: 1, seededAt: new Date().toISOString(), users: [], warehouses: [], products: [], stockLevels: [], movements: [], auditLogs: [], sessions: {} };
  const meta = { ipAddress: '10.0.0.12', userAgent: 'StockSense Seed' };
  const audit = (a: Omit<AuditRec, 'id' | 'ipAddress' | 'userAgent'>) => db.auditLogs.push({ id: uid(), ...meta, ...a });

  for (const u of seedUsers) {
    const created = atDay(HISTORY_DAYS + 5, 9, 0);
    db.users.push({ id: uid(), name: u.name, email: u.email, role: u.role, isActive: u.isActive, tokenVersion: 0, lastLoginAt: null, createdAt: created, updatedAt: created, ...newPasswordRecord(u.defaultPassword) });
  }
  const admin = db.users.find((u) => u.role === 'ADMIN')!;
  const manager = db.users.find((u) => u.role === 'MANAGER')!;
  const staff = db.users.find((u) => u.role === 'STAFF' && u.isActive)!;

  for (const u of db.users.filter((x) => x.role !== 'ADMIN')) {
    audit({ userId: admin.id, action: 'USER_CREATED', entityType: 'User', entityId: u.id, details: { name: u.name, email: u.email, role: u.role }, createdAt: atDay(HISTORY_DAYS + 4, 10, between(0, 59)) });
    if (!u.isActive) audit({ userId: admin.id, action: 'USER_DEACTIVATED', entityType: 'User', entityId: u.id, details: { email: u.email }, createdAt: atDay(6, 11, 15) });
  }

  for (const w of seedWarehouses) {
    const created = atDay(HISTORY_DAYS + 3, 9, 30);
    const rec: WarehouseRec = { id: uid(), code: w.code, name: w.name, city: w.city, address: w.address, capacity: w.capacity, isActive: true, createdAt: created, updatedAt: created };
    db.warehouses.push(rec);
    audit({ userId: admin.id, action: 'WAREHOUSE_CREATED', entityType: 'Warehouse', entityId: rec.id, details: { code: rec.code, name: rec.name, city: rec.city }, createdAt: created });
  }
  const warehouses = db.warehouses;

  const products = seedProducts.map((p) => {
    const created = atDay(HISTORY_DAYS + 1, 10, between(0, 59));
    const rec: ProductRec = { id: uid(), sku: p.sku, name: p.name, description: p.description, category: p.category, unit: p.unit, unitPrice: p.unitPrice, reorderLevel: p.reorderLevel, isActive: p.isActive ?? true, createdAt: created, updatedAt: created };
    db.products.push(rec);
    audit({ userId: manager.id, action: 'PRODUCT_CREATED', entityType: 'Product', entityId: rec.id, details: { sku: rec.sku, name: rec.name, category: rec.category, unitPrice: p.unitPrice, reorderLevel: p.reorderLevel }, createdAt: created });
    return { rec, spec: p };
  });

  const qty = new Map<string, number>();
  const key = (p: string, w: string) => `${p}:${w}`;
  type Planned = MovementRec & { details: Record<string, unknown> };
  const planned: Planned[] = [];
  let po = 4100;
  let inv = 9800;
  let tr = 300;

  const plan = (m: Omit<MovementRec, 'id'> & { sku: string }) => {
    const wFrom = warehouses.find((w) => w.id === m.fromWarehouseId);
    const wTo = warehouses.find((w) => w.id === m.toWarehouseId);
    let details: Record<string, unknown>;
    if (m.type === 'STOCK_IN') {
      const after = (qty.get(key(m.productId, m.toWarehouseId!)) ?? 0) + m.quantity;
      qty.set(key(m.productId, m.toWarehouseId!), after);
      details = { productId: m.productId, sku: m.sku, warehouseId: wTo!.id, warehouse: wTo!.code, quantity: m.quantity, reference: m.reference, balanceAfter: after };
    } else if (m.type === 'STOCK_OUT') {
      const after = (qty.get(key(m.productId, m.fromWarehouseId!)) ?? 0) - m.quantity;
      qty.set(key(m.productId, m.fromWarehouseId!), after);
      details = { productId: m.productId, sku: m.sku, warehouseId: wFrom!.id, warehouse: wFrom!.code, quantity: m.quantity, reference: m.reference, balanceAfter: after };
    } else {
      const fromAfter = (qty.get(key(m.productId, m.fromWarehouseId!)) ?? 0) - m.quantity;
      const toAfter = (qty.get(key(m.productId, m.toWarehouseId!)) ?? 0) + m.quantity;
      qty.set(key(m.productId, m.fromWarehouseId!), fromAfter);
      qty.set(key(m.productId, m.toWarehouseId!), toAfter);
      details = { productId: m.productId, sku: m.sku, fromWarehouseId: wFrom!.id, from: wFrom!.code, toWarehouseId: wTo!.id, to: wTo!.code, quantity: m.quantity, reference: m.reference, fromBalanceAfter: fromAfter, toBalanceAfter: toAfter };
    }
    const { sku: _sku, ...rest } = m;
    void _sku;
    planned.push({ ...rest, id: uid(), details });
  };

  for (const { rec, spec } of products) {
    spec.opening.forEach((q, idx) => {
      if (q <= 0) return;
      plan({ type: 'STOCK_IN', productId: rec.id, sku: rec.sku, fromWarehouseId: null, toWarehouseId: warehouses[idx]!.id, quantity: q, reference: `PO-${po++}`, notes: `Opening stock from ${pick(suppliers)}`, performedById: staff.id, createdAt: atDay(HISTORY_DAYS, 9 + idx, between(0, 59)) });
    });
  }

  for (let day = HISTORY_DAYS - 1; day >= 0; day--) {
    for (const { rec, spec } of products) {
      if (spec.demand <= 0 || spec.isActive === false) continue;
      const lowByDesign = spec.opening.reduce((a, b) => a + b, 0) < spec.reorderLevel * 2;

      if (rand() < spec.demand * 0.55) {
        const w = pick(warehouses);
        const onHand = qty.get(key(rec.id, w.id)) ?? 0;
        const want = Math.max(1, Math.round(onHand * (0.04 + rand() * 0.08)));
        if (onHand > 0 && want <= onHand) {
          plan({ type: 'STOCK_OUT', productId: rec.id, sku: rec.sku, fromWarehouseId: w.id, toWarehouseId: null, quantity: want, reference: `INV-${inv++}`, notes: `Dispatched to ${pick(customers)}`, performedById: rand() < 0.8 ? staff.id : manager.id, createdAt: atDay(day, between(10, 17), between(0, 59)) });
        }
      }

      if (!lowByDesign && rand() < 0.45) {
        for (const w of warehouses) {
          const onHand = qty.get(key(rec.id, w.id)) ?? 0;
          const target = spec.opening[warehouses.indexOf(w)]!;
          if (target > 0 && onHand < target * 0.7) {
            plan({ type: 'STOCK_IN', productId: rec.id, sku: rec.sku, fromWarehouseId: null, toWarehouseId: w.id, quantity: Math.round(target * (0.4 + rand() * 0.3)), reference: `PO-${po++}`, notes: `Replenishment from ${pick(suppliers)}`, performedById: staff.id, createdAt: atDay(day, between(8, 10), between(0, 59)) });
            break;
          }
        }
      }

      if (rand() < 0.06) {
        const from = warehouses[0]!;
        const to = rand() < 0.5 ? warehouses[1]! : warehouses[2]!;
        const move = Math.round((qty.get(key(rec.id, from.id)) ?? 0) * 0.15);
        if (move >= 1) {
          plan({ type: 'TRANSFER', productId: rec.id, sku: rec.sku, fromWarehouseId: from.id, toWarehouseId: to.id, quantity: move, reference: `TRF-${tr++}`, notes: `Stock balancing ${from.city} to ${to.city}`, performedById: manager.id, createdAt: atDay(day, between(11, 16), between(0, 59)) });
        }
      }
    }
  }

  planned.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const { details, ...m } of planned) {
    db.movements.push(m);
    audit({ userId: m.performedById, action: m.type === 'TRANSFER' ? 'STOCK_TRANSFER' : m.type, entityType: 'StockMovement', entityId: m.id, details, createdAt: m.createdAt });
  }

  const now = new Date().toISOString();
  for (const { rec } of products) {
    for (const w of warehouses) {
      const q = qty.get(key(rec.id, w.id));
      if (q !== undefined) db.stockLevels.push({ id: uid(), productId: rec.id, warehouseId: w.id, quantity: q, updatedAt: now });
    }
  }

  for (let d = 5; d >= 0; d--) {
    for (const u of [admin, manager, staff]) audit({ userId: u.id, action: 'AUTH_LOGIN', entityType: 'User', entityId: u.id, details: {}, createdAt: atDay(d, 8, between(30, 59)) });
  }
  db.auditLogs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return db;
}
