import {
  createProduct,
  createUser,
  createWarehouse,
  getStock,
  makeApp,
  prisma,
  request,
  resetDb,
  setStock,
} from './helpers';

const app = makeApp();

let staff: Awaited<ReturnType<typeof createUser>>;
let manager: Awaited<ReturnType<typeof createUser>>;

beforeEach(async () => {
  await resetDb();
  staff = await createUser('STAFF');
  manager = await createUser('MANAGER');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Stock In', () => {
  it('adds stock, records a movement and an audit log atomically', async () => {
    const product = await createProduct();
    const wh = await createWarehouse();

    const res = await request(app)
      .post('/api/inventory/stock-in')
      .set(staff.auth)
      .send({ productId: product.id, warehouseId: wh.id, quantity: 40, reference: 'PO-1001', notes: 'Supplier delivery' });

    expect(res.status).toBe(201);
    expect(res.body.data.movement).toMatchObject({ type: 'STOCK_IN', quantity: 40, reference: 'PO-1001' });
    expect(res.body.data.stockLevels[0].quantity).toBe(40);
    expect(await getStock(product.id, wh.id)).toBe(40);

    await request(app).post('/api/inventory/stock-in').set(staff.auth).send({ productId: product.id, warehouseId: wh.id, quantity: 10 }).expect(201);
    expect(await getStock(product.id, wh.id)).toBe(50);

    expect(await prisma.stockMovement.count({ where: { productId: product.id, type: 'STOCK_IN' } })).toBe(2);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'STOCK_IN', entityId: res.body.data.movement.id } });
    expect(audit).toMatchObject({ userId: staff.user.id, entityType: 'StockMovement' });
    expect(audit?.details).toMatchObject({ quantity: 40, balanceAfter: 40 });
  });

  it.each([
    [{ quantity: 0 }, 'quantity'],
    [{ quantity: -5 }, 'quantity'],
    [{ quantity: 2.5 }, 'quantity'],
    [{ quantity: 'ten' }, 'quantity'],
    [{ quantity: 1_000_001 }, 'quantity'],
    [{ productId: 'not-a-uuid' }, 'productId'],
    [{ warehouseId: undefined }, 'warehouseId'],
  ])('rejects invalid payload %j with 400', async (patch, field) => {
    const product = await createProduct();
    const wh = await createWarehouse();
    const res = await request(app)
      .post('/api/inventory/stock-in')
      .set(staff.auth)
      .send({ productId: product.id, warehouseId: wh.id, quantity: 5, ...patch });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(field);
  });

  it('returns 404 for unknown product or warehouse', async () => {
    const product = await createProduct();
    const wh = await createWarehouse();
    const missing = '00000000-0000-4000-8000-000000000000';
    expect((await request(app).post('/api/inventory/stock-in').set(staff.auth).send({ productId: missing, warehouseId: wh.id, quantity: 1 })).status).toBe(404);
    expect((await request(app).post('/api/inventory/stock-in').set(staff.auth).send({ productId: product.id, warehouseId: missing, quantity: 1 })).status).toBe(404);
  });

  it('refuses stock operations on inactive products and warehouses with 409', async () => {
    const inactiveProduct = await createProduct({ isActive: false });
    const activeProduct = await createProduct();
    const wh = await createWarehouse();
    const closedWh = await createWarehouse({ isActive: false });

    const r1 = await request(app).post('/api/inventory/stock-in').set(staff.auth).send({ productId: inactiveProduct.id, warehouseId: wh.id, quantity: 1 });
    expect(r1.status).toBe(409);
    const r2 = await request(app).post('/api/inventory/stock-in').set(staff.auth).send({ productId: activeProduct.id, warehouseId: closedWh.id, quantity: 1 });
    expect(r2.status).toBe(409);
  });
});

