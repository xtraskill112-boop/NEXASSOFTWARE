/**
 * Firebase edition data layer: implements the StockSense REST contract on top of
 * Firebase Authentication + Cloud Firestore, so every screen of the app works unchanged.
 *
 *  - Reads: small collections (users, warehouses, products, stock_levels) are kept in a live
 *    in-memory cache via Firestore listeners; ledger/audit history is queried by date window.
 *    Responses are produced by the same route logic as the standalone edition (runReadRoute).
 *  - Writes: Firestore transactions / batched writes. Stock operations read the current balance
 *    inside a transaction (automatic retry on concurrent change) and refuse with 409 when stock
 *    is insufficient. firebase/firestore.rules enforces the same rules server-side.
 */
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAuth,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  type Auth,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  terminate,
  Timestamp,
  where,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';
import { z } from 'zod';
import type { LocalApi } from '@/lib/localApi';
import { getFirebaseConfig, usesEmulator, type FirebaseWebConfig } from './config';
import {
  HttpError,
  S,
  badRequest,
  conflict,
  errorResponse,
  forbidden,
  insufficient,
  notFound,
  permissionsFor,
  productDetail,
  publicUser,
  requirePerm,
  runReadRoute,
  serializeMovement,
  unauthorized,
  warehouseDetail,
  warehouseWithStats,
  type LocalResponse,
} from '@/standalone/server';
import type { AuditRec, DB, MovementRec, ProductRec, Role, StockLevelRec, UserRec, WarehouseRec } from '@/standalone/store';
import { seedProducts, seedWarehouses } from '@/standalone/seedData';

const SESSION_TOKEN = 'firebase-session';
const HISTORY_DAYS = 90;
const HISTORY_LIMIT = 5000;

/* ------------------------------------------------------------------------- */
/* Firebase initialisation                                                   */
/* ------------------------------------------------------------------------- */

interface Fb {
  config: FirebaseWebConfig;
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}
let fb: Fb | null = null;

function firebase(): Fb {
  if (fb) return fb;
  const config = getFirebaseConfig();
  if (!config) throw new HttpError(503, 'FIREBASE_NOT_CONFIGURED', 'Firebase is not configured yet. Connect a Firebase project first.');
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  if (usesEmulator(config)) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8085);
  }
  fb = { config, app, auth, db };
  return fb;
}

/**
 * Fully resets the Firebase client after a session ends. Recreating the app and Firestore
 * instance guarantees the next user starts from a clean state (no stale listeners or caches).
 */
async function resetFirebase() {
  stopCache();
  const current = fb;
  fb = null;
  if (!current) return;
  await signOut(current.auth).catch(() => undefined);
  await terminate(current.db).catch(() => undefined);
  await deleteApp(current.app).catch(() => undefined);
}

/* ------------------------------------------------------------------------- */
/* Live cache of the small collections                                       */
/* ------------------------------------------------------------------------- */

const iso = (v: unknown, fallback: string | null = new Date().toISOString()): string | null => {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (typeof v === 'string') return v;
  return fallback;
};

const toUser = (id: string, d: DocumentData): UserRec => ({
  id,
  name: d.name,
  email: d.email,
  role: d.role,
  isActive: d.isActive === true,
  lastLoginAt: iso(d.lastLoginAt, null),
  createdAt: iso(d.createdAt)!,
  updatedAt: iso(d.updatedAt)!,
  passwordHash: '',
  salt: '',
  tokenVersion: 0,
});
const toWarehouse = (id: string, d: DocumentData): WarehouseRec => ({
  id,
  code: d.code,
  name: d.name,
  city: d.city,
  address: d.address ?? null,
  capacity: d.capacity ?? null,
  isActive: d.isActive === true,
  createdAt: iso(d.createdAt)!,
  updatedAt: iso(d.updatedAt)!,
});
const toProduct = (id: string, d: DocumentData): ProductRec => ({
  id,
  sku: d.sku,
  name: d.name,
  description: d.description ?? null,
  category: d.category,
  unit: d.unit,
  unitPrice: Number(d.unitPrice),
  reorderLevel: d.reorderLevel,
  isActive: d.isActive === true,
  createdAt: iso(d.createdAt)!,
  updatedAt: iso(d.updatedAt)!,
});
const toLevel = (id: string, d: DocumentData): StockLevelRec => ({ id, productId: d.productId, warehouseId: d.warehouseId, quantity: d.quantity, updatedAt: iso(d.updatedAt)! });
const toMovement = (id: string, d: DocumentData): MovementRec => ({
  id,
  type: d.type,
  productId: d.productId,
  fromWarehouseId: d.fromWarehouseId ?? null,
  toWarehouseId: d.toWarehouseId ?? null,
  quantity: d.quantity,
  reference: d.reference ?? null,
  notes: d.notes ?? null,
  performedById: d.performedById,
  createdAt: iso(d.createdAt)!,
});
const toAudit = (id: string, d: DocumentData): AuditRec => ({
  id,
  userId: d.userId ?? null,
  action: d.action,
  entityType: d.entityType,
  entityId: d.entityId ?? null,
  details: d.details ?? null,
  ipAddress: d.ipAddress ?? null,
  userAgent: d.userAgent ?? null,
  createdAt: iso(d.createdAt)!,
});

const cache = {
  users: new Map<string, UserRec>(),
  warehouses: new Map<string, WarehouseRec>(),
  products: new Map<string, ProductRec>(),
  levels: new Map<string, StockLevelRec>(),
  unsubscribers: [] as (() => void)[],
  ready: null as Promise<void> | null,
  history: new Map<string, { at: number; data: unknown[] }>(),
};

