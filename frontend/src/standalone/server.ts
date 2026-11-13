/**
 * Standalone demo "server": implements the StockSense REST API inside the browser so the
 * whole application can run from a single index.html file.
 *
 * It mirrors backend/src (same endpoints, validation, permissions, business rules and
 * response shapes) on top of the localStorage-backed store in ./store.ts.
 * JavaScript runs single-threaded, so each operation is naturally atomic; the
 * "stock can never go negative" rule is enforced explicitly and answered with 409.
 */
import { z, ZodError } from 'zod';
import {
  getDb,
  hashPassword,
  newPasswordRecord,
  randomToken,
  saveDb,
  uid,
  type AuditRec,
  type DB,
  type MovementRec,
  type MovementType,
  type ProductRec,
  type Role,
  type UserRec,
  type WarehouseRec,
} from './store';

/* ------------------------------------------------------------------------- */
/* Infrastructure                                                            */
/* ------------------------------------------------------------------------- */

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
const badRequest = (m: string, d?: unknown) => new HttpError(400, 'BAD_REQUEST', m, d);
const unauthorized = (m = 'Authentication required') => new HttpError(401, 'UNAUTHORIZED', m);
const forbidden = (m: string) => new HttpError(403, 'FORBIDDEN', m);
const notFound = (e = 'Resource') => new HttpError(404, 'NOT_FOUND', `${e} not found`);
const conflict = (m: string, d?: unknown) => new HttpError(409, 'CONFLICT', m, d);
const insufficient = (d: { available: number; requested: number; productId: string; warehouseId: string }) =>
  new HttpError(409, 'INSUFFICIENT_STOCK', `Insufficient stock: requested ${d.requested}, only ${d.available} available`, d);

export interface LocalRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
  token: string | null;
}
export interface LocalResponse {
  status: number;
  body?: unknown;
  text?: string;
  headers?: Record<string, string>;
}

const PERMISSIONS = {
  'dashboard:view': ['ADMIN', 'MANAGER', 'STAFF'],
  'products:view': ['ADMIN', 'MANAGER', 'STAFF'],
  'products:create': ['ADMIN', 'MANAGER'],
  'products:update': ['ADMIN', 'MANAGER'],
  'products:deactivate': ['ADMIN', 'MANAGER'],
  'products:delete': ['ADMIN'],
  'warehouses:view': ['ADMIN', 'MANAGER', 'STAFF'],
  'warehouses:manage': ['ADMIN'],
  'inventory:view': ['ADMIN', 'MANAGER', 'STAFF'],
  'inventory:stock-in': ['ADMIN', 'MANAGER', 'STAFF'],
  'inventory:stock-out': ['ADMIN', 'MANAGER', 'STAFF'],
  'inventory:transfer': ['ADMIN', 'MANAGER'],
  'reports:view': ['ADMIN', 'MANAGER', 'STAFF'],
  'audit:view': ['ADMIN', 'MANAGER'],
  'users:manage': ['ADMIN'],
} as const satisfies Record<string, readonly Role[]>;
type Permission = keyof typeof PERMISSIONS;
const permissionsFor = (role: Role) => (Object.keys(PERMISSIONS) as Permission[]).filter((p) => (PERMISSIONS[p] as readonly Role[]).includes(role));

const SESSION_MS = 8 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const loginFailures = new Map<string, number[]>();

const now = () => new Date().toISOString();
const money = (v: number) => Math.round(v * 100) / 100;
const ctxMeta = { ipAddress: 'browser (standalone)', userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 255) : null };

function audit(db: DB, userId: string | null, action: string, entityType: string, entityId: string | null, details: Record<string, unknown> | null) {
  db.auditLogs.push({ id: uid(), userId, action, entityType, entityId, details, ...ctxMeta, createdAt: now() });
}

function paginate<T>(items: T[], q: { page: number; pageSize: number }) {
  const start = (q.page - 1) * q.pageSize;
  return { data: items.slice(start, start + q.pageSize), pagination: { page: q.page, pageSize: q.pageSize, total: items.length, totalPages: Math.max(1, Math.ceil(items.length / q.pageSize)) } };
}

const includesCI = (value: string | null | undefined, term: string) => !!value && value.toLowerCase().includes(term.toLowerCase());

/* ------------------------------------------------------------------------- */
/* Validation schemas (ported from backend)                                  */
/* ------------------------------------------------------------------------- */

const emailSchema = z.string({ error: 'Email is required' }).trim().toLowerCase().pipe(z.email({ error: 'Enter a valid email address' }).max(254));
const passwordSchema = z
  .string({ error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');
const uuidSchema = z.uuid({ error: 'Must be a valid UUID' });
const optionalTrimmed = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v === undefined ? undefined : v === null || v === '' ? null : v));
const booleanQuery = z.enum(['true', 'false']).transform((v) => v === 'true').optional();
const pagination = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) });
const roleSchema = z.enum(['ADMIN', 'MANAGER', 'STAFF'], { error: 'Role must be ADMIN, MANAGER or STAFF' });
const nameSchema = z.string({ error: 'Name is required' }).trim().min(2, 'Name must be at least 2 characters').max(120);
const quantitySchema = z.coerce.number({ error: 'Quantity must be a number' }).int('Quantity must be a whole number').min(1, 'Quantity must be at least 1').max(1_000_000, 'Quantity cannot exceed 1,000,000 per operation');
const skuSchema = z.string({ error: 'SKU is required' }).trim().toUpperCase().min(2, 'SKU must be at least 2 characters').max(40).regex(/^[A-Z0-9][A-Z0-9\-_./]*$/, 'SKU may contain only letters, numbers, - _ . /');
const priceSchema = z.coerce.number({ error: 'Unit price must be a number' }).min(0, 'Unit price cannot be negative').max(9_999_999_999.99).refine((v) => Math.round(v * 100) / 100 === v, 'Unit price can have at most 2 decimal places');
const reorderSchema = z.coerce.number({ error: 'Reorder level must be a number' }).int('Reorder level must be a whole number').min(0, 'Reorder level cannot be negative').max(10_000_000);
const codeSchema = z.string({ error: 'Code is required' }).trim().toUpperCase().min(2, 'Code must be at least 2 characters').max(20).regex(/^[A-Z0-9][A-Z0-9\-_]*$/, 'Code may contain only letters, numbers, - and _');
const capacitySchema = z.coerce.number().int('Capacity must be a whole number').min(1, 'Capacity must be at least 1').max(1_000_000_000).nullable().optional();
const dateQuery = z.coerce.date({ error: 'Invalid date' }).optional();

