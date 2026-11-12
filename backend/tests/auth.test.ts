import { createUser, makeApp, prisma, request, resetDb } from './helpers';
import jwt from 'jsonwebtoken';

const app = makeApp();

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/auth/login', () => {
  it('returns a JWT and the user profile with role permissions on valid credentials', async () => {
    const { user, password } = await createUser('MANAGER', { email: 'ravi@kaveri.test' });

    const res = await request(app).post('/api/auth/login').send({ email: 'RAVI@kaveri.test ', password });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.expiresAt).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ id: user.id, email: 'ravi@kaveri.test', role: 'MANAGER' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.permissions).toEqual(expect.arrayContaining(['products:create', 'inventory:transfer']));
    expect(res.body.user.permissions).not.toContain('users:manage');

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.lastLoginAt).not.toBeNull();

    const log = await prisma.auditLog.findFirst({ where: { action: 'AUTH_LOGIN', userId: user.id } });
    expect(log).not.toBeNull();
  });

  it('rejects a wrong password with 401 and records a failed login audit entry', async () => {
    const { user } = await createUser('STAFF', { email: 'staff@kaveri.test' });
    const res = await request(app).post('/api/auth/login').send({ email: 'staff@kaveri.test', password: 'wrong-password1' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    const log = await prisma.auditLog.findFirst({ where: { action: 'AUTH_LOGIN_FAILED', userId: user.id } });
    expect(log?.details).toMatchObject({ reason: 'BAD_PASSWORD' });
  });

  it('rejects unknown emails with the same generic message', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@kaveri.test', password: 'whatever123' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('rejects deactivated accounts', async () => {
    const { password } = await createUser('STAFF', { email: 'old@kaveri.test', isActive: false });
    const res = await request(app).post('/api/auth/login').send({ email: 'old@kaveri.test', password });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/deactivated/i);
  });

  it('validates the request body with field level errors', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('rate limits repeated failed login attempts with 429', async () => {
    await createUser('STAFF', { email: 'target@kaveri.test' });
    const limitedApp = makeApp(); // fresh limiter state
    const attempt = () => request(limitedApp).post('/api/auth/login').send({ email: 'target@kaveri.test', password: 'bad-guess-1' });

    for (let i = 0; i < 5; i++) {
      const res = await attempt();
      expect(res.status).toBe(401);
    }
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('does not count successful logins against the rate limit', async () => {
    const { password } = await createUser('STAFF', { email: 'ok@kaveri.test' });
    const limitedApp = makeApp();
    for (let i = 0; i < 7; i++) {
      const res = await request(limitedApp).post('/api/auth/login').send({ email: 'ok@kaveri.test', password });
      expect(res.status).toBe(200);
    }
  });
});

describe('Authenticated session', () => {
  it('GET /api/auth/me requires a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('GET /api/auth/me returns the current user', async () => {
    const { user, auth } = await createUser('ADMIN');
    const res = await request(app).get('/api/auth/me').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: user.id, role: 'ADMIN' });
    expect(res.body.user.permissions).toContain('users:manage');
  });

  it('rejects tampered and foreign-signed tokens', async () => {
    const { user, token } = await createUser('ADMIN');
    const tampered = token.slice(0, -4) + (token.endsWith('aaaa') ? 'bbbb' : 'aaaa');
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tampered}`)).status).toBe(401);

    const forged = jwt.sign({ role: 'ADMIN', ver: 0 }, 'some-other-secret-that-is-long-enough!!', { subject: user.id, issuer: 'stocksense-api' });
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${forged}`)).status).toBe(401);
  });

  it('rejects expired tokens', async () => {
    const { user } = await createUser('ADMIN');
    const expired = jwt.sign({ role: 'ADMIN', ver: 0 }, process.env.JWT_SECRET!, {
      subject: user.id,
      issuer: 'stocksense-api',
      expiresIn: -10,
    });
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`)).status).toBe(401);
  });

  it('invalidates existing tokens when the user is deactivated', async () => {
    const { user, auth } = await createUser('STAFF');
    expect((await request(app).get('/api/auth/me').set(auth)).status).toBe(200);
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    expect((await request(app).get('/api/auth/me').set(auth)).status).toBe(401);
  });

  it('changes password, invalidates old tokens and issues a new one', async () => {
    const { user, auth, password } = await createUser('STAFF');

    const bad = await request(app).post('/api/auth/change-password').set(auth).send({ currentPassword: 'wrong-pass1', newPassword: 'NewPassw0rd' });
    expect(bad.status).toBe(400);

    const weak = await request(app).post('/api/auth/change-password').set(auth).send({ currentPassword: password, newPassword: 'short' });
    expect(weak.status).toBe(400);

    const res = await request(app).post('/api/auth/change-password').set(auth).send({ currentPassword: password, newPassword: 'NewPassw0rd' });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));

    expect((await request(app).get('/api/auth/me').set(auth)).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`)).status).toBe(200);

    const login = await request(app).post('/api/auth/login').send({ email: user.email, password: 'NewPassw0rd' });
    expect(login.status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'AUTH_PASSWORD_CHANGED', userId: user.id } })).toBe(1);
  });

  it('records logout in the audit log', async () => {
    const { user, auth } = await createUser('STAFF');
    const res = await request(app).post('/api/auth/logout').set(auth);
    expect(res.status).toBe(204);
    expect(await prisma.auditLog.count({ where: { action: 'AUTH_LOGOUT', userId: user.id } })).toBe(1);
  });
});

describe('General API behaviour', () => {
  it('reports health including the database', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('returns JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('sets security headers', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