function startCache(): Promise<void> {
  if (cache.ready) return cache.ready;
  const { db } = firebase();
  const sources = [
    ['users', cache.users, toUser],
    ['warehouses', cache.warehouses, toWarehouse],
    ['products', cache.products, toProduct],
    ['stock_levels', cache.levels, toLevel],
  ] as const;
  cache.ready = Promise.all(
    sources.map(
      ([name, map, convert]) =>
        new Promise<void>((resolve, reject) => {
          const unsub = onSnapshot(
            collection(db, name),
            (snap) => {
              const target = map as Map<string, unknown>;
              target.clear();
              snap.forEach((d) => target.set(d.id, (convert as (id: string, d: DocumentData) => unknown)(d.id, d.data({ serverTimestamps: 'estimate' }))));
              resolve();
            },
            (err) => {
              // e.g. permission lost after deactivation: drop the cache so the next request re-checks the profile.
              reject(err);
              stopCache();
            },
          );
          cache.unsubscribers.push(unsub);
        }),
    ),
  ).then(() => undefined);
  cache.ready.catch(() => stopCache());
  return cache.ready;
}

function stopCache() {
  cache.unsubscribers.forEach((u) => u());
  cache.unsubscribers = [];
  cache.ready = null;
  cache.users.clear();
  cache.warehouses.clear();
  cache.products.clear();
  cache.levels.clear();
  cache.history.clear();
}

/** Ledger / audit history for a date window (cached briefly; cleared after every write). */
async function history<T>(name: 'movements' | 'audit_logs', from: Date | undefined, to: Date | undefined, convert: (id: string, d: DocumentData) => T): Promise<T[]> {
  const start = from ?? new Date(Date.now() - HISTORY_DAYS * 86_400_000);
  const key = `${name}|${start.toISOString()}|${to?.toISOString() ?? ''}`;
  const hit = cache.history.get(key);
  if (hit && Date.now() - hit.at < 10_000) return hit.data as T[];
  const { db } = firebase();
  const constraints = [where('createdAt', '>=', Timestamp.fromDate(start)), ...(to ? [where('createdAt', '<=', Timestamp.fromDate(to))] : []), orderBy('createdAt', 'desc'), limit(HISTORY_LIMIT)];
  const snap = await getDocs(query(collection(db, name), ...constraints));
  const data = snap.docs.map((d) => convert(d.id, d.data({ serverTimestamps: 'estimate' })));
  cache.history.set(key, { at: Date.now(), data });
  return data;
}

async function recentAudit(count: number): Promise<AuditRec[]> {
  const { db } = firebase();
  const snap = await getDocs(query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'), limit(count)));
  return snap.docs.map((d) => toAudit(d.id, d.data({ serverTimestamps: 'estimate' })));
}

function snapshotDb(movements: MovementRec[] = [], auditLogs: AuditRec[] = []): DB {
  return {
    version: 1,
    seededAt: '',
    users: [...cache.users.values()],
    warehouses: [...cache.warehouses.values()],
    products: [...cache.products.values()],
    stockLevels: [...cache.levels.values()],
    movements,
    auditLogs,
    sessions: {},
  };
}

/** Movement history presented as activity entries (for roles that may not read the audit log). */
function movementsAsActivity(db: DB): AuditRec[] {
  return db.movements.map((m) => {
    const p = db.products.find((x) => x.id === m.productId);
    const from = db.warehouses.find((w) => w.id === m.fromWarehouseId);
    const to = db.warehouses.find((w) => w.id === m.toWarehouseId);
    return {
      id: `mv-${m.id}`,
      userId: m.performedById,
      action: m.type === 'TRANSFER' ? 'STOCK_TRANSFER' : m.type,
      entityType: 'StockMovement',
      entityId: m.id,
      details: { sku: p?.sku, quantity: m.quantity, warehouse: (to ?? from)?.code, from: from?.code, to: to?.code },
      ipAddress: null,
      userAgent: null,
      createdAt: m.createdAt,
    };
  });
}

/* ------------------------------------------------------------------------- */
/* Session & helpers                                                         */
/* ------------------------------------------------------------------------- */

async function currentUser(): Promise<UserRec> {
  const { auth } = firebase();
  await auth.authStateReady();
  const fbUser = auth.currentUser;
  if (!fbUser) throw unauthorized('Please sign in.');
  const endSession = async (message: string) => {
    await resetFirebase();
    return unauthorized(message);
  };
  if (!cache.ready) {
    // Own profile is always readable, even when deactivated, so check it before subscribing.
    const snap = await getDoc(doc(firebase().db, 'users', fbUser.uid));
    if (!snap.exists()) throw await endSession('This account has no StockSense profile. Ask an administrator to add you.');
    if (snap.data().isActive !== true) throw await endSession('Your account has been deactivated. Contact an administrator.');
  }
  try {
    await startCache();
  } catch (err) {
    if ((err as { code?: string }).code === 'permission-denied') throw await endSession('Your session is no longer valid. Please sign in again.');
    throw err;
  }
  const profile = cache.users.get(fbUser.uid);
  if (!profile || !profile.isActive) {
    throw await endSession(profile ? 'Your account has been deactivated. Contact an administrator.' : 'This account has no StockSense profile. Ask an administrator to add you.');
  }
  return profile;
}

const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 255) : null;

function auditData(user: UserRec, action: string, entityType: string, entityId: string | null, details: Record<string, unknown> | null) {
  return { userId: user.id, action, entityType, entityId, details: details ? JSON.parse(JSON.stringify(details)) : null, ipAddress: null, userAgent, createdAt: serverTimestamp() };
}