const S = {
  login: z.object({ email: emailSchema, password: z.string({ error: 'Password is required' }).min(1, 'Password is required').max(200) }),
  changePassword: z
    .object({ currentPassword: z.string().min(1, 'Current password is required'), newPassword: passwordSchema })
    .refine((d) => d.currentPassword !== d.newPassword, { message: 'New password must be different from the current password', path: ['newPassword'] }),
  createUser: z.object({ name: nameSchema, email: emailSchema, role: roleSchema, password: passwordSchema }),
  updateUser: z.object({ name: nameSchema.optional(), email: emailSchema.optional(), role: roleSchema.optional() }).refine((d) => Object.keys(d).length > 0, { message: 'Provide at least one field to update' }),
  status: z.object({ isActive: z.boolean({ error: 'isActive must be a boolean' }) }),
  resetPassword: z.object({ password: passwordSchema }),
  listUsers: pagination.extend({ search: z.string().trim().max(100).optional(), role: roleSchema.optional(), status: z.enum(['active', 'inactive', 'all']).default('all') }),
  createProduct: z.object({
    sku: skuSchema,
    name: z.string({ error: 'Name is required' }).trim().min(2, 'Name must be at least 2 characters').max(160),
    description: optionalTrimmed(1000),
    category: z.string({ error: 'Category is required' }).trim().min(2, 'Category is required').max(80),
    unit: z.string().trim().min(1).max(20).default('pcs'),
    unitPrice: priceSchema,
    reorderLevel: reorderSchema.default(10),
    isActive: z.boolean().default(true),
    openingStock: z
      .array(z.object({ warehouseId: uuidSchema, quantity: z.coerce.number().int().min(1, 'Opening quantity must be at least 1').max(1_000_000) }))
      .max(20)
      .refine((rows) => new Set(rows.map((r) => r.warehouseId)).size === rows.length, 'Each warehouse may appear only once')
      .optional(),
  }),
  updateProduct: z
    .object({
      sku: skuSchema.optional(),
      name: z.string().trim().min(2, 'Name must be at least 2 characters').max(160).optional(),
      description: optionalTrimmed(1000),
      category: z.string().trim().min(2, 'Category is required').max(80).optional(),
      unit: z.string().trim().min(1).max(20).optional(),
      unitPrice: priceSchema.optional(),
      reorderLevel: reorderSchema.optional(),
    })
    .refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'Provide at least one field to update' }),
  listProducts: pagination.extend({
    search: z.string().trim().max(100).optional(),
    category: z.string().trim().max(80).optional(),
    status: z.enum(['active', 'inactive', 'all']).default('all'),
    stockStatus: z.enum(['in_stock', 'low_stock', 'out_of_stock', 'all']).default('all'),
    warehouseId: uuidSchema.optional(),
    sortBy: z.enum(['name', 'sku', 'category', 'unitPrice', 'totalStock', 'stockValue', 'createdAt', 'updatedAt']).default('name'),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
  }),
  createWarehouse: z.object({
    code: codeSchema,
    name: z.string({ error: 'Name is required' }).trim().min(2, 'Name must be at least 2 characters').max(120),
    city: z.string({ error: 'City is required' }).trim().min(2, 'City is required').max(80),
    address: optionalTrimmed(255),
    capacity: capacitySchema,
  }),
  updateWarehouse: z
    .object({ code: codeSchema.optional(), name: z.string().trim().min(2).max(120).optional(), city: z.string().trim().min(2).max(80).optional(), address: optionalTrimmed(255), capacity: capacitySchema })
    .refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'Provide at least one field to update' }),
  listWarehouses: z.object({ includeInactive: booleanQuery }),
  stockMovement: z.object({ productId: uuidSchema, warehouseId: uuidSchema, quantity: quantitySchema, reference: optionalTrimmed(80), notes: optionalTrimmed(500) }),
  transfer: z
    .object({ productId: uuidSchema, fromWarehouseId: uuidSchema, toWarehouseId: uuidSchema, quantity: quantitySchema, reference: optionalTrimmed(80), notes: optionalTrimmed(500) })
    .refine((d) => d.fromWarehouseId !== d.toWarehouseId, { message: 'Destination warehouse must differ from the source warehouse', path: ['toWarehouseId'] }),
  listMovements: pagination.extend({
    type: z.enum(['STOCK_IN', 'STOCK_OUT', 'TRANSFER']).optional(),
    productId: uuidSchema.optional(),
    warehouseId: uuidSchema.optional(),
    userId: uuidSchema.optional(),
    search: z.string().trim().max(100).optional(),
    from: dateQuery,
    to: dateQuery,
  }),
  stockLevels: pagination.extend({
    warehouseId: uuidSchema.optional(),
    productId: uuidSchema.optional(),
    search: z.string().trim().max(100).optional(),
    onlyInStock: booleanQuery,
    includeInactive: booleanQuery,
    pageSize: z.coerce.number().int().min(1).max(500).default(50),
  }),
  lowStock: z.object({
    warehouseId: uuidSchema.optional(),
    category: z.string().trim().max(80).optional(),
    search: z.string().trim().max(100).optional(),
    status: z.enum(['all', 'low', 'out']).default('all'),
    format: z.enum(['json', 'csv']).default('json'),
  }),
  listAudit: pagination.extend({
    action: z.string().trim().max(60).optional(),
    entityType: z.string().trim().max(40).optional(),
    entityId: z.string().trim().max(64).optional(),
    userId: uuidSchema.optional(),
    search: z.string().trim().max(100).optional(),
    from: dateQuery,
    to: dateQuery,
  }),
};

/** Query strings arrive as strings; empty values are treated as absent (like the HTTP layer). */
function q<T extends z.ZodType>(schema: T, query: Record<string, string>): z.infer<T> {
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) if (v !== '') cleaned[k] = v;
  return schema.parse(cleaned);
}

/* ------------------------------------------------------------------------- */
/* Serializers                                                               */
/* ------------------------------------------------------------------------- */

const publicUser = (u: UserRec) => ({ id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt, updatedAt: u.updatedAt });

function stockStatus(total: number, reorder: number) {
  if (total <= 0) return 'OUT_OF_STOCK' as const;
  if (total <= reorder) return 'LOW_STOCK' as const;
  return 'IN_STOCK' as const;
}

function totalFor(db: DB, productId: string) {
  return db.stockLevels.reduce((s, l) => (l.productId === productId ? s + l.quantity : s), 0);
}

function warehouseRef(db: DB, id: string | null) {
  if (!id) return null;
  const w = db.warehouses.find((x) => x.id === id);
  return w ? { id: w.id, code: w.code, name: w.name } : null;
}

function serializeMovement(db: DB, m: MovementRec) {
  const p = db.products.find((x) => x.id === m.productId);
  const u = db.users.find((x) => x.id === m.performedById);
  return {
    id: m.id,
    type: m.type,
    quantity: m.quantity,
    reference: m.reference,
    notes: m.notes,
    createdAt: m.createdAt,
    value: money((p?.unitPrice ?? 0) * m.quantity),
    product: { id: m.productId, sku: p?.sku ?? '(deleted)', name: p?.name ?? '(deleted product)', unit: p?.unit ?? '' },
    fromWarehouse: warehouseRef(db, m.fromWarehouseId),
    toWarehouse: warehouseRef(db, m.toWarehouseId),
    performedBy: { id: m.performedById, name: u?.name ?? 'Unknown', role: u?.role ?? 'STAFF' },
  };
}

