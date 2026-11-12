import { createProduct, createUser, createWarehouse, makeApp, prisma, request, resetDb, setStock } from './helpers';

const app = makeApp();
let admin: Awaited<ReturnType<typeof createUser>>;
let manager: Awaited<ReturnType<typeof createUser>>;
let staff: Awaited<ReturnType<typeof createUser>>;

beforeEach(async () => {
  await resetDb();
  admin = await createUser('ADMIN');
  manager = await createUser('MANAGER');
  staff = await createUser('STAFF');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Warehouses', () => {
  it('admin creates, updates and lists warehouses with live stock statistics', async () => {
    const created = await request(app)
      .post('/api/warehouses')
      .set(admin.auth)
      .send({ code: 'blr-01', name: 'Bengaluru Hub', city: 'Bengaluru', capacity: 1000, address: 'Peenya' });
    expect(created.status).toBe(201);
    expect(created.body.data.code).toBe('BLR-01');

    const dup = await request(app).post('/api/warehouses').set(admin.auth).send({ code: 'BLR-01', name: 'Again', city: 'Bengaluru' });
    expect(dup.status).toBe(409);

    const p = await createProduct({ unitPrice: 10, reorderLevel: 100 });
    await setStock(p.id, created.body.data.id, 250);

    const list = await request(app).get('/api/warehouses').set(staff.auth);
    expect(list.status).toBe(200);
    expect(list.body.data[0]).toMatchObject({ code: 'BLR-01', totalUnits: 250, skuCount: 1, stockValue: 2500, utilization: 25 });

    const updated = await request(app).put(`/api/warehouses/${created.body.data.id}`).set(admin.auth).send({ name: 'Bengaluru Central', capacity: 500 });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ name: 'Bengaluru Central', utilization: 50 });

    const detail = await request(app).get(`/api/warehouses/${created.body.data.id}`).set(staff.auth);
    expect(detail.body.data.totalUnits).toBe(250);

    expect(await prisma.auditLog.count({ where: { entityType: 'Warehouse' } })).toBe(2);
  });

  it('blocks deactivating a warehouse that still holds stock', async () => {
    const wh = await createWarehouse();
    const p = await createProduct();
    await setStock(p.id, wh.id, 3);
    const res = await request(app).patch(`/api/warehouses/${wh.id}/status`).set(admin.auth).send({ isActive: false });
    expect(res.status).toBe(409);

    await setStock(p.id, wh.id, 0);
    const ok = await request(app).patch(`/api/warehouses/${wh.id}/status`).set(admin.auth).send({ isActive: false });
    expect(ok.status).toBe(200);
    expect(ok.body.data.isActive).toBe(false);
  });
});

describe('Dashboard', () => {
  it('computes KPIs, warehouse breakdown, trend and activities from live data', async () => {
    const a = await createWarehouse({ code: 'A' });
    const b = await createWarehouse({ code: 'B' });
    const p1 = await createProduct({ unitPrice: 10, reorderLevel: 5 });
    const p2 = await createProduct({ unitPrice: 2.5, reorderLevel: 50, category: 'Snacks' });
    await createProduct({ unitPrice: 99, reorderLevel: 1, isActive: false });

    await request(app).post('/api/inventory/stock-in').set(staff.auth).send({ productId: p1.id, warehouseId: a.id, quantity: 100 }).expect(201);
    await request(app).post('/api/inventory/stock-in').set(staff.auth).send({ productId: p2.id, warehouseId: b.id, quantity: 20 }).expect(201);
    await request(app).post('/api/inventory/stock-out').set(staff.auth).send({ productId: p1.id, warehouseId: a.id, quantity: 10 }).expect(201);
    await request(app).post('/api/inventory/transfer').set(manager.auth).send({ productId: p1.id, fromWarehouseId: a.id, toWarehouseId: b.id, quantity: 30 }).expect(201);

    const res = await request(app).get('/api/dashboard/summary').set(staff.auth);
    expect(res.status).toBe(200);
    const { kpis, warehouses, movementTrend, recentActivities, categoryBreakdown, lowStockItems } = res.body.data;

    expect(kpis).toMatchObject({
      totalSkus: 2,
      inactiveProducts: 1,
      totalInventory: 110, // 90 of p1 + 20 of p2
      lowStockCount: 1, // p2: 20 <= 50
      outOfStockCount: 0,
      totalStockValue: 950, // 90*10 + 20*2.5
      warehouseCount: 2,
      todayMovements: 4,
    });
    expect(warehouses.find((w: { code: string }) => w.code === 'A')).toMatchObject({ totalUnits: 60, stockValue: 600 });
    expect(warehouses.find((w: { code: string }) => w.code === 'B')).toMatchObject({ totalUnits: 50, stockValue: 350 });

    expect(movementTrend).toHaveLength(14);
    const today = movementTrend[movementTrend.length - 1];
    expect(today).toMatchObject({ stockIn: 120, stockOut: 10, transfer: 30 });

    expect(recentActivities[0]).toMatchObject({ action: 'STOCK_TRANSFER' });
    expect(recentActivities[0].description).toMatch(/Transferred 30 units/);
    expect(categoryBreakdown.map((c: { category: string }) => c.category)).toEqual(['General', 'Snacks']);
    expect(lowStockItems).toHaveLength(1);
  });
});