/** Anything that can stage a document write: a WriteBatch or a Transaction. */
type Writer = { set(ref: DocumentReference, data: DocumentData): unknown };

function addAudit(w: Writer, user: UserRec, action: string, entityType: string, entityId: string | null, details: Record<string, unknown> | null) {
  const { db } = firebase();
  w.set(doc(collection(db, 'audit_logs')), auditData(user, action, entityType, entityId, details));
}

async function writeAudit(user: UserRec, action: string, entityType: string, entityId: string | null, details: Record<string, unknown> | null) {
  const b = writeBatch(firebase().db);
  addAudit(b, user, action, entityType, entityId, details);
  await b.commit();
}

const ok = (body: unknown, status = 200): LocalResponse => ({ status, body });

function idParam(path: string, prefix: string, suffix = ''): string {
  const id = path.slice(prefix.length, suffix ? -suffix.length : undefined);
  return z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/, 'Invalid id').parse(id);
}

function sessionUser(u: UserRec) {
  return { ...publicUser(u), permissions: permissionsFor(u.role) };
}

/* ------------------------------------------------------------------------- */
/* Inventory operations                                                      */
/* ------------------------------------------------------------------------- */

function activeProduct(id: string) {
  const p = cache.products.get(id);
  if (!p) throw notFound('Product');
  if (!p.isActive) throw conflict(`Product ${p.sku} is inactive. Activate it before moving stock.`);
  return p;
}
function activeWarehouse(id: string, label = 'Warehouse') {
  const w = cache.warehouses.get(id);
  if (!w) throw notFound(label);
  if (!w.isActive) throw conflict(`${label} ${w.code} is inactive`);
  return w;
}

interface MovementInput {
  type: MovementRec['type'];
  productId: string;
  fromWarehouseId: string | null;
  toWarehouseId: string | null;
  quantity: number;
  reference: string | null;
  notes: string | null;
}

/**
 * Applies one stock movement atomically: reads the affected balances inside a Firestore
 * transaction, refuses with 409 if stock would go negative, then writes the new balances,
 * the ledger movement and the audit entry together.
 */
async function applyMovement(user: UserRec, input: MovementInput) {
  const { db } = firebase();
  const p = cache.products.get(input.productId)!;
  const movementRef = doc(collection(db, 'movements'));
  const levelRef = (warehouseId: string) => doc(db, 'stock_levels', `${input.productId}_${warehouseId}`);
  const fromW = input.fromWarehouseId ? cache.warehouses.get(input.fromWarehouseId)! : null;
  const toW = input.toWarehouseId ? cache.warehouses.get(input.toWarehouseId)! : null;

  try {
    const balances = await runTransaction(db, async (tx) => {
      const fromSnap = fromW ? await tx.get(levelRef(fromW.id)) : null;
      const toSnap = toW ? await tx.get(levelRef(toW.id)) : null;
      const out: { warehouseId: string; warehouseCode: string; quantity: number }[] = [];

      if (fromW) {
        const available = fromSnap?.exists() ? (fromSnap.data().quantity as number) : 0;
        if (available < input.quantity) throw insufficient({ available, requested: input.quantity, productId: p.id, warehouseId: fromW.id });
        const quantity = available - input.quantity;
        tx.set(levelRef(fromW.id), { productId: p.id, warehouseId: fromW.id, quantity, lastMovementId: movementRef.id, updatedAt: serverTimestamp() });
        out.push({ warehouseId: fromW.id, warehouseCode: fromW.code, quantity });
      }
      if (toW) {
        const before = toSnap?.exists() ? (toSnap.data().quantity as number) : 0;
        const quantity = before + input.quantity;
        tx.set(levelRef(toW.id), { productId: p.id, warehouseId: toW.id, quantity, lastMovementId: movementRef.id, updatedAt: serverTimestamp() });
        out.push({ warehouseId: toW.id, warehouseCode: toW.code, quantity });
      }

      tx.set(movementRef, {
        type: input.type,
        productId: p.id,
        fromWarehouseId: input.fromWarehouseId,
        toWarehouseId: input.toWarehouseId,
        quantity: input.quantity,
        reference: input.reference,
        notes: input.notes,
        performedById: user.id,
        createdAt: serverTimestamp(),
      });

      const details: Record<string, unknown> =
        input.type === 'TRANSFER'
          ? { productId: p.id, sku: p.sku, fromWarehouseId: fromW!.id, from: fromW!.code, toWarehouseId: toW!.id, to: toW!.code, quantity: input.quantity, reference: input.reference, fromBalanceAfter: out[0]!.quantity, toBalanceAfter: out[1]!.quantity }
          : { productId: p.id, sku: p.sku, warehouseId: (fromW ?? toW)!.id, warehouse: (fromW ?? toW)!.code, quantity: input.quantity, reference: input.reference, balanceAfter: out[0]!.quantity };
      addAudit(tx, user, input.type === 'TRANSFER' ? 'STOCK_TRANSFER' : input.type, 'StockMovement', movementRef.id, details);
      return out;
    });

    // Reflect the committed balances immediately (listeners will confirm shortly).
    for (const b of balances) {
      const id = `${p.id}_${b.warehouseId}`;
      cache.levels.set(id, { id, productId: p.id, warehouseId: b.warehouseId, quantity: b.quantity, updatedAt: new Date().toISOString() });
    }
    cache.history.clear();
    const movement: MovementRec = { id: movementRef.id, ...input, performedById: user.id, createdAt: new Date().toISOString() };
    return { movement: serializeMovement(snapshotDb(), movement), stockLevels: balances };
  } catch (err) {
    if (err instanceof HttpError && err.code === 'INSUFFICIENT_STOCK') {
      await writeAudit(user, 'STOCK_OPERATION_REJECTED', 'StockMovement', null, {
        type: input.type,
        reason: 'INSUFFICIENT_STOCK',
        sku: p.sku,
        ...(fromW ? { warehouse: fromW.code, from: fromW.code } : {}),
        ...(toW ? { to: toW.code } : {}),
        ...(err.details as Record<string, unknown>),
      }).catch(() => undefined);
    }
    throw err;
  }
}