function stockByWarehouseList(db: DB, productId: string) {
  return db.stockLevels
    .filter((l) => l.productId === productId)
    .map((l) => ({ l, w: db.warehouses.find((w) => w.id === l.warehouseId)! }))
    .filter((x) => x.w)
    .sort((a, b) => a.w.code.localeCompare(b.w.code))
    .map(({ l, w }) => ({ warehouseId: w.id, warehouseCode: w.code, warehouseName: w.name, quantity: l.quantity }));
}

function productSummary(db: DB, p: ProductRec) {
  const totalStock = totalFor(db, p.id);
  return {
    ...p,
    totalStock,
    stockValue: money(totalStock * p.unitPrice),
    stockStatus: stockStatus(totalStock, p.reorderLevel),
    stockByWarehouse: stockByWarehouseList(db, p.id),
  };
}

function productDetail(db: DB, id: string) {
  const p = db.products.find((x) => x.id === id);
  if (!p) throw notFound('Product');
  const levels = new Map(db.stockLevels.filter((l) => l.productId === id).map((l) => [l.warehouseId, l]));
  const totalStock = totalFor(db, id);
  return {
    ...p,
    totalStock,
    stockValue: money(totalStock * p.unitPrice),
    stockStatus: stockStatus(totalStock, p.reorderLevel),
    stockByWarehouse: [...db.warehouses]
      .sort((a, b) => a.code.localeCompare(b.code))
      .filter((w) => w.isActive || levels.has(w.id))
      .map((w) => ({
        warehouseId: w.id,
        warehouseCode: w.code,
        warehouseName: w.name,
        city: w.city,
        warehouseActive: w.isActive,
        quantity: levels.get(w.id)?.quantity ?? 0,
        updatedAt: levels.get(w.id)?.updatedAt ?? null,
      })),
    recentMovements: db.movements
      .filter((m) => m.productId === id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10)
      .map((m) => serializeMovement(db, m)),
  };
}

function warehouseWithStats(db: DB, w: WarehouseRec) {
  let totalUnits = 0;
  let skuCount = 0;
  let stockValue = 0;
  let lowStockCount = 0;
  for (const l of db.stockLevels) {
    if (l.warehouseId !== w.id) continue;
    const p = db.products.find((x) => x.id === l.productId);
    if (!p) continue;
    totalUnits += l.quantity;
    if (l.quantity > 0) skuCount += 1;
    stockValue += l.quantity * p.unitPrice;
    if (p.isActive && l.quantity <= p.reorderLevel) lowStockCount += 1;
  }
  return {
    ...w,
    totalUnits,
    skuCount,
    stockValue: money(stockValue),
    lowStockCount,
    utilization: w.capacity ? Math.min(100, Math.round((totalUnits / w.capacity) * 1000) / 10) : null,
  };
}

function warehouseDetail(db: DB, id: string) {
  const w = db.warehouses.find((x) => x.id === id);
  if (!w) throw notFound('Warehouse');
  return {
    ...warehouseWithStats(db, w),
    recentMovements: db.movements
      .filter((m) => m.fromWarehouseId === id || m.toWarehouseId === id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10)
      .map((m) => serializeMovement(db, m)),
  };
}

/* ------------------------------------------------------------------------- */
/* Activity descriptions (port of backend audit.describe.ts)                 */
/* ------------------------------------------------------------------------- */

const AUDIT_ACTIONS = [
  'AUTH_LOGIN', 'AUTH_LOGIN_FAILED', 'AUTH_LOGOUT', 'AUTH_PASSWORD_CHANGED', 'USER_CREATED', 'USER_UPDATED', 'USER_ACTIVATED', 'USER_DEACTIVATED',
  'USER_PASSWORD_RESET', 'PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PRODUCT_ACTIVATED', 'PRODUCT_DEACTIVATED', 'PRODUCT_DELETED', 'WAREHOUSE_CREATED',
  'WAREHOUSE_UPDATED', 'WAREHOUSE_ACTIVATED', 'WAREHOUSE_DEACTIVATED', 'STOCK_IN', 'STOCK_OUT', 'STOCK_TRANSFER', 'STOCK_OPERATION_REJECTED',
];

function describe(action: string, details: Record<string, unknown> | null): string {
  const d = details ?? {};
  const s = (k: string) => (d[k] === undefined || d[k] === null ? '' : String(d[k]));
  const units = (k: string) => `${s(k)} unit${Number(d[k]) === 1 ? '' : 's'}`;
  switch (action) {
    case 'STOCK_IN': return `Received ${units('quantity')} of ${s('sku')} into ${s('warehouse')}`;
    case 'STOCK_OUT': return `Dispatched ${units('quantity')} of ${s('sku')} from ${s('warehouse')}`;
    case 'STOCK_TRANSFER': return `Transferred ${units('quantity')} of ${s('sku')} from ${s('from')} to ${s('to')}`;
    case 'STOCK_OPERATION_REJECTED': return `Rejected ${s('type').replace('_', ' ').toLowerCase()} of ${units('requested')} of ${s('sku')} (only ${s('available')} available)`;
    case 'PRODUCT_CREATED': return `Created product ${s('sku')} - ${s('name')}`;
    case 'PRODUCT_UPDATED': return `Updated product ${s('sku')}`;
    case 'PRODUCT_ACTIVATED': return `Activated product ${s('sku')}`;
    case 'PRODUCT_DEACTIVATED': return `Deactivated product ${s('sku')}`;
    case 'PRODUCT_DELETED': return `Deleted product ${s('sku')}`;
    case 'WAREHOUSE_CREATED': return `Created warehouse ${s('code')} - ${s('name')}`;
    case 'WAREHOUSE_UPDATED': return `Updated warehouse ${s('code')}`;
    case 'WAREHOUSE_ACTIVATED': return `Activated warehouse ${s('code')}`;
    case 'WAREHOUSE_DEACTIVATED': return `Deactivated warehouse ${s('code')}`;
    case 'USER_CREATED': return `Created user ${s('email')} (${s('role')})`;
    case 'USER_UPDATED': return 'Updated a user account';
    case 'USER_ACTIVATED': return `Activated user ${s('email')}`;
    case 'USER_DEACTIVATED': return `Deactivated user ${s('email')}`;
    case 'USER_PASSWORD_RESET': return `Reset password for ${s('email')}`;
    case 'AUTH_LOGIN': return 'Signed in';
    case 'AUTH_LOGOUT': return 'Signed out';
    case 'AUTH_LOGIN_FAILED': return `Failed sign-in attempt for ${s('email')}`;
    case 'AUTH_PASSWORD_CHANGED': return 'Changed own password';
    default: return action.replace(/_/g, ' ').toLowerCase();
  }
}

/* ------------------------------------------------------------------------- */
/* Auth                                                                      */
/* ------------------------------------------------------------------------- */

function issueSession(db: DB, user: UserRec) {
  const token = randomToken();
  const exp = Date.now() + SESSION_MS;
  // drop expired sessions
  for (const [t, s] of Object.entries(db.sessions)) if (s.exp < Date.now()) delete db.sessions[t];
  db.sessions[token] = { userId: user.id, ver: user.tokenVersion, exp };
  return { token, expiresAt: new Date(exp).toISOString() };
}