describe('Stock Out', () => {
  it('removes stock when sufficient quantity exists', async () => {
    const product = await createProduct();
    const wh = await createWarehouse();
    await setStock(product.id, wh.id, 30);

    const res = await request(app)
      .post('/api/inventory/stock-out')
      .set(staff.auth)
      .send({ productId: product.id, warehouseId: wh.id, quantity: 30, reference: 'INV-77' });

    expect(res.status).toBe(201);
    expect(res.body.data.stockLevels[0].quantity).toBe(0);
    expect(await getStock(product.id, wh.id)).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'STOCK_OUT' } })).toBe(1);
  });

  it('returns 409 Conflict and leaves stock untouched when stock is insufficient', async () => {
    const product = await createProduct();
    const wh = await createWarehouse();
    await setStock(product.id, wh.id, 5);

    const res = await request(app).post('/api/inventory/stock-out').set(staff.auth).send({ productId: product.id, warehouseId: wh.id, quantity: 6 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.error.details).toMatchObject({ available: 5, requested: 6 });
    expect(await getStock(product.id, wh.id)).toBe(5);
    expect(await prisma.stockMovement.count()).toBe(0);

    const rejection = await prisma.auditLog.findFirst({ where: { action: 'STOCK_OPERATION_REJECTED' } });
    expect(rejection?.details).toMatchObject({ type: 'STOCK_OUT', requested: 6, available: 5 });
  });

  it('returns 409 when the product has never been stocked in that warehouse', async () => {
    const product = await createProduct();
    const wh = await createWarehouse();
    const res = await request(app).post('/api/inventory/stock-out').set(staff.auth).send({ productId: product.id, warehouseId: wh.id, quantity: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.details.available).toBe(0);
  });

  it('never goes negative under heavy concurrent stock-out requests', async () => {
    const product = await createProduct();
    const wh = await createWarehouse();
    await setStock(product.id, wh.id, 50);

    // 25 concurrent requests each asking for 4 units => only 12 can succeed (48 units), 2 units remain.
    const responses = await Promise.all(
      Array.from({ length: 25 }, () =>
        request(app).post('/api/inventory/stock-out').set(staff.auth).send({ productId: product.id, warehouseId: wh.id, quantity: 4 }),
      ),
    );

    const ok = responses.filter((r) => r.status === 201).length;
    const conflicts = responses.filter((r) => r.status === 409).length;
    expect(ok).toBe(12);
    expect(conflicts).toBe(13);
    expect(await getStock(product.id, wh.id)).toBe(2);

    const moved = await prisma.stockMovement.aggregate({ where: { productId: product.id, type: 'STOCK_OUT' }, _sum: { quantity: true }, _count: true });
    expect(moved._count).toBe(12);
    expect(moved._sum.quantity).toBe(48);
  });

  it('keeps the ledger consistent with mixed concurrent stock-in and stock-out', async () => {
    const product = await createProduct();
    const wh = await createWarehouse();
    await setStock(product.id, wh.id, 10);

    const ops = Array.from({ length: 30 }, (_, i) =>
      i % 2 === 0
        ? request(app).post('/api/inventory/stock-in').set(staff.auth).send({ productId: product.id, warehouseId: wh.id, quantity: 3 })
        : request(app).post('/api/inventory/stock-out').set(staff.auth).send({ productId: product.id, warehouseId: wh.id, quantity: 5 }),
    );
    const responses = await Promise.all(ops);
    expect(responses.every((r) => r.status === 201 || r.status === 409)).toBe(true);

    const ins = await prisma.stockMovement.aggregate({ where: { type: 'STOCK_IN' }, _sum: { quantity: true } });
    const outs = await prisma.stockMovement.aggregate({ where: { type: 'STOCK_OUT' }, _sum: { quantity: true } });
    const final = await getStock(product.id, wh.id);
    expect(final).toBeGreaterThanOrEqual(0);
    expect(final).toBe(10 + (ins._sum.quantity ?? 0) - (outs._sum.quantity ?? 0));
  });

  it('is protected by a database CHECK constraint as a last line of defence', async () => {
    const product = await createProduct();
    const wh = await createWarehouse();
    await setStock(product.id, wh.id, 1);
    await expect(
      prisma.$executeRaw`UPDATE stock_levels SET quantity = -1 WHERE product_id = ${product.id}::uuid`,
    ).rejects.toThrow(/stock_levels_quantity_non_negative/);
  });
});