/* ------------------------------------------------------------------------- */
/* Write handlers                                                            */
/* ------------------------------------------------------------------------- */

async function createProduct(user: UserRec, body: unknown, opts: { respond?: boolean } = {}) {
  requirePerm(user, 'products:create');
  const input = S.createProduct.parse(body);
  const { db } = firebase();
  const opening = input.openingStock ?? [];
  for (const o of opening) activeWarehouse(o.warehouseId);
  if (opening.length && !input.isActive) throw badRequest('Opening stock cannot be added to an inactive product');

  const ref = doc(collection(db, 'products'));
  const data = {
    sku: input.sku,
    name: input.name,
    description: input.description ?? null,
    category: input.category,
    unit: input.unit,
    unitPrice: input.unitPrice,
    reorderLevel: input.reorderLevel,
    isActive: input.isActive,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await runTransaction(db, async (tx) => {
    const skuSnap = await tx.get(doc(db, 'product_skus', input.sku));
    if (skuSnap.exists()) throw conflict(`A product with SKU ${input.sku} already exists`);
    tx.set(ref, data);
    tx.set(doc(db, 'product_skus', input.sku), { productId: ref.id });
    addAudit(tx, user, 'PRODUCT_CREATED', 'Product', ref.id, { sku: input.sku, name: input.name, category: input.category, unitPrice: input.unitPrice, reorderLevel: input.reorderLevel, openingStock: opening });
  });
  cache.products.set(ref.id, toProduct(ref.id, { ...data, createdAt: null, updatedAt: null }));
  for (const o of opening) {
    await applyMovement(user, { type: 'STOCK_IN', productId: ref.id, fromWarehouseId: null, toWarehouseId: o.warehouseId, quantity: o.quantity, reference: 'OPENING-STOCK', notes: 'Opening stock on product creation' });
  }
  if (opts.respond === false) return ok({ data: { id: ref.id } }, 201);
  return ok({ data: productDetail(snapshotDb(await history('movements', undefined, undefined, toMovement)), ref.id) }, 201);
}

async function updateProduct(user: UserRec, id: string, body: unknown) {
  requirePerm(user, 'products:update');
  const input = S.updateProduct.parse(body);
  const { db } = firebase();
  const current = cache.products.get(id);
  if (!current) throw notFound('Product');
  const next = { ...current, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) } as ProductRec;
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of ['sku', 'name', 'description', 'category', 'unit', 'unitPrice', 'reorderLevel'] as const) {
    if (input[k] !== undefined && input[k] !== current[k]) changes[k] = { from: current[k], to: input[k] };
  }
  await runTransaction(db, async (tx) => {
    if (next.sku !== current.sku) {
      const skuSnap = await tx.get(doc(db, 'product_skus', next.sku));
      if (skuSnap.exists()) throw conflict(`A product with SKU ${next.sku} already exists`);
      tx.set(doc(db, 'product_skus', next.sku), { productId: id });
      tx.delete(doc(db, 'product_skus', current.sku));
    }
    tx.update(doc(db, 'products', id), {
      sku: next.sku,
      name: next.name,
      description: next.description,
      category: next.category,
      unit: next.unit,
      unitPrice: next.unitPrice,
      reorderLevel: next.reorderLevel,
      updatedAt: serverTimestamp(),
    });
    addAudit(tx, user, 'PRODUCT_UPDATED', 'Product', id, { sku: next.sku, changes });
  });
  cache.products.set(id, { ...next, updatedAt: new Date().toISOString() });
  return ok({ data: productDetail(snapshotDb(await history('movements', undefined, undefined, toMovement)), id) });
}

async function setProductStatus(user: UserRec, id: string, body: unknown) {
  requirePerm(user, 'products:deactivate');
  const { isActive } = S.status.parse(body);
  const current = cache.products.get(id);
  if (!current) throw notFound('Product');
  const b = writeBatch(firebase().db);
  b.update(doc(firebase().db, 'products', id), { isActive, updatedAt: serverTimestamp() });
  addAudit(b, user, isActive ? 'PRODUCT_ACTIVATED' : 'PRODUCT_DEACTIVATED', 'Product', id, { sku: current.sku, previous: current.isActive });
  await b.commit();
  cache.products.set(id, { ...current, isActive, updatedAt: new Date().toISOString() });
  return ok({ data: productDetail(snapshotDb(await history('movements', undefined, undefined, toMovement)), id) });
}

async function deleteProduct(user: UserRec, id: string) {
  requirePerm(user, 'products:delete');
  const { db } = firebase();
  const current = cache.products.get(id);
  if (!current) throw notFound('Product');
  const anyMovement = await getDocs(query(collection(db, 'movements'), where('productId', '==', id), limit(1)));
  const onHand = [...cache.levels.values()].filter((l) => l.productId === id).reduce((s, l) => s + l.quantity, 0);
  if (!anyMovement.empty || onHand > 0) {
    throw conflict('This product has stock or movement history and cannot be permanently deleted. Deactivate it instead.', { movements: anyMovement.size, onHand });
  }
  const b = writeBatch(db);
  b.delete(doc(db, 'products', id));
  b.delete(doc(db, 'product_skus', current.sku));
  addAudit(b, user, 'PRODUCT_DELETED', 'Product', id, { sku: current.sku, name: current.name });
  await b.commit();
  cache.products.delete(id);
  return { status: 204 };
}