function authenticate(db: DB, token: string | null): UserRec {
  if (!token) throw unauthorized('Missing or malformed Authorization header');
  const session = db.sessions[token];
  if (!session || session.exp < Date.now()) throw unauthorized('Invalid or expired token');
  const user = db.users.find((u) => u.id === session.userId);
  if (!user || !user.isActive || user.tokenVersion !== session.ver) throw unauthorized('Session is no longer valid. Please sign in again.');
  return user;
}

function requirePerm(user: UserRec, permission: Permission) {
  if (!(PERMISSIONS[permission] as readonly Role[]).includes(user.role)) throw forbidden(`Your role (${user.role}) is not allowed to perform this action`);
}

function assertNotLastAdmin(db: DB, userId: string) {
  if (!db.users.some((u) => u.role === 'ADMIN' && u.isActive && u.id !== userId)) throw conflict('At least one active administrator must remain in the system');
}

/* ------------------------------------------------------------------------- */
/* Inventory                                                                 */
/* ------------------------------------------------------------------------- */

function activeProduct(db: DB, id: string) {
  const p = db.products.find((x) => x.id === id);
  if (!p) throw notFound('Product');
  if (!p.isActive) throw conflict(`Product ${p.sku} is inactive. Activate it before moving stock.`);
  return p;
}
function activeWarehouse(db: DB, id: string, label = 'Warehouse') {
  const w = db.warehouses.find((x) => x.id === id);
  if (!w) throw notFound(label);
  if (!w.isActive) throw conflict(`${label} ${w.code} is inactive`);
  return w;
}
function level(db: DB, productId: string, warehouseId: string, create = false) {
  let l = db.stockLevels.find((x) => x.productId === productId && x.warehouseId === warehouseId);
  if (!l && create) {
    l = { id: uid(), productId, warehouseId, quantity: 0, updatedAt: now() };
    db.stockLevels.push(l);
  }
  return l;
}

function applyStockIn(db: DB, user: UserRec, p: ProductRec, w: WarehouseRec, quantity: number, reference: string | null, notes: string | null) {
  const l = level(db, p.id, w.id, true)!;
  l.quantity += quantity;
  l.updatedAt = now();
  const m: MovementRec = { id: uid(), type: 'STOCK_IN', productId: p.id, fromWarehouseId: null, toWarehouseId: w.id, quantity, reference, notes, performedById: user.id, createdAt: now() };
  db.movements.push(m);
  audit(db, user.id, 'STOCK_IN', 'StockMovement', m.id, { productId: p.id, sku: p.sku, warehouseId: w.id, warehouse: w.code, quantity, reference, balanceAfter: l.quantity });
  return { m, balance: l.quantity };
}

function reject(db: DB, user: UserRec, type: MovementType, details: Record<string, unknown>) {
  audit(db, user.id, 'STOCK_OPERATION_REJECTED', 'StockMovement', null, { type, reason: 'INSUFFICIENT_STOCK', ...details });
  saveDb();
}

/* ------------------------------------------------------------------------- */
/* Router                                                                    */
/* ------------------------------------------------------------------------- */

type Handler = (ctx: { db: DB; req: LocalRequest; params: Record<string, string>; user: () => UserRec }) => LocalResponse;
const routes: { method: string; pattern: RegExp; keys: string[]; handler: Handler; mutates: boolean }[] = [];

function route(method: string, path: string, handler: Handler) {
  const keys: string[] = [];
  const pattern = new RegExp('^' + path.replace(/:(\w+)/g, (_m, k: string) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, pattern, keys, handler, mutates: method !== 'GET' });
}

const ok = (body: unknown, status = 200): LocalResponse => ({ status, body });
const idParam = (params: Record<string, string>) => uuidSchema.parse(params.id);

/* ---- health & auth ---- */

route('GET', '/health', () => ok({ status: 'ok', service: 'stocksense-standalone', database: 'browser-storage', timestamp: now() }));

route('POST', '/auth/login', ({ db, req }) => {
  const { email, password } = S.login.parse(req.body);
  const recent = (loginFailures.get(email) ?? []).filter((t) => t > Date.now() - LOGIN_WINDOW_MS);
  loginFailures.set(email, recent);
  if (recent.length >= LOGIN_MAX_FAILURES) throw new HttpError(429, 'TOO_MANY_REQUESTS', 'Too many login attempts. Please wait a few minutes and try again.');
  const fail = () => {
    recent.push(Date.now());
    saveDb();
    return new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  };

  const user = db.users.find((u) => u.email === email);
  if (!user) {
    audit(db, null, 'AUTH_LOGIN_FAILED', 'User', null, { email, reason: 'UNKNOWN_EMAIL' });
    throw fail();
  }
  if (hashPassword(password, user.salt) !== user.passwordHash) {
    audit(db, user.id, 'AUTH_LOGIN_FAILED', 'User', user.id, { email, reason: 'BAD_PASSWORD' });
    throw fail();
  }
  if (!user.isActive) {
    audit(db, user.id, 'AUTH_LOGIN_FAILED', 'User', user.id, { email, reason: 'ACCOUNT_DEACTIVATED' });
    saveDb();
    throw new HttpError(401, 'UNAUTHORIZED', 'Your account has been deactivated. Contact an administrator.');
  }
  user.lastLoginAt = now();
  user.updatedAt = now();
  audit(db, user.id, 'AUTH_LOGIN', 'User', user.id, { email });
  return ok({ ...issueSession(db, user), user: { ...publicUser(user), permissions: permissionsFor(user.role) } });
});

route('GET', '/auth/me', ({ user }) => {
  const u = user();
  return ok({ user: { ...publicUser(u), permissions: permissionsFor(u.role) } });
});

route('POST', '/auth/logout', ({ db, req, user }) => {
  const u = user();
  audit(db, u.id, 'AUTH_LOGOUT', 'User', u.id, null);
  if (req.token) delete db.sessions[req.token];
  return { status: 204 };
});

route('POST', '/auth/change-password', ({ db, req, user }) => {
  const u = user();
  const { currentPassword, newPassword } = S.changePassword.parse(req.body);
  if (hashPassword(currentPassword, u.salt) !== u.passwordHash) throw badRequest('Current password is incorrect', [{ path: 'currentPassword', message: 'Current password is incorrect' }]);
  Object.assign(u, newPasswordRecord(newPassword), { tokenVersion: u.tokenVersion + 1, updatedAt: now() });
  audit(db, u.id, 'AUTH_PASSWORD_CHANGED', 'User', u.id, null);
  return ok({ message: 'Password updated successfully', ...issueSession(db, u) });
});

/* ---- users ---- */

route('GET', '/users', ({ db, req, user }) => {
  requirePerm(user(), 'users:manage');
  const query = q(S.listUsers, req.query);
  const items = db.users
    .filter((u) => !query.role || u.role === query.role)
    .filter((u) => (query.status === 'active' ? u.isActive : query.status === 'inactive' ? !u.isActive : true))
    .filter((u) => !query.search || includesCI(u.name, query.search) || includesCI(u.email, query.search))
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name))
    .map(publicUser);
  return ok(paginate(items, query));
});

