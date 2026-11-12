import { createProduct, createUser, createWarehouse, getStock, makeApp, prisma, request, resetDb, setStock } from './helpers';

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

const validProduct = {
  sku: 'kd-bev-101',
  name: 'Filter Coffee 1kg',
  category: 'Beverages',
  unit: 'pack',
  unitPrice: 549.5,
  reorderLevel: 25,
  description: 'Chicory blend',
};

describe('Product CRUD', () => {
  it('creates a product (SKU normalised to upper case) and writes an audit log', async () => {
    const res = await request(app).post('/api/products').set(manager.auth).send(validProduct);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      sku: 'KD-BEV-101',
      name: 'Filter Coffee 1kg',
      unitPrice: 549.5,
      reorderLevel: 25,
      isActive: true,
      totalStock: 0,
      stockStatus: 'OUT_OF_STOCK',
    });
    const log = await prisma.auditLog.findFirst({ where: { action: 'PRODUCT_CREATED', entityId: res.body.data.id } });
    expect(log?.userId).toBe(manager.user.id);
  });

  it('creates a product with opening stock recorded as stock-in movements', async () => {
    const a = await createWarehouse();
    const b = await createWarehouse();
    const res = await request(app)
      .post('/api/products')
      .set(manager.auth)
      .send({ ...validProduct, openingStock: [{ warehouseId: a.id, quantity: 30 }, { warehouseId: b.id, quantity: 12 }] });
    expect(res.status).toBe(201);
    expect(res.body.data.totalStock).toBe(42);
    expect(await getStock(res.body.data.id, a.id)).toBe(30);
    expect(await prisma.stockMovement.count({ where: { productId: res.body.data.id, type: 'STOCK_IN' } })).toBe(2);
  });

  it('returns detailed validation errors', async () => {
    const res = await request(app)
      .post('/api/products')
      .set(manager.auth)
      .send({ sku: '!', name: '', category: '', unitPrice: -1, reorderLevel: 1.5 });
    expect(res.status).toBe(400);
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['sku', 'name', 'category', 'unitPrice', 'reorderLevel']));
  });

  it('rejects prices with more than two decimals', async () => {
    const res = await request(app).post('/api/products').set(manager.auth).send({ ...validProduct, unitPrice: 10.123 });
    expect(res.status).toBe(400);
  });

  it('returns 409 on duplicate SKU (case-insensitive)', async () => {
    await request(app).post('/api/products').set(manager.auth).send(validProduct).expect(201);
    const res = await request(app).post('/api/products').set(manager.auth).send({ ...validProduct, sku: 'KD-BEV-101' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('gets a product with per-warehouse stock and recent movements', async () => {
    const p = await createProduct({ unitPrice: 10, reorderLevel: 5 });
    const a = await createWarehouse();
    const b = await createWarehouse();
    await setStock(p.id, a.id, 7);
    await setStock(p.id, b.id, 3);

    const res = await request(app).get(`/api/products/${p.id}`).set(staff.auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ totalStock: 10, stockValue: 100, stockStatus: 'IN_STOCK' });
    expect(res.body.data.stockByWarehouse).toHaveLength(2);
    expect(Array.isArray(res.body.data.recentMovements)).toBe(true);
  });

  it('returns 400 for malformed ids and 404 for unknown products', async () => {
    expect((await request(app).get('/api/products/abc').set(staff.auth)).status).toBe(400);
    expect((await request(app).get('/api/products/00000000-0000-4000-8000-000000000000').set(staff.auth)).status).toBe(404);
  });

  it('updates a product and records the changed fields', async () => {
    const p = await createProduct({ unitPrice: 100, reorderLevel: 10 });
    const res = await request(app).put(`/api/products/${p.id}`).set(manager.auth).send({ unitPrice: 120, name: 'Renamed Product' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ unitPrice: 120, name: 'Renamed Product' });

    const log = await prisma.auditLog.findFirst({ where: { action: 'PRODUCT_UPDATED', entityId: p.id } });
    expect(log?.details).toMatchObject({ changes: { unitPrice: { from: 100, to: 120 }, name: { to: 'Renamed Product' } } });
  });

  it('rejects an empty update and SKU collisions', async () => {
    const p1 = await createProduct({ sku: 'AAA-1' });
    await createProduct({ sku: 'BBB-1' });
    expect((await request(app).put(`/api/products/${p1.id}`).set(manager.auth).send({})).status).toBe(400);
    expect((await request(app).put(`/api/products/${p1.id}`).set(manager.auth).send({ sku: 'bbb-1' })).status).toBe(409);
  });

  it('deactivates and re-activates a product', async () => {
    const p = await createProduct();
    const off = await request(app).patch(`/api/products/${p.id}/status`).set(manager.auth).send({ isActive: false });
    expect(off.status).toBe(200);
    expect(off.body.data.isActive).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: 'PRODUCT_DEACTIVATED', entityId: p.id } })).toBe(1);

    const on = await request(app).patch(`/api/products/${p.id}/status`).set(manager.auth).send({ isActive: true });
    expect(on.body.data.isActive).toBe(true);
  });

  it('allows admins to hard-delete products without history', async () => {
    const p = await createProduct();
    const res = await request(app).delete(`/api/products/${p.id}`).set(admin.auth);
    expect(res.status).toBe(204);
    expect(await prisma.product.findUnique({ where: { id: p.id } })).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: 'PRODUCT_DELETED', entityId: p.id } })).toBe(1);
  });

  it('refuses to delete products with stock history (409) - deactivate instead', async () => {
    const p = await createProduct();
    const wh = await createWarehouse();
    await request(app).post('/api/inventory/stock-in').set(staff.auth).send({ productId: p.id, warehouseId: wh.id, quantity: 1 }).expect(201);
    const res = await request(app).delete(`/api/products/${p.id}`).set(admin.auth);
    expect(res.status).toBe(409);
    expect(await prisma.product.findUnique({ where: { id: p.id } })).not.toBeNull();
  });
});