async function createWarehouse(user: UserRec, body: unknown) {
  requirePerm(user, 'warehouses:manage');
  const input = S.createWarehouse.parse(body);
  const { db } = firebase();
  const ref = doc(collection(db, 'warehouses'));
  const data = { code: input.code, name: input.name, city: input.city, address: input.address ?? null, capacity: input.capacity ?? null, isActive: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  await runTransaction(db, async (tx) => {
    const codeSnap = await tx.get(doc(db, 'warehouse_codes', input.code));
    if (codeSnap.exists()) throw conflict(`A warehouse with code ${input.code} already exists`);
    tx.set(ref, data);
    tx.set(doc(db, 'warehouse_codes', input.code), { warehouseId: ref.id });
    addAudit(tx, user, 'WAREHOUSE_CREATED', 'Warehouse', ref.id, { code: input.code, name: input.name, city: input.city });
  });
  const rec = toWarehouse(ref.id, { ...data, createdAt: null, updatedAt: null });
  cache.warehouses.set(ref.id, rec);
  return ok({ data: warehouseWithStats(snapshotDb(), rec) }, 201);
}

async function updateWarehouse(user: UserRec, id: string, body: unknown) {
  requirePerm(user, 'warehouses:manage');
  const input = S.updateWarehouse.parse(body);
  const { db } = firebase();
  const current = cache.warehouses.get(id);
  if (!current) throw notFound('Warehouse');
  const next = { ...current, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) } as WarehouseRec;
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of ['code', 'name', 'city', 'address', 'capacity'] as const) {
    if (input[k] !== undefined && input[k] !== current[k]) changes[k] = { from: current[k], to: input[k] };
  }
  await runTransaction(db, async (tx) => {
    if (next.code !== current.code) {
      const codeSnap = await tx.get(doc(db, 'warehouse_codes', next.code));
      if (codeSnap.exists()) throw conflict(`A warehouse with code ${next.code} already exists`);
      tx.set(doc(db, 'warehouse_codes', next.code), { warehouseId: id });
      tx.delete(doc(db, 'warehouse_codes', current.code));
    }
    tx.update(doc(db, 'warehouses', id), { code: next.code, name: next.name, city: next.city, address: next.address, capacity: next.capacity, updatedAt: serverTimestamp() });
    addAudit(tx, user, 'WAREHOUSE_UPDATED', 'Warehouse', id, { code: next.code, changes });
  });
  cache.warehouses.set(id, { ...next, updatedAt: new Date().toISOString() });
  return ok({ data: warehouseDetail(snapshotDb(await history('movements', undefined, undefined, toMovement)), id) });
}

async function setWarehouseStatus(user: UserRec, id: string, body: unknown) {
  requirePerm(user, 'warehouses:manage');
  const { isActive } = S.status.parse(body);
  const current = cache.warehouses.get(id);
  if (!current) throw notFound('Warehouse');
  if (!isActive) {
    const onHand = [...cache.levels.values()].filter((l) => l.warehouseId === id).reduce((s, l) => s + l.quantity, 0);
    if (onHand > 0) throw conflict(`Warehouse ${current.code} still holds ${onHand} units. Transfer or issue all stock before deactivating it.`, { onHand });
  }
  const b = writeBatch(firebase().db);
  b.update(doc(firebase().db, 'warehouses', id), { isActive, updatedAt: serverTimestamp() });
  addAudit(b, user, isActive ? 'WAREHOUSE_ACTIVATED' : 'WAREHOUSE_DEACTIVATED', 'Warehouse', id, { code: current.code });
  await b.commit();
  cache.warehouses.set(id, { ...current, isActive, updatedAt: new Date().toISOString() });
  return ok({ data: warehouseDetail(snapshotDb(await history('movements', undefined, undefined, toMovement)), id) });
}

function assertNotLastAdmin(userId: string) {
  if (![...cache.users.values()].some((u) => u.role === 'ADMIN' && u.isActive && u.id !== userId)) throw conflict('At least one active administrator must remain in the system');
}

async function createUser(user: UserRec, body: unknown) {
  requirePerm(user, 'users:manage');
  const input = S.createUser.parse(body);
  if ([...cache.users.values()].some((u) => u.email === input.email)) throw conflict('A user with this email already exists');
  const { config, db } = firebase();
  // A secondary app instance creates the account without signing the administrator out.
  const secondary = initializeApp(config, `stocksense-user-admin-${Date.now()}`);
  const secondaryAuth = getAuth(secondary);
  if (usesEmulator(config)) connectAuthEmulator(secondaryAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  let uid: string;
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, input.email, input.password);
    uid = cred.user.uid;
    await signOut(secondaryAuth);
  } finally {
    await deleteApp(secondary).catch(() => undefined);
  }
  const profile = { name: input.name, email: input.email, role: input.role, isActive: true, lastLoginAt: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  const b = writeBatch(db);
  b.set(doc(db, 'users', uid), profile);
  addAudit(b, user, 'USER_CREATED', 'User', uid, { name: input.name, email: input.email, role: input.role });
  await b.commit();
  const rec = toUser(uid, { ...profile, createdAt: null, updatedAt: null });
  cache.users.set(uid, rec);
  return ok({ data: publicUser(rec) }, 201);
}