route('GET', '/users/:id', ({ db, params, user }) => {
  requirePerm(user(), 'users:manage');
  const u = db.users.find((x) => x.id === idParam(params));
  if (!u) throw notFound('User');
  return ok({ data: publicUser(u) });
});

route('POST', '/users', ({ db, req, user }) => {
  const actor = user();
  requirePerm(actor, 'users:manage');
  const input = S.createUser.parse(req.body);
  if (db.users.some((u) => u.email === input.email)) throw conflict('A user with this email already exists');
  const rec: UserRec = { id: uid(), name: input.name, email: input.email, role: input.role, isActive: true, tokenVersion: 0, lastLoginAt: null, createdAt: now(), updatedAt: now(), ...newPasswordRecord(input.password) };
  db.users.push(rec);
  audit(db, actor.id, 'USER_CREATED', 'User', rec.id, { name: rec.name, email: rec.email, role: rec.role });
  return ok({ data: publicUser(rec) }, 201);
});

route('PUT', '/users/:id', ({ db, req, params, user }) => {
  const actor = user();
  requirePerm(actor, 'users:manage');
  const id = idParam(params);
  const input = S.updateUser.parse(req.body);
  const u = db.users.find((x) => x.id === id);
  if (!u) throw notFound('User');
  if (input.role && input.role !== u.role) {
    if (id === actor.id) throw conflict('You cannot change your own role');
    if (u.role === 'ADMIN') assertNotLastAdmin(db, id);
  }
  if (input.email && input.email !== u.email && db.users.some((x) => x.email === input.email)) throw conflict('A user with this email already exists');
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of ['name', 'email', 'role'] as const) if (input[k] !== undefined && input[k] !== u[k]) changes[k] = { from: u[k], to: input[k] };
  if (changes.role) u.tokenVersion += 1;
  Object.assign(u, Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)), { updatedAt: now() });
  audit(db, actor.id, 'USER_UPDATED', 'User', id, { changes });
  return ok({ data: publicUser(u) });
});

route('PATCH', '/users/:id/status', ({ db, req, params, user }) => {
  const actor = user();
  requirePerm(actor, 'users:manage');
  const id = idParam(params);
  const { isActive } = S.status.parse(req.body);
  if (id === actor.id && !isActive) throw conflict('You cannot deactivate your own account');
  const u = db.users.find((x) => x.id === id);
  if (!u) throw notFound('User');
  if (!isActive && u.role === 'ADMIN') assertNotLastAdmin(db, id);
  u.isActive = isActive;
  if (!isActive) u.tokenVersion += 1;
  u.updatedAt = now();
  audit(db, actor.id, isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', 'User', id, { email: u.email });
  return ok({ data: publicUser(u) });
});

route('POST', '/users/:id/reset-password', ({ db, req, params, user }) => {
  const actor = user();
  requirePerm(actor, 'users:manage');
  const id = idParam(params);
  const { password } = S.resetPassword.parse(req.body);
  const u = db.users.find((x) => x.id === id);
  if (!u) throw notFound('User');
  Object.assign(u, newPasswordRecord(password), { tokenVersion: u.tokenVersion + 1, updatedAt: now() });
  audit(db, actor.id, 'USER_PASSWORD_RESET', 'User', id, { email: u.email });
  return ok({ message: 'Password has been reset. The user must sign in again.' });
});

/* ---- products ---- */

route('GET', '/products', ({ db, req, user }) => {
  requirePerm(user(), 'products:view');
  const query = q(S.listProducts, req.query);
  let items = db.products.map((p) => productSummary(db, p));
  if (query.status === 'active') items = items.filter((p) => p.isActive);
  if (query.status === 'inactive') items = items.filter((p) => !p.isActive);
  if (query.category) items = items.filter((p) => p.category === query.category);
  if (query.search) {
    const t = query.search;
    items = items.filter((p) => includesCI(p.name, t) || includesCI(p.sku, t) || includesCI(p.category, t) || includesCI(p.description, t));
  }
  if (query.stockStatus === 'out_of_stock') items = items.filter((p) => p.totalStock === 0);
  if (query.stockStatus === 'low_stock') items = items.filter((p) => p.totalStock <= p.reorderLevel);
  if (query.stockStatus === 'in_stock') items = items.filter((p) => p.totalStock > p.reorderLevel);
  if (query.warehouseId) items = items.filter((p) => p.stockByWarehouse.some((w) => w.warehouseId === query.warehouseId && w.quantity > 0));
  const dir = query.sortOrder === 'desc' ? -1 : 1;
  const key = query.sortBy;
  items.sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    const c = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return c * dir || a.sku.localeCompare(b.sku);
  });
  return ok(paginate(items, query));
});

route('GET', '/products/categories', ({ db, user }) => {
  requirePerm(user(), 'products:view');
  const counts = new Map<string, number>();
  for (const p of db.products) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  return ok({ data: [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, productCount]) => ({ name, productCount })) });
});

route('GET', '/products/:id', ({ db, params, user }) => {
  requirePerm(user(), 'products:view');
  return ok({ data: productDetail(db, idParam(params)) });
});

route('POST', '/products', ({ db, req, user }) => {
  const actor = user();
  requirePerm(actor, 'products:create');
  const input = S.createProduct.parse(req.body);
  if (db.products.some((p) => p.sku === input.sku)) throw conflict(`A product with SKU ${input.sku} already exists`);
  const opening = input.openingStock ?? [];
  for (const o of opening) {
    const w = db.warehouses.find((x) => x.id === o.warehouseId);
    if (!w) throw badRequest('Opening stock references an unknown warehouse', [{ path: 'openingStock', message: 'Unknown warehouse' }]);
    if (!w.isActive) throw conflict(`Warehouse ${w.code} is inactive`);
  }
  if (opening.length && !input.isActive) throw badRequest('Opening stock cannot be added to an inactive product');
  const p: ProductRec = { id: uid(), sku: input.sku, name: input.name, description: input.description ?? null, category: input.category, unit: input.unit, unitPrice: input.unitPrice, reorderLevel: input.reorderLevel, isActive: input.isActive, createdAt: now(), updatedAt: now() };
  db.products.push(p);
  audit(db, actor.id, 'PRODUCT_CREATED', 'Product', p.id, { sku: p.sku, name: p.name, category: p.category, unitPrice: p.unitPrice, reorderLevel: p.reorderLevel, openingStock: opening });
  for (const o of opening) applyStockIn(db, actor, p, db.warehouses.find((w) => w.id === o.warehouseId)!, o.quantity, 'OPENING-STOCK', 'Opening stock on product creation');
  return ok({ data: productDetail(db, p.id) }, 201);
});