describe('Low-stock report', () => {
  let a: Awaited<ReturnType<typeof createWarehouse>>;
  let b: Awaited<ReturnType<typeof createWarehouse>>;

  beforeEach(async () => {
    a = await createWarehouse({ code: 'WA' });
    b = await createWarehouse({ code: 'WB' });
    const healthy = await createProduct({ sku: 'OK-1', reorderLevel: 10 });
    const low = await createProduct({ sku: 'LOW-1', reorderLevel: 20, unitPrice: 50, category: 'Dairy' });
    await createProduct({ sku: 'OUT-1', reorderLevel: 5, unitPrice: 4 });
    const inactive = await createProduct({ sku: 'INACTIVE-1', reorderLevel: 100, isActive: false });
    await setStock(healthy.id, a.id, 5);
    await setStock(healthy.id, b.id, 50);
    await setStock(low.id, a.id, 8);
    await setStock(low.id, b.id, 4);
    await setStock(inactive.id, a.id, 1);
  });

  it('lists active products at or below reorder level, most urgent first', async () => {
    const res = await request(app).get('/api/reports/low-stock').set(staff.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.map((i: { sku: string }) => i.sku)).toEqual(['OUT-1', 'LOW-1']);
    expect(res.body.summary).toMatchObject({ totalItems: 2, outOfStock: 1, lowStock: 1 });

    const low = res.body.data[1];
    expect(low).toMatchObject({ quantity: 12, reorderLevel: 20, shortfall: 8, suggestedReorderQty: 28, estimatedReorderCost: 1400, status: 'LOW_STOCK' });
    expect(low.stockByWarehouse).toHaveLength(2);
  });

  it('supports warehouse scope and status/category filters', async () => {
    const scoped = await request(app).get(`/api/reports/low-stock?warehouseId=${a.id}`).set(staff.auth);
    expect(scoped.body.scope.type).toBe('WAREHOUSE');
    expect(scoped.body.data.map((i: { sku: string }) => i.sku)).toEqual(['OUT-1', 'OK-1', 'LOW-1']);

    const outOnly = await request(app).get('/api/reports/low-stock?status=out').set(staff.auth);
    expect(outOnly.body.data.map((i: { sku: string }) => i.sku)).toEqual(['OUT-1']);

    const dairy = await request(app).get('/api/reports/low-stock?category=Dairy').set(staff.auth);
    expect(dairy.body.data.map((i: { sku: string }) => i.sku)).toEqual(['LOW-1']);

    expect((await request(app).get('/api/reports/low-stock?warehouseId=00000000-0000-4000-8000-000000000000').set(staff.auth)).status).toBe(404);
  });

  it('exports CSV', async () => {
    const res = await request(app).get('/api/reports/low-stock?format=csv').set(staff.auth);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/low-stock-report-.*\.csv/);
    const lines = res.text.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toContain('SKU,Product,Category');
    expect(lines[0]).toContain('Qty @ WA');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/^OUT-1,/);
  });
});

describe('Audit logs', () => {
  it('records every important operation and supports filtering', async () => {
    const wh = await createWarehouse();
    const created = await request(app).post('/api/products').set(manager.auth).send({ sku: 'AUD-1', name: 'Audited', category: 'Misc', unitPrice: 1 });
    await request(app).post('/api/inventory/stock-in').set(staff.auth).send({ productId: created.body.data.id, warehouseId: wh.id, quantity: 5 }).expect(201);
    await request(app).post('/api/inventory/stock-out').set(staff.auth).send({ productId: created.body.data.id, warehouseId: wh.id, quantity: 50 }).expect(409);

    const all = await request(app).get('/api/audit-logs').set(admin.auth);
    expect(all.status).toBe(200);
    const actions = all.body.data.map((l: { action: string }) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['PRODUCT_CREATED', 'STOCK_IN', 'STOCK_OPERATION_REJECTED']));
    expect(all.body.data[0]).toHaveProperty('description');
    expect(all.body.data[0]).toHaveProperty('user');

    const filtered = await request(app).get('/api/audit-logs?action=STOCK_IN').set(admin.auth);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0].user.id).toBe(staff.user.id);

    const byUser = await request(app).get(`/api/audit-logs?userId=${manager.user.id}`).set(admin.auth);
    expect(byUser.body.data.every((l: { userId: string }) => l.userId === manager.user.id)).toBe(true);

    const byEntity = await request(app).get(`/api/audit-logs?entityId=${created.body.data.id}`).set(admin.auth);
    expect(byEntity.body.data[0].action).toBe('PRODUCT_CREATED');

    const future = await request(app).get(`/api/audit-logs?from=${new Date(Date.now() + 86_400_000).toISOString()}`).set(admin.auth);
    expect(future.body.data).toHaveLength(0);

    const filters = await request(app).get('/api/audit-logs/filters').set(manager.auth);
    expect(filters.body.data.actions).toContain('STOCK_TRANSFER');
    expect(filters.body.data.entityTypes).toEqual(expect.arrayContaining(['Product', 'StockMovement']));
  });
});