async function updateUser(user: UserRec, id: string, body: unknown) {
  requirePerm(user, 'users:manage');
  const input = S.updateUser.parse(body);
  const current = cache.users.get(id);
  if (!current) throw notFound('User');
  if (input.email && input.email !== current.email) {
    throw badRequest('Email addresses are the sign-in identity in the Firebase edition and cannot be changed. Create a new user instead.', [{ path: 'email', message: 'Email cannot be changed' }]);
  }
  if (input.role && input.role !== current.role) {
    if (id === user.id) throw conflict('You cannot change your own role');
    if (current.role === 'ADMIN') assertNotLastAdmin(id);
  }
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of ['name', 'role'] as const) if (input[k] !== undefined && input[k] !== current[k]) changes[k] = { from: current[k], to: input[k] };
  const name = input.name ?? current.name;
  const role = (input.role ?? current.role) as Role;
  const b = writeBatch(firebase().db);
  b.update(doc(firebase().db, 'users', id), { name, role, updatedAt: serverTimestamp() });
  addAudit(b, user, 'USER_UPDATED', 'User', id, { changes });
  await b.commit();
  const rec = { ...current, name, role, updatedAt: new Date().toISOString() };
  cache.users.set(id, rec);
  return ok({ data: publicUser(rec) });
}

async function setUserStatus(user: UserRec, id: string, body: unknown) {
  requirePerm(user, 'users:manage');
  const { isActive } = S.status.parse(body);
  if (id === user.id && !isActive) throw conflict('You cannot deactivate your own account');
  const current = cache.users.get(id);
  if (!current) throw notFound('User');
  if (!isActive && current.role === 'ADMIN') assertNotLastAdmin(id);
  const b = writeBatch(firebase().db);
  b.update(doc(firebase().db, 'users', id), { isActive, updatedAt: serverTimestamp() });
  addAudit(b, user, isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', 'User', id, { email: current.email });
  await b.commit();
  const rec = { ...current, isActive, updatedAt: new Date().toISOString() };
  cache.users.set(id, rec);
  return ok({ data: publicUser(rec) });
}

async function resetUserPassword(user: UserRec, id: string) {
  requirePerm(user, 'users:manage');
  const target = cache.users.get(id);
  if (!target) throw notFound('User');
  await sendPasswordResetEmail(firebase().auth, target.email);
  await writeAudit(user, 'USER_PASSWORD_RESET', 'User', id, { email: target.email, method: 'reset-email' });
  return ok({ message: `A password reset email has been sent to ${target.email}.` });
}

/* ------------------------------------------------------------------------- */
/* Auth & setup                                                              */
/* ------------------------------------------------------------------------- */

async function finishSignIn(uid: string) {
  const { db } = firebase();
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) {
    await resetFirebase();
    throw unauthorized('This account has no StockSense profile. Ask an administrator to add you.');
  }
  const profile = toUser(uid, snap.data());
  if (!profile.isActive) {
    await resetFirebase();
    throw unauthorized('Your account has been deactivated. Contact an administrator.');
  }
  const b = writeBatch(db);
  b.update(doc(db, 'users', uid), { lastLoginAt: serverTimestamp(), updatedAt: serverTimestamp() });
  addAudit(b, profile, 'AUTH_LOGIN', 'User', uid, { email: profile.email });
  await b.commit();
  await startCache();
  const fresh = cache.users.get(uid) ?? profile;
  return { token: SESSION_TOKEN, expiresAt: null, user: sessionUser({ ...fresh, lastLoginAt: new Date().toISOString() }) };
}

async function login(body: unknown) {
  const { email, password } = S.login.parse(body);
  const cred = await signInWithEmailAndPassword(firebase().auth, email, password);
  return ok(await finishSignIn(cred.user.uid));
}

async function setupStatus() {
  const { db, config } = firebase();
  const snap = await getDoc(doc(db, 'config', 'setup'));
  return ok({ needsAdmin: !snap.exists(), projectId: config.projectId, emulator: usesEmulator(config) });
}

const setupAdminSchema = z.object({
  name: z.string({ error: 'Name is required' }).trim().min(2, 'Name must be at least 2 characters').max(120),
  email: S.createUser.shape.email,
  password: S.createUser.shape.password,
});