route('PUT', '/products/:id', ({ db, req, params, user }) => {
  const actor = user();
  requirePerm(actor, 'products:update');
  const id = idParam(params);
  const input = S.updateProduct.parse(req.body);
  const p = db.products.find((x) => x.id === id);
  if (!p) throw notFound('Product');
  if (input.sku && input.sku !== p.sku && db.products.some((x) => x.sku === input.sku)) throw conflict(`A product with SKU ${input.sku} already exists`);
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    const cur = p[k as keyof ProductRec];
    if (cur !== v) changes[k] = { from: cur, to: v };
    (p as unknown as Record<string, unknown>)[k] = v;
  }
  p.updatedAt = now();
  audit(db, actor.id, 'PRODUCT_UPDATED', 'Product', id, { sku: p.sku, changes });
  return ok({ data: productDetail(db, id) });
});

route('PATCH', '/products/:id/status', ({ db, req, params, user }) => {
  const actor = user();
  requirePerm(actor, 'products:deactivate');
  const id = idParam(params);
  const { isActive } = S.status.parse(req.body);
  const p = db.products.find((x) => x.id === id);
  if (!p) throw notFound('Product');
  const previous = p.isActive;
  p.isActive = isActive;
  p.updatedAt = now();
  audit(db, actor.id, isActive ? 'PRODUCT_ACTIVATED' : 'PRODUCT_DEACTIVATED', 'Product', id, { sku: p.sku, previous });
  return ok({ data: productDetail(db, id) });
});

route('DELETE', '/products/:id', ({ db, params, user }) => {
  const actor = user();
  requirePerm(actor, 'products:delete');
  const id = idParam(params);
  const p = db.products.find((x) => x.id === id);
  if (!p) throw notFound('Product');
  const movements = db.movements.filter((m) => m.productId === id).length;
  const onHand = totalFor(db, id);
  if (movements > 0 || onHand > 0) throw conflict('This product has stock or movement history and cannot be permanently deleted. Deactivate it instead.', { movements, onHand });
  db.products = db.products.filter((x) => x.id !== id);
  db.stockLevels = db.stockLevels.filter((l) => l.productId !== id);
  audit(db, actor.id, 'PRODUCT_DELETED', 'Product', id, { sku: p.sku, name: p.name });
  return { status: 204 };
});

/* ---- warehouses ---- */

route('GET', '/warehouses', ({ db, req, user }) => {
  requirePerm(user(), 'warehouses:view');
  const { includeInactive } = q(S.listWarehouses, req.query);
  const list = db.warehouses
    .filter((w) => (includeInactive ?? true) || w.isActive)
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.code.localeCompare(b.code))
    .map((w) => warehouseWithStats(db, w));
  return ok({ data: list });
});

route('GET', '/warehouses/:id', ({ db, params, user }) => {
  requirePerm(user(), 'warehouses:view');
  return ok({ data: warehouseDetail(db, idParam(params)) });
});

route('POST', '/warehouses', ({ db, req, user }) => {
  const actor = user();
  requirePerm(actor, 'warehouses:manage');
  const input = S.createWarehouse.parse(req.body);
  if (db.warehouses.some((w) => w.code === input.code)) throw conflict(`A warehouse with code ${input.code} already exists`);
  const w: WarehouseRec = { id: uid(), code: input.code, name: input.name, city: input.city, address: input.address ?? null, capacity: input.capacity ?? null, isActive: true, createdAt: now(), updatedAt: now() };
  db.warehouses.push(w);
  audit(db, actor.id, 'WAREHOUSE_CREATED', 'Warehouse', w.id, { code: w.code, name: w.name, city: w.city });
  return ok({ data: warehouseWithStats(db, w) }, 201);
});

route('PUT', '/warehouses/:id', ({ db, req, params, user }) => {
  const actor = user();
  requirePerm(actor, 'warehouses:manage');
  const id = idParam(params);
  const input = S.updateWarehouse.parse(req.body);
  const w = db.warehouses.find((x) => x.id === id);
  if (!w) throw notFound('Warehouse');
  if (input.code && input.code !== w.code && db.warehouses.some((x) => x.code === input.code)) throw conflict(`A warehouse with code ${input.code} already exists`);
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    const cur = w[k as keyof WarehouseRec];
    if (cur !== v) changes[k] = { from: cur, to: v };
    (w as unknown as Record<string, unknown>)[k] = v;
  }
  w.updatedAt = now();
  audit(db, actor.id, 'WAREHOUSE_UPDATED', 'Warehouse', id, { code: w.code, changes });
  return ok({ data: warehouseDetail(db, id) });
});

route('PATCH', '/warehouses/:id/status', ({ db, req, params, user }) => {
  const actor = user();
  requirePerm(actor, 'warehouses:manage');
  const id = idParam(params);
  const { isActive } = S.status.parse(req.body);
  const w = db.warehouses.find((x) => x.id === id);
  if (!w) throw notFound('Warehouse');
  if (!isActive) {
    const onHand = db.stockLevels.reduce((s, l) => (l.warehouseId === id ? s + l.quantity : s), 0);
    if (onHand > 0) throw conflict(`Warehouse ${w.code} still holds ${onHand} units. Transfer or issue all stock before deactivating it.`, { onHand });
  }
  w.isActive = isActive;
  w.updatedAt = now();
  audit(db, actor.id, isActive ? 'WAREHOUSE_ACTIVATED' : 'WAREHOUSE_DEACTIVATED', 'Warehouse', id, { code: w.code });
  return ok({ data: warehouseDetail(db, id) });
});

/* ---- inventory ---- */