describe('Product search, filter, sort and pagination', () => {
  beforeEach(async () => {
    const a = await createWarehouse();
    const b = await createWarehouse();
    const coffee = await createProduct({ sku: 'BEV-1', name: 'Filter Coffee', category: 'Beverages', reorderLevel: 10, unitPrice: 300 });
    const tea = await createProduct({ sku: 'BEV-2', name: 'Masala Tea', category: 'Beverages', reorderLevel: 10, unitPrice: 200 });
    const rice = await createProduct({ sku: 'STP-1', name: 'Sona Masoori Rice', category: 'Staples', reorderLevel: 50, unitPrice: 1500 });
    await createProduct({ sku: 'STP-2', name: 'Old Atta', category: 'Staples', isActive: false });
    await setStock(coffee.id, a.id, 100);
    await setStock(tea.id, a.id, 4); // low
    await setStock(tea.id, b.id, 2); // low (total 6 <= 10)
    await setStock(rice.id, b.id, 0); // out of stock
  });

  it('searches by name, SKU and category (case-insensitive)', async () => {
    const byName = await request(app).get('/api/products?search=coffee').set(staff.auth);
    expect(byName.body.data.map((p: { sku: string }) => p.sku)).toEqual(['BEV-1']);
    const bySku = await request(app).get('/api/products?search=stp').set(staff.auth);
    expect(bySku.body.pagination.total).toBe(2);
    const special = await request(app).get('/api/products?search=%25').set(staff.auth);
    expect(special.body.pagination.total).toBe(0); // % is treated literally
  });

  it('filters by category, status and stock status', async () => {
    expect((await request(app).get('/api/products?category=Beverages').set(staff.auth)).body.pagination.total).toBe(2);
    expect((await request(app).get('/api/products?status=inactive').set(staff.auth)).body.data[0].sku).toBe('STP-2');
    expect((await request(app).get('/api/products?status=active').set(staff.auth)).body.pagination.total).toBe(3);

    const low = await request(app).get('/api/products?stockStatus=low_stock&status=active').set(staff.auth);
    expect(low.body.data.map((p: { sku: string }) => p.sku).sort()).toEqual(['BEV-2', 'STP-1']);
    const out = await request(app).get('/api/products?stockStatus=out_of_stock&status=active').set(staff.auth);
    expect(out.body.data.map((p: { sku: string }) => p.sku)).toEqual(['STP-1']);
    const inStock = await request(app).get('/api/products?stockStatus=in_stock').set(staff.auth);
    expect(inStock.body.data.map((p: { sku: string }) => p.sku)).toEqual(['BEV-1']);
  });

  it('sorts by computed stock and paginates', async () => {
    const res = await request(app).get('/api/products?sortBy=totalStock&sortOrder=desc&status=active').set(staff.auth);
    expect(res.body.data.map((p: { totalStock: number }) => p.totalStock)).toEqual([100, 6, 0]);
    expect(res.body.data[0].stockValue).toBe(30000);

    const page = await request(app).get('/api/products?pageSize=2&page=2&sortBy=sku').set(staff.auth);
    expect(page.body.data.map((p: { sku: string }) => p.sku)).toEqual(['STP-1', 'STP-2']);
    expect(page.body.pagination).toMatchObject({ total: 4, totalPages: 2 });

    const beyond = await request(app).get('/api/products?page=9').set(staff.auth);
    expect(beyond.body.data).toHaveLength(0);
    expect(beyond.body.pagination.total).toBe(4);
  });

  it('rejects invalid query parameters', async () => {
    expect((await request(app).get('/api/products?sortBy=password').set(staff.auth)).status).toBe(400);
    expect((await request(app).get('/api/products?pageSize=1000').set(staff.auth)).status).toBe(400);
  });

  it('lists categories with counts', async () => {
    const res = await request(app).get('/api/products/categories').set(staff.auth);
    expect(res.body.data).toEqual([
      { name: 'Beverages', productCount: 2 },
      { name: 'Staples', productCount: 2 },
    ]);
  });
});