async function setupAdmin(body: unknown) {
  const input = setupAdminSchema.parse(body);
  const { db, auth } = firebase();
  const existing = await getDoc(doc(db, 'config', 'setup'));
  if (existing.exists()) throw conflict('Setup has already been completed. Sign in with an existing account.');
  const cred = await createUserWithEmailAndPassword(auth, input.email, input.password);
  const uid = cred.user.uid;
  const b = writeBatch(db);
  b.set(doc(db, 'users', uid), { name: input.name, email: input.email, role: 'ADMIN', isActive: true, lastLoginAt: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  b.set(doc(db, 'config', 'setup'), { adminUid: uid, createdAt: serverTimestamp() });
  try {
    await b.commit();
  } catch (err) {
    // Someone else completed setup first: remove the orphan account.
    await cred.user.delete().catch(() => undefined);
    throw err instanceof HttpError ? err : conflict('Setup has already been completed. Sign in with an existing account.');
  }
  const profile = toUser(uid, { name: input.name, email: input.email, role: 'ADMIN', isActive: true });
  await writeAudit(profile, 'USER_CREATED', 'User', uid, { name: input.name, email: input.email, role: 'ADMIN', setup: true });
  // The app then signs in through the normal login flow.
  return ok({ message: 'Administrator account created' }, 201);
}

async function loadDemoData(user: UserRec) {
  requirePerm(user, 'users:manage');
  const demoSkus = new Set(seedProducts.map((p) => p.sku));
  const existing = [...cache.products.values()];
  // Allowed on an empty catalogue, or to resume an interrupted demo load.
  if (existing.some((p) => !demoSkus.has(p.sku))) throw conflict('Demo data can only be loaded into an empty catalogue.');

  const warehouseIds: string[] = [];
  for (const w of seedWarehouses) {
    const found = [...cache.warehouses.values()].find((x) => x.code === w.code);
    if (found) {
      warehouseIds.push(found.id);
      continue;
    }
    const res = await createWarehouse(user, { code: w.code, name: w.name, city: w.city, address: w.address, capacity: w.capacity });
    warehouseIds.push((res.body as { data: { id: string } }).data.id);
  }

  let products = 0;
  let movements = 0;
  // One product at a time keeps the load predictable; each product is created together with its
  // opening stock receipts, so an interrupted load can simply be resumed.
  for (const p of seedProducts) {
    if ([...cache.products.values()].some((x) => x.sku === p.sku)) continue;
    const openingStock = (p.isActive ?? true) ? p.opening.map((quantity, i) => ({ warehouseId: warehouseIds[i]!, quantity })).filter((o) => o.quantity > 0) : [];
    await createProduct(
      user,
      {
        sku: p.sku,
        name: p.name,
        description: p.description,
        category: p.category,
        unit: p.unit,
        unitPrice: p.unitPrice,
        reorderLevel: p.reorderLevel,
        isActive: p.isActive ?? true,
        openingStock: openingStock.length ? openingStock : undefined,
      },
      { respond: false },
    );
    products += 1;
    movements += openingStock.length;
  }
  cache.history.clear();
  return ok({ message: 'Demo catalogue loaded', warehouses: warehouseIds.length, products, movements }, 201);
}

/* ------------------------------------------------------------------------- */
/* Reads                                                                     */
/* ------------------------------------------------------------------------- */

async function read(user: UserRec, path: string, q: Record<string, string>): Promise<LocalResponse> {
  const req = { method: 'GET', path, query: q, body: undefined, token: SESSION_TOKEN };
  const date = (v?: string) => (v ? new Date(v) : undefined);
  const canSeeAudit = permissionsFor(user.role).includes('audit:view');

  if (path === '/dashboard/summary') {
    const movements = await history('movements', new Date(Date.now() - 15 * 86_400_000), undefined, toMovement);
    const db = snapshotDb(movements);
    db.auditLogs = canSeeAudit ? await recentAudit(60) : movementsAsActivity(db);
    return runReadRoute(db, req, user);
  }
  if (path === '/inventory/movements') {
    return runReadRoute(snapshotDb(await history('movements', date(q.from), date(q.to), toMovement)), req, user);
  }
  if (path === '/audit-logs' || path === '/audit-logs/filters') {
    if (!canSeeAudit) throw forbidden(`Your role (${user.role}) is not allowed to perform this action`);
    return runReadRoute(snapshotDb([], await history('audit_logs', date(q.from), date(q.to), toAudit)), req, user);
  }
  if (/^\/(products|warehouses)\/[^/]+$/.test(path) && path !== '/products/categories') {
    return runReadRoute(snapshotDb(await history('movements', undefined, undefined, toMovement)), req, user);
  }
  return runReadRoute(snapshotDb(), req, user);
}

/* ------------------------------------------------------------------------- */
/* Error mapping & dispatch                                                  */
/* ------------------------------------------------------------------------- */

function mapFirebaseError(err: unknown): unknown {
  const code = (err as { code?: string })?.code ?? '';
  if (!code || err instanceof HttpError) return err;
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    case 'auth/user-disabled':
      return new HttpError(401, 'UNAUTHORIZED', 'This account has been disabled.');
    case 'auth/too-many-requests':
      return new HttpError(429, 'TOO_MANY_REQUESTS', 'Too many attempts. Please wait a few minutes and try again.');
    case 'auth/email-already-in-use':
      return conflict('A user with this email already exists', [{ path: 'email', message: 'Email already in use' }]);
    case 'auth/weak-password':
      return badRequest('Password is too weak', [{ path: 'password', message: 'Password is too weak' }]);
    case 'auth/requires-recent-login':
      return unauthorized('Please sign in again to continue.');
    case 'auth/network-request-failed':
    case 'unavailable':
      return new HttpError(503, 'NETWORK_ERROR', 'Cannot reach Firebase. Check your internet connection and try again.');
    case 'auth/operation-not-allowed':
      return new HttpError(503, 'FIREBASE_SETUP', 'Email/Password sign-in is not enabled for this Firebase project. Enable it in the Firebase console under Authentication > Sign-in method.');
    case 'permission-denied':
      return forbidden('Firebase security rules rejected this operation. Check that the StockSense rules are deployed and that your role allows it.');
    case 'failed-precondition':
    case 'not-found': {
      const message = String((err as { message?: string }).message ?? '');
      if (/database|datastore mode|does not exist/i.test(message)) {
        return new HttpError(503, 'FIREBASE_SETUP', 'Cloud Firestore is not set up for this Firebase project yet. Create a Firestore database (Native mode) in the Firebase console.');
      }
      return code === 'not-found' ? notFound() : new HttpError(503, 'FIREBASE_ERROR', `Firebase could not complete the request: ${message.slice(0, 200)}`);
    }
    case 'aborted':
      return conflict('Another user changed this data at the same time. Please retry.');
    default:
      return err;
  }
}

async function route(method: string, path: string, query: Record<string, string>, body: unknown): Promise<LocalResponse> {
  // Public endpoints
  if (method === 'GET' && path === '/setup/status') return setupStatus();
  if (method === 'POST' && path === '/setup/admin') return setupAdmin(body);
  if (method === 'POST' && path === '/auth/login') return login(body);
  if (method === 'GET' && path === '/health') return ok({ status: 'ok', service: 'stocksense-firebase', database: 'cloud-firestore', timestamp: new Date().toISOString() });

  const user = await currentUser();

  if (method === 'GET' && path === '/auth/me') return ok({ user: sessionUser(user) });
  if (method === 'POST' && path === '/auth/logout') {
    await writeAudit(user, 'AUTH_LOGOUT', 'User', user.id, null).catch(() => undefined);
    await resetFirebase();
    return { status: 204 };
  }
  if (method === 'POST' && path === '/auth/change-password') {
    const { currentPassword, newPassword } = S.changePassword.parse(body);
    const fbUser = firebase().auth.currentUser!;
    try {
      await reauthenticateWithCredential(fbUser, EmailAuthProvider.credential(user.email, currentPassword));
    } catch {
      throw badRequest('Current password is incorrect', [{ path: 'currentPassword', message: 'Current password is incorrect' }]);
    }
    await updatePassword(fbUser, newPassword);
    await writeAudit(user, 'AUTH_PASSWORD_CHANGED', 'User', user.id, null);
    return ok({ message: 'Password updated successfully', token: SESSION_TOKEN, expiresAt: null });
  }
  if (method === 'POST' && path === '/setup/demo-data') return loadDemoData(user);

  if (method === 'GET') return read(user, path, query);

  // Inventory
  if (method === 'POST' && path === '/inventory/stock-in') {
    requirePerm(user, 'inventory:stock-in');
    const i = S.stockMovement.parse(body);
    activeProduct(i.productId);
    activeWarehouse(i.warehouseId);
    return ok({ data: await applyMovement(user, { type: 'STOCK_IN', productId: i.productId, fromWarehouseId: null, toWarehouseId: i.warehouseId, quantity: i.quantity, reference: i.reference ?? null, notes: i.notes ?? null }) }, 201);
  }
  if (method === 'POST' && path === '/inventory/stock-out') {
    requirePerm(user, 'inventory:stock-out');
    const i = S.stockMovement.parse(body);
    activeProduct(i.productId);
    activeWarehouse(i.warehouseId);
    return ok({ data: await applyMovement(user, { type: 'STOCK_OUT', productId: i.productId, fromWarehouseId: i.warehouseId, toWarehouseId: null, quantity: i.quantity, reference: i.reference ?? null, notes: i.notes ?? null }) }, 201);
  }
  if (method === 'POST' && path === '/inventory/transfer') {
    requirePerm(user, 'inventory:transfer');
    const i = S.transfer.parse(body);
    activeProduct(i.productId);
    activeWarehouse(i.fromWarehouseId, 'Source warehouse');
    activeWarehouse(i.toWarehouseId, 'Destination warehouse');
    return ok({ data: await applyMovement(user, { type: 'TRANSFER', productId: i.productId, fromWarehouseId: i.fromWarehouseId, toWarehouseId: i.toWarehouseId, quantity: i.quantity, reference: i.reference ?? null, notes: i.notes ?? null }) }, 201);
  }

  // Products
  if (method === 'POST' && path === '/products') return createProduct(user, body);
  if (method === 'PATCH' && /^\/products\/[^/]+\/status$/.test(path)) return setProductStatus(user, idParam(path, '/products/', '/status'), body);
  if (method === 'PUT' && /^\/products\/[^/]+$/.test(path)) return updateProduct(user, idParam(path, '/products/'), body);
  if (method === 'DELETE' && /^\/products\/[^/]+$/.test(path)) return deleteProduct(user, idParam(path, '/products/'));

  // Warehouses
  if (method === 'POST' && path === '/warehouses') return createWarehouse(user, body);
  if (method === 'PATCH' && /^\/warehouses\/[^/]+\/status$/.test(path)) return setWarehouseStatus(user, idParam(path, '/warehouses/', '/status'), body);
  if (method === 'PUT' && /^\/warehouses\/[^/]+$/.test(path)) return updateWarehouse(user, idParam(path, '/warehouses/'), body);

  // Users
  if (method === 'POST' && path === '/users') return createUser(user, body);
  if (method === 'POST' && /^\/users\/[^/]+\/reset-password$/.test(path)) return resetUserPassword(user, idParam(path, '/users/', '/reset-password'));
  if (method === 'PATCH' && /^\/users\/[^/]+\/status$/.test(path)) return setUserStatus(user, idParam(path, '/users/', '/status'), body);
  if (method === 'PUT' && /^\/users\/[^/]+$/.test(path)) return updateUser(user, idParam(path, '/users/'), body);

  return { status: 404, body: { error: { code: 'NOT_FOUND', message: `Route ${method} ${path} not found` } } };
}

export const localApi: LocalApi = {
  kind: 'firebase',
  async fetch(method, path, query, body) {
    const cleanPath = path.split('?')[0]!.replace(/\/+$/, '') || '/';
    const parsedBody = body !== undefined ? JSON.parse(JSON.stringify(body)) : undefined;
    let out: LocalResponse;
    try {
      out = await route(method, cleanPath, query, parsedBody);
    } catch (err) {
      out = errorResponse(mapFirebaseError(err));
    }
    if (out.status === 204) return new Response(null, { status: 204 });
    if (out.text !== undefined) return new Response(out.text, { status: out.status, headers: out.headers });
    return new Response(JSON.stringify(out.body ?? null), { status: out.status, headers: { 'Content-Type': 'application/json', ...(out.headers ?? {}) } });
  },
};