route('GET', '/inventory/movements', ({ db, req, user }) => {
  requirePerm(user(), 'inventory:view');
  const query = q(S.listMovements, req.query);
  const from = query.from?.toISOString();
  const to = query.to?.toISOString();
  const items = db.movements
    .filter((m) => !query.type || m.type === query.type)
    .filter((m) => !query.productId || m.productId === query.productId)
    .filter((m) => !query.userId || m.performedById === query.userId)
    .filter((m) => !query.warehouseId || m.fromWarehouseId === query.warehouseId || m.toWarehouseId === query.warehouseId)
    .filter((m) => (!from || m.createdAt >= from) && (!to || m.createdAt <= to))
    .filter((m) => {
      if (!query.search) return true;
      const p = db.products.find((x) => x.id === m.productId);
      return includesCI(m.reference, query.search) || includesCI(m.notes, query.search) || includesCI(p?.name, query.search) || includesCI(p?.sku, query.search);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((m) => serializeMovement(db, m));
  return ok(paginate(items, query));
});

route('GET', '/inventory/stock-levels', ({ db, req, user }) => {
  requirePerm(user(), 'inventory:view');
  const query = q(S.stockLevels, req.query);
  const items = db.stockLevels
    .map((l) => ({ l, p: db.products.find((x) => x.id === l.productId)!, w: db.warehouses.find((x) => x.id === l.warehouseId)! }))
    .filter(({ p, w }) => p && w)
    .filter(({ l }) => !query.warehouseId || l.warehouseId === query.warehouseId)
    .filter(({ l }) => !query.productId || l.productId === query.productId)
    .filter(({ l }) => !query.onlyInStock || l.quantity > 0)
    .filter(({ p }) => query.includeInactive || p.isActive)
    .filter(({ p }) => !query.search || includesCI(p.name, query.search) || includesCI(p.sku, query.search))
    .sort((a, b) => a.p.name.localeCompare(b.p.name) || a.w.code.localeCompare(b.w.code))
    .map(({ l, p, w }) => ({
      id: l.id,
      quantity: l.quantity,
      updatedAt: l.updatedAt,
      value: money(p.unitPrice * l.quantity),
      product: { id: p.id, sku: p.sku, name: p.name, category: p.category, unit: p.unit, unitPrice: p.unitPrice, reorderLevel: p.reorderLevel, isActive: p.isActive },
      warehouse: { id: w.id, code: w.code, name: w.name },
    }));
  return ok(paginate(items, query));
});

route('POST', '/inventory/stock-in', ({ db, req, user }) => {
  const actor = user();
  requirePerm(actor, 'inventory:stock-in');
  const input = S.stockMovement.parse(req.body);
  const p = activeProduct(db, input.productId);
  const w = activeWarehouse(db, input.warehouseId);
  const { m, balance } = applyStockIn(db, actor, p, w, input.quantity, input.reference ?? null, input.notes ?? null);
  return ok({ data: { movement: serializeMovement(db, m), stockLevels: [{ warehouseId: w.id, warehouseCode: w.code, quantity: balance }] } }, 201);
});

route('POST', '/inventory/stock-out', ({ db, req, user }) => {
  const actor = user();
  requirePerm(actor, 'inventory:stock-out');
  const input = S.stockMovement.parse(req.body);
  const p = activeProduct(db, input.productId);
  const w = activeWarehouse(db, input.warehouseId);
  const l = level(db, p.id, w.id);
  const available = l?.quantity ?? 0;
  if (!l || available < input.quantity) {
    const details = { available, requested: input.quantity, productId: p.id, warehouseId: w.id };
    reject(db, actor, 'STOCK_OUT', { sku: p.sku, warehouse: w.code, ...details });
    throw insufficient(details);
  }
  l.quantity -= input.quantity;
  l.updatedAt = now();
  const m: MovementRec = { id: uid(), type: 'STOCK_OUT', productId: p.id, fromWarehouseId: w.id, toWarehouseId: null, quantity: input.quantity, reference: input.reference ?? null, notes: input.notes ?? null, performedById: actor.id, createdAt: now() };
  db.movements.push(m);
  audit(db, actor.id, 'STOCK_OUT', 'StockMovement', m.id, { productId: p.id, sku: p.sku, warehouseId: w.id, warehouse: w.code, quantity: m.quantity, reference: m.reference, balanceAfter: l.quantity });
  return ok({ data: { movement: serializeMovement(db, m), stockLevels: [{ warehouseId: w.id, warehouseCode: w.code, quantity: l.quantity }] } }, 201);
});

route('POST', '/inventory/transfer', ({ db, req, user }) => {
  const actor = user();
  requirePerm(actor, 'inventory:transfer');
  const input = S.transfer.parse(req.body);
  const p = activeProduct(db, input.productId);
  const from = activeWarehouse(db, input.fromWarehouseId, 'Source warehouse');
  const to = activeWarehouse(db, input.toWarehouseId, 'Destination warehouse');
  const src = level(db, p.id, from.id);
  const available = src?.quantity ?? 0;
  if (!src || available < input.quantity) {
    const details = { available, requested: input.quantity, productId: p.id, warehouseId: from.id };
    reject(db, actor, 'TRANSFER', { sku: p.sku, from: from.code, to: to.code, ...details });
    throw insufficient(details);
  }
  const dst = level(db, p.id, to.id, true)!;
  src.quantity -= input.quantity;
  dst.quantity += input.quantity;
  src.updatedAt = dst.updatedAt = now();
  const m: MovementRec = { id: uid(), type: 'TRANSFER', productId: p.id, fromWarehouseId: from.id, toWarehouseId: to.id, quantity: input.quantity, reference: input.reference ?? null, notes: input.notes ?? null, performedById: actor.id, createdAt: now() };
  db.movements.push(m);
  audit(db, actor.id, 'STOCK_TRANSFER', 'StockMovement', m.id, { productId: p.id, sku: p.sku, fromWarehouseId: from.id, from: from.code, toWarehouseId: to.id, to: to.code, quantity: m.quantity, reference: m.reference, fromBalanceAfter: src.quantity, toBalanceAfter: dst.quantity });
  return ok(
    { data: { movement: serializeMovement(db, m), stockLevels: [{ warehouseId: from.id, warehouseCode: from.code, quantity: src.quantity }, { warehouseId: to.id, warehouseCode: to.code, quantity: dst.quantity }] } },
    201,
  );
});

/* ---- dashboard ---- */

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

route('GET', '/dashboard/summary', ({ db, user }) => {
  requirePerm(user(), 'dashboard:view');
  const active = db.products.filter((p) => p.isActive);
  const totals = active.map((p) => ({ p, qty: totalFor(db, p.id) }));

  const days: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(localDay(d));
  }
  const trend = new Map(days.map((d) => [d, { date: d, stockIn: 0, stockOut: 0, transfer: 0 }]));
  const today = localDay(new Date());
  let todayMovements = 0;
  for (const m of db.movements) {
    const day = localDay(new Date(m.createdAt));
    if (day === today) todayMovements += 1;
    const bucket = trend.get(day);
    if (!bucket) continue;
    if (m.type === 'STOCK_IN') bucket.stockIn += m.quantity;
    else if (m.type === 'STOCK_OUT') bucket.stockOut += m.quantity;
    else bucket.transfer += m.quantity;
  }

  const categories = new Map<string, { category: string; productCount: number; units: number; value: number }>();
  for (const { p, qty } of totals) {
    const c = categories.get(p.category) ?? { category: p.category, productCount: 0, units: 0, value: 0 };
    c.productCount += 1;
    c.units += qty;
    c.value += qty * p.unitPrice;
    categories.set(p.category, c);
  }

  const warehouses = db.warehouses
    .filter((w) => w.isActive)
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((w) => warehouseWithStats(db, w));

  return ok({
    data: {
      kpis: {
        totalSkus: active.length,
        inactiveProducts: db.products.length - active.length,
        totalInventory: totals.reduce((s, t) => s + t.qty, 0),
        lowStockCount: totals.filter((t) => t.qty <= t.p.reorderLevel).length,
        outOfStockCount: totals.filter((t) => t.qty === 0).length,
        totalStockValue: money(totals.reduce((s, t) => s + t.qty * t.p.unitPrice, 0)),
        warehouseCount: warehouses.length,
        todayMovements,
        activeUsers: db.users.filter((u) => u.isActive).length,
      },
      warehouses: warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name, city: w.city, capacity: w.capacity, totalUnits: w.totalUnits, skuCount: w.skuCount, stockValue: w.stockValue, lowStockCount: w.lowStockCount, utilization: w.utilization })),
      movementTrend: [...trend.values()],
      categoryBreakdown: [...categories.values()].map((c) => ({ ...c, value: money(c.value) })).sort((a, b) => b.value - a.value),
      lowStockItems: totals
        .filter((t) => t.qty <= t.p.reorderLevel)
        .sort((a, b) => a.qty / Math.max(a.p.reorderLevel, 1) - b.qty / Math.max(b.p.reorderLevel, 1) || a.p.name.localeCompare(b.p.name))
        .slice(0, 6)
        .map(({ p, qty }) => ({ id: p.id, sku: p.sku, name: p.name, category: p.category, unit: p.unit, reorderLevel: p.reorderLevel, totalStock: qty, status: qty === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK' })),
      recentActivities: db.auditLogs
        .filter((a) => !['AUTH_LOGIN', 'AUTH_LOGOUT', 'AUTH_LOGIN_FAILED'].includes(a.action))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 10)
        .map((a) => {
          const u = db.users.find((x) => x.id === a.userId);
          return { id: a.id, action: a.action, entityType: a.entityType, entityId: a.entityId, description: describe(a.action, a.details), createdAt: a.createdAt, user: u ? { id: u.id, name: u.name, role: u.role } : null };
        }),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time',
      generatedAt: now(),
    },
  });
});