describe('Stock Transfer', () => {
  it('moves stock between warehouses in one transaction', async () => {
    const product = await createProduct();
    const a = await createWarehouse();
    const b = await createWarehouse();
    await setStock(product.id, a.id, 100);

    const res = await request(app)
      .post('/api/inventory/transfer')
      .set(manager.auth)
      .send({ productId: product.id, fromWarehouseId: a.id, toWarehouseId: b.id, quantity: 35, reference: 'TRF-1' });

    expect(res.status).toBe(201);
    expect(res.body.data.movement).toMatchObject({ type: 'TRANSFER', quantity: 35 });
    expect(await getStock(product.id, a.id)).toBe(65);
    expect(await getStock(product.id, b.id)).toBe(35);
    expect(await prisma.auditLog.count({ where: { action: 'STOCK_TRANSFER' } })).toBe(1);
  });

  it('returns 409 when the source warehouse lacks stock and changes nothing', async () => {
    const product = await createProduct();
    const a = await createWarehouse();
    const b = await createWarehouse();
    await setStock(product.id, a.id, 10);
    await setStock(product.id, b.id, 4);

    const res = await request(app).post('/api/inventory/transfer').set(manager.auth).send({ productId: product.id, fromWarehouseId: a.id, toWarehouseId: b.id, quantity: 11 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await getStock(product.id, a.id)).toBe(10);
    expect(await getStock(product.id, b.id)).toBe(4);
    expect(await prisma.stockMovement.count()).toBe(0);
  });

  it('rejects transfers to the same warehouse with 400', async () => {
    const product = await createProduct();
    const a = await createWarehouse();
    const res = await request(app).post('/api/inventory/transfer').set(manager.auth).send({ productId: product.id, fromWarehouseId: a.id, toWarehouseId: a.id, quantity: 1 });
    expect(res.status).toBe(400);
  });

  it('handles concurrent opposite-direction transfers without deadlock or losing stock', async () => {
    const product = await createProduct();
    const a = await createWarehouse();
    const b = await createWarehouse();
    await setStock(product.id, a.id, 40);
    await setStock(product.id, b.id, 40);

    const ops = Array.from({ length: 30 }, (_, i) =>
      request(app)
        .post('/api/inventory/transfer')
        .set(manager.auth)
        .send({ productId: product.id, fromWarehouseId: i % 2 ? a.id : b.id, toWarehouseId: i % 2 ? b.id : a.id, quantity: 7 }),
    );
    const responses = await Promise.all(ops);
    expect(responses.every((r) => r.status === 201 || r.status === 409)).toBe(true);

    const qa = await getStock(product.id, a.id);
    const qb = await getStock(product.id, b.id);
    expect(qa).toBeGreaterThanOrEqual(0);
    expect(qb).toBeGreaterThanOrEqual(0);
    expect(qa + qb).toBe(80); // stock is conserved
  });

  it('never oversells the source under concurrent transfers', async () => {
    const product = await createProduct();
    const a = await createWarehouse();
    const b = await createWarehouse();
    const c = await createWarehouse();
    await setStock(product.id, a.id, 20);

    const responses = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        request(app).post('/api/inventory/transfer').set(manager.auth).send({ productId: product.id, fromWarehouseId: a.id, toWarehouseId: i % 2 ? b.id : c.id, quantity: 3 }),
      ),
    );
    expect(responses.filter((r) => r.status === 201)).toHaveLength(6);
    expect(await getStock(product.id, a.id)).toBe(2);
    expect((await getStock(product.id, b.id)) + (await getStock(product.id, c.id))).toBe(18);
  });
});

describe('Movement history & stock levels', () => {
  it('lists movements with filters and pagination', async () => {
    const product = await createProduct({ sku: 'FILTER-1', name: 'Filter Coffee' });
    const other = await createProduct();
    const a = await createWarehouse();
    const b = await createWarehouse();

    await request(app).post('/api/inventory/stock-in').set(staff.auth).send({ productId: product.id, warehouseId: a.id, quantity: 50, reference: 'PO-9' }).expect(201);
    await request(app).post('/api/inventory/stock-in').set(staff.auth).send({ productId: other.id, warehouseId: b.id, quantity: 5 }).expect(201);
    await request(app).post('/api/inventory/stock-out').set(staff.auth).send({ productId: product.id, warehouseId: a.id, quantity: 5 }).expect(201);
    await request(app).post('/api/inventory/transfer').set(manager.auth).send({ productId: product.id, fromWarehouseId: a.id, toWarehouseId: b.id, quantity: 5 }).expect(201);

    const all = await request(app).get('/api/inventory/movements').set(staff.auth);
    expect(all.status).toBe(200);
    expect(all.body.pagination.total).toBe(4);
    expect(all.body.data[0].type).toBe('TRANSFER'); // newest first

    const byType = await request(app).get('/api/inventory/movements?type=STOCK_OUT').set(staff.auth);
    expect(byType.body.data).toHaveLength(1);

    const byWarehouse = await request(app).get(`/api/inventory/movements?warehouseId=${b.id}`).set(staff.auth);
    expect(byWarehouse.body.pagination.total).toBe(2);

    const bySearch = await request(app).get('/api/inventory/movements?search=coffee').set(staff.auth);
    expect(bySearch.body.pagination.total).toBe(3);

    const paged = await request(app).get('/api/inventory/movements?page=2&pageSize=3').set(staff.auth);
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.pagination).toMatchObject({ page: 2, pageSize: 3, total: 4, totalPages: 2 });

    const bad = await request(app).get('/api/inventory/movements?type=BOGUS').set(staff.auth);
    expect(bad.status).toBe(400);
  });

  it('lists stock levels per warehouse', async () => {
    const product = await createProduct({ unitPrice: 12.5 });
    const a = await createWarehouse();
    await setStock(product.id, a.id, 8);
    const res = await request(app).get(`/api/inventory/stock-levels?warehouseId=${a.id}`).set(staff.auth);
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ quantity: 8, value: 100 });
  });
});
