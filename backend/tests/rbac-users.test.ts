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

describe('Role-based access control', () => {
  it('requires authentication on every business endpoint', async () => {
    const endpoints = [
      ['get', '/api/products'],
      ['get', '/api/warehouses'],
      ['get', '/api/dashboard/summary'],
      ['get', '/api/inventory/movements'],
      ['post', '/api/inventory/stock-in'],
      ['get', '/api/reports/low-stock'],
      ['get', '/api/audit-logs'],
      ['get', '/api/users'],
    ] as const;
    for (const [method, url] of endpoints) {
      const res = await request(app)[method](url);
      expect([url, res.status]).toEqual([url, 401]);
    }
  });

  it('STAFF: can view and do stock in/out, but cannot manage products, transfer, view audit logs or manage users', async () => {
    const p = await createProduct();
    const a = await createWarehouse();
    const b = await createWarehouse();
    await setStock(p.id, a.id, 10);

    expect((await request(app).get('/api/products').set(staff.auth)).status).toBe(200);
    expect((await request(app).get('/api/dashboard/summary').set(staff.auth)).status).toBe(200);
    expect((await request(app).get('/api/reports/low-stock').set(staff.auth)).status).toBe(200);
    expect((await request(app).post('/api/inventory/stock-out').set(staff.auth).send({ productId: p.id, warehouseId: a.id, quantity: 1 })).status).toBe(201);

    const forbidden = [
      request(app).post('/api/products').set(staff.auth).send({ sku: 'X-1', name: 'Nope', category: 'Misc', unitPrice: 1 }),
      request(app).put(`/api/products/${p.id}`).set(staff.auth).send({ name: 'Hacked' }),
      request(app).patch(`/api/products/${p.id}/status`).set(staff.auth).send({ isActive: false }),
      request(app).delete(`/api/products/${p.id}`).set(staff.auth),
      request(app).post('/api/inventory/transfer').set(staff.auth).send({ productId: p.id, fromWarehouseId: a.id, toWarehouseId: b.id, quantity: 1 }),
      request(app).get('/api/audit-logs').set(staff.auth),
      request(app).get('/api/users').set(staff.auth),
      request(app).post('/api/warehouses').set(staff.auth).send({ code: 'NEW', name: 'New WH', city: 'Hubli' }),
    ];
    for (const res of await Promise.all(forbidden)) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).name).not.toBe('Hacked');
  });

  it('MANAGER: manages products, transfers and audit logs, but not users, warehouses or hard deletes', async () => {
    const p = await createProduct();
    expect((await request(app).post('/api/products').set(manager.auth).send({ sku: 'M-1', name: 'Manager Product', category: 'Misc', unitPrice: 5 })).status).toBe(201);
    expect((await request(app).get('/api/audit-logs').set(manager.auth)).status).toBe(200);
    expect((await request(app).delete(`/api/products/${p.id}`).set(manager.auth)).status).toBe(403);
    expect((await request(app).get('/api/users').set(manager.auth)).status).toBe(403);
    expect((await request(app).post('/api/warehouses').set(manager.auth).send({ code: 'NEW', name: 'New WH', city: 'Hubli' })).status).toBe(403);
  });

  it('applies role changes immediately (role is read from the database, not the token)', async () => {
    const res1 = await request(app).get('/api/audit-logs').set(manager.auth);
    expect(res1.status).toBe(200);
    await prisma.user.update({ where: { id: manager.user.id }, data: { role: 'STAFF' } });
    const res2 = await request(app).get('/api/audit-logs').set(manager.auth);
    expect(res2.status).toBe(403);
  });
});