/* ---- reports ---- */

function lowStockReport(db: DB, query: z.infer<typeof S.lowStock>) {
  let warehouse: { id: string; code: string; name: string } | null = null;
  if (query.warehouseId) {
    const w = db.warehouses.find((x) => x.id === query.warehouseId);
    if (!w) throw notFound('Warehouse');
    warehouse = { id: w.id, code: w.code, name: w.name };
  }
  const items = db.products
    .filter((p) => p.isActive)
    .filter((p) => !query.category || p.category === query.category)
    .filter((p) => !query.search || includesCI(p.name, query.search) || includesCI(p.sku, query.search))
    .map((p) => ({ p, qty: query.warehouseId ? (level(db, p.id, query.warehouseId)?.quantity ?? 0) : totalFor(db, p.id) }))
    .filter(({ p, qty }) => (query.status === 'out' ? qty === 0 : query.status === 'low' ? qty > 0 && qty <= p.reorderLevel : qty <= p.reorderLevel))
    .sort((a, b) => a.qty - b.qty || a.qty / Math.max(a.p.reorderLevel, 1) - b.qty / Math.max(b.p.reorderLevel, 1) || a.p.name.localeCompare(b.p.name))
    .map(({ p, qty }) => {
      const suggestedReorderQty = Math.max(p.reorderLevel * 2 - qty, 0);
      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        unit: p.unit,
        unitPrice: p.unitPrice,
        reorderLevel: p.reorderLevel,
        quantity: qty,
        shortfall: Math.max(p.reorderLevel - qty, 0),
        suggestedReorderQty,
        estimatedReorderCost: money(suggestedReorderQty * p.unitPrice),
        status: qty === 0 ? ('OUT_OF_STOCK' as const) : ('LOW_STOCK' as const),
        stockByWarehouse: stockByWarehouseList(db, p.id),
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
    generatedAt: now(),
  };
}

function csvCell(value: unknown) {
  const s = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

route('GET', '/reports/low-stock', ({ db, req, user }) => {
  requirePerm(user(), 'reports:view');
  const query = q(S.lowStock, req.query);
  const report = lowStockReport(db, query);
  if (query.format !== 'csv') return ok(report);
  const codes = [...db.warehouses].sort((a, b) => a.code.localeCompare(b.code)).map((w) => w.code);
  const header = ['SKU', 'Product', 'Category', 'Unit', 'Status', 'On Hand', 'Reorder Level', 'Shortfall', 'Suggested Reorder Qty', 'Unit Price (INR)', 'Estimated Reorder Cost (INR)', ...codes.map((c) => `Qty @ ${c}`)];
  const lines = [header.map(csvCell).join(',')];
  for (const i of report.data) {
    const byCode = new Map(i.stockByWarehouse.map((w) => [w.warehouseCode, w.quantity]));
    lines.push(
      [i.sku, i.name, i.category, i.unit, i.status === 'OUT_OF_STOCK' ? 'Out of stock' : 'Low stock', i.quantity, i.reorderLevel, i.shortfall, i.suggestedReorderQty, i.unitPrice.toFixed(2), i.estimatedReorderCost.toFixed(2), ...codes.map((c) => byCode.get(c) ?? 0)]
        .map(csvCell)
        .join(','),
    );
  }
  return {
    status: 200,
    text: '﻿' + lines.join('\r\n') + '\r\n',
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="low-stock-report-${new Date().toISOString().slice(0, 10)}.csv"` },
  };
});

/* ---- audit ---- */

route('GET', '/audit-logs', ({ db, req, user }) => {
  requirePerm(user(), 'audit:view');
  const query = q(S.listAudit, req.query);
  const from = query.from?.toISOString();
  const to = query.to?.toISOString();
  const userOf = (a: AuditRec) => db.users.find((u) => u.id === a.userId);
  const items = db.auditLogs
    .filter((a) => !query.action || a.action === query.action)
    .filter((a) => !query.entityType || a.entityType === query.entityType)
    .filter((a) => !query.entityId || a.entityId === query.entityId)
    .filter((a) => !query.userId || a.userId === query.userId)
    .filter((a) => (!from || a.createdAt >= from) && (!to || a.createdAt <= to))
    .filter((a) => {
      if (!query.search) return true;
      const u = userOf(a);
      return [a.action, a.entityType, a.entityId, a.ipAddress, u?.name, u?.email].some((v) => includesCI(v, query.search!));
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((a) => {
      const u = userOf(a);
      return { ...a, user: u ? { id: u.id, name: u.name, email: u.email, role: u.role } : null, description: describe(a.action, a.details) };
    });
  return ok(paginate(items, query));
});

route('GET', '/audit-logs/filters', ({ db, user }) => {
  requirePerm(user(), 'audit:view');
  return ok({ data: { actions: [...AUDIT_ACTIONS].sort(), entityTypes: [...new Set(db.auditLogs.map((a) => a.entityType))].sort() } });
});

/* ------------------------------------------------------------------------- */
/* Entry point                                                               */
/* ------------------------------------------------------------------------- */

export function handleLocalRequest(req: LocalRequest): LocalResponse {
  const db = getDb();
  const path = req.path.split('?')[0]!.replace(/\/+$/, '') || '/';
  const matches = routes.filter((r) => r.pattern.test(path));
  const match = matches.find((r) => r.method === req.method);
  if (!match) {
    return { status: 404, body: { error: { code: 'NOT_FOUND', message: `Route ${req.method} ${path} not found` } } };
  }
  const params: Record<string, string> = {};
  const m = match.pattern.exec(path)!;
  match.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1]!)));
  let cachedUser: UserRec | null = null;
  try {
    const res = match.handler({ db, req, params, user: () => (cachedUser ??= authenticate(db, req.token)) });
    if (match.mutates) saveDb();
    return res;
  } catch (err) {
    if (err instanceof HttpError) return { status: err.status, body: { error: { code: err.code, message: err.message, details: err.details } } };
    if (err instanceof ZodError) {
      return { status: 400, body: { error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } } };
    }
    console.error('[standalone api] unexpected error', err);
    return { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } } };
  }
}