describe('User management (ADMIN)', () => {
  it('creates users with hashed passwords and never exposes the hash', async () => {
    const res = await request(app)
      .post('/api/users')
      .set(admin.auth)
      .send({ name: 'Priya Nair', email: 'Priya@Kaveri.test', role: 'STAFF', password: 'Welcome123' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email: 'priya@kaveri.test', role: 'STAFF', isActive: true });
    expect(res.body.data.passwordHash).toBeUndefined();

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'priya@kaveri.test' } });
    expect(stored.passwordHash).not.toBe('Welcome123');
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);

    const login = await request(app).post('/api/auth/login').send({ email: 'priya@kaveri.test', password: 'Welcome123' });
    expect(login.status).toBe(200);
  });

  it('enforces the password policy and unique emails', async () => {
    const weak = await request(app).post('/api/users').set(admin.auth).send({ name: 'Weak', email: 'weak@kaveri.test', role: 'STAFF', password: 'password' });
    expect(weak.status).toBe(400);
    const dup = await request(app).post('/api/users').set(admin.auth).send({ name: 'Dup', email: staff.user.email, role: 'STAFF', password: 'Welcome123' });
    expect(dup.status).toBe(409);
    const badRole = await request(app).post('/api/users').set(admin.auth).send({ name: 'Role', email: 'r@kaveri.test', role: 'SUPERUSER', password: 'Welcome123' });
    expect(badRole.status).toBe(400);
  });

  it('lists and searches users', async () => {
    const res = await request(app).get('/api/users?role=STAFF').set(admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.every((u: { role: string }) => u.role === 'STAFF')).toBe(true);
    const search = await request(app).get(`/api/users?search=${encodeURIComponent(manager.user.email)}`).set(admin.auth);
    expect(search.body.data).toHaveLength(1);
  });

  it('updates role and invalidates that user’s sessions', async () => {
    const res = await request(app).put(`/api/users/${staff.user.id}`).set(admin.auth).send({ role: 'MANAGER' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('MANAGER');
    expect((await request(app).get('/api/auth/me').set(staff.auth)).status).toBe(401);
  });

  it('prevents admins from changing their own role or deactivating themselves', async () => {
    expect((await request(app).put(`/api/users/${admin.user.id}`).set(admin.auth).send({ role: 'STAFF' })).status).toBe(409);
    expect((await request(app).patch(`/api/users/${admin.user.id}/status`).set(admin.auth).send({ isActive: false })).status).toBe(409);
  });

  it('keeps at least one active admin', async () => {
    const second = await createUser('ADMIN');
    // second admin demotes first: allowed because second remains
    expect((await request(app).put(`/api/users/${admin.user.id}`).set(second.auth).send({ role: 'MANAGER' })).status).toBe(200);
    // now no other admin can remove `second`; creating a third admin and trying to demote both leaves one
    const third = await createUser('ADMIN');
    expect((await request(app).patch(`/api/users/${second.user.id}/status`).set(third.auth).send({ isActive: false })).status).toBe(200);
    // third is the last active admin; nobody else (admin) exists to demote it, and it cannot demote itself
    expect((await request(app).put(`/api/users/${third.user.id}`).set(third.auth).send({ role: 'STAFF' })).status).toBe(409);
  });

  it('deactivates users (blocking login and existing tokens) and reactivates them', async () => {
    const off = await request(app).patch(`/api/users/${staff.user.id}/status`).set(admin.auth).send({ isActive: false });
    expect(off.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(staff.auth)).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: staff.user.email, password: staff.password })).status).toBe(401);

    await request(app).patch(`/api/users/${staff.user.id}/status`).set(admin.auth).send({ isActive: true }).expect(200);
    expect((await request(app).post('/api/auth/login').send({ email: staff.user.email, password: staff.password })).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: { in: ['USER_DEACTIVATED', 'USER_ACTIVATED'] } } })).toBe(2);
  });

  it('resets a user password', async () => {
    const res = await request(app).post(`/api/users/${staff.user.id}/reset-password`).set(admin.auth).send({ password: 'Reset12345' });
    expect(res.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(staff.auth)).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: staff.user.email, password: 'Reset12345' })).status).toBe(200);
  });
});
