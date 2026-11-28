'use strict';

/*
 * Pay & Download
 *
 *   /          buyer page: scan the UPI QR, pay, enter the UTR, download the file
 *   /admin     admin panel: every submitted payment, price/UPI settings, the file to deliver
 *
 * Payments are NOT verified: any well-formed 12-digit UTR that has not been used before
 * unlocks the download straight away. The admin panel lists every UTR so the owner can
 * match them against their UPI account and block the download link of a fake one.
 *
 * Data lives on the local disk (DATA_DIR, default ./data) or, when FIREBASE_PROJECT_ID is set,
 * in Cloud Firestore (see lib/store.js).
 */

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');
const auth = require('./lib/auth');
const { createStore } = require('./lib/store');
const { loadState, randomName } = require('./lib/state');

const SESSION_HOURS = 12;
const UTR_PATTERN = /^\d{12}$/;
const UPI_ID_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9]{2,64}$/;
const QR_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const STATUSES = new Set(['new', 'received', 'blocked']);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function rateLimit({ windowMs, max, message }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.reset < now) hits.delete(key);
  }, windowMs).unref();
  return (req, res, next) => {
    const now = Date.now();
    let entry = hits.get(req.ip);
    if (!entry || entry.reset < now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(req.ip, entry);
    }
    entry.count += 1;
    if (entry.count > max) return res.status(429).json({ error: message });
    next();
  };
}

function clean(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanFileName(name) {
  const base = path.basename(String(name || 'file')).replace(/[\u0000-\u001f\u007f"\\/]/g, '_').trim();
  return (base || 'file').slice(0, 150);
}

/** NPCI "upi://pay" link; values percent-encoded (%20, never "+") so every UPI app reads them alike. */
function upiLink(s) {
  const enc = (v) => encodeURIComponent(v).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const note = (s.note || s.productName).slice(0, 50);
  return `upi://pay?pa=${enc(s.upiId)}&pn=${enc(s.payeeName || s.upiId)}&am=${Number(s.amount).toFixed(2)}&cu=INR&tn=${enc(note)}`;
}

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function messagePage(title, text) {
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="/styles.css"></head><body><main class="shell"><section class="card stack center-text"><h1 class="title">${esc(title)}</h1><p class="muted">${esc(text)}</p><a class="btn primary" href="/">Go to payment page</a></section></main></body></html>`;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

async function createApp({ env = process.env, dataDir, store } = {}) {
  dataDir = path.resolve(dataDir || env.DATA_DIR || path.join(__dirname, 'data'));
  store = store || createStore({ dataDir, env });
  const maxFileMb = Number(env.MAX_FILE_MB) || (store.kind === 'firestore' ? 25 : 200);

  const { meta, payments } = await loadState(store);
  const { settings } = meta;
  const saveMeta = () => store.saveMeta({ secret: meta.secret, settings, admin: meta.admin });

  // Uploaded files are served from the local disk; with Firestore that disk is only a cache.
  for (const blob of [settings.file, settings.qrImage]) {
    if (!blob) continue;
    try {
      await store.ensureLocal(blob.stored);
    } catch (err) {
      console.error(`Could not load ${blob.name || 'the scanner image'}: ${err.message}`);
    }
  }

  // ----- admin login -----
  // ID: ADMIN_USERNAME, else the stored ID, else "admin". Password: ADMIN_PASSWORD, else the stored
  // hash; on a brand-new site without either, a random password is made and shown once in the log.
  let generatedPassword = null;
  if (!env.ADMIN_PASSWORD && !meta.admin) {
    generatedPassword = crypto.randomBytes(6).toString('base64url');
    meta.admin = { username: 'admin', passwordHash: auth.hashPassword(generatedPassword) };
    await saveMeta();
  }
  const adminUsername = (env.ADMIN_USERNAME || meta.admin?.username || 'admin').trim().toLowerCase();
  const credential = env.ADMIN_PASSWORD ? `env:${env.ADMIN_PASSWORD}` : meta.admin.passwordHash;
  const sessionKey = auth.sessionKey(meta.secret, adminUsername, credential);
  const passwordOk = (password) =>
    env.ADMIN_PASSWORD ? auth.safeEqual(password, env.ADMIN_PASSWORD) : auth.verifyPassword(password, meta.admin.passwordHash);

  function requireAdmin(req, res, next) {
    if (auth.sessionValid(sessionKey, cookies(req).admin_session)) return next();
    res.status(401).json({ error: 'Please log in again.' });
  }

  // ----- views -----

  function setupProblems() {
    const problems = [];
    if (!settings.file) problems.push('Upload the file buyers will download.');
    if (!settings.upiId && !settings.qrImage) problems.push('Add your UPI ID or upload your scanner (QR) image.');
    if (!(settings.amount > 0)) problems.push('Set the price.');
    return problems;
  }

  function publicConfig() {
    const s = settings;
    return {
      productName: s.productName,
      description: s.description,
      amount: s.amount,
      upiId: s.upiId,
      payeeName: s.payeeName,
      upiLink: s.upiId ? upiLink(s) : null,
      qrUrl: s.qrImage || s.upiId ? `/api/qr?v=${encodeURIComponent(s.updatedAt)}` : null,
      fileName: s.file ? s.file.name : null,
      fileSize: s.file ? s.file.size : null,
      ready: setupProblems().length === 0,
    };
  }

  function adminSettings() {
    return {
      ...publicConfig(),
      note: settings.note,
      customQr: Boolean(settings.qrImage),
      file: settings.file ? { name: settings.file.name, size: settings.file.size, uploadedAt: settings.file.uploadedAt } : null,
      problems: setupProblems(),
      maxFileMb,
    };
  }

  function buyerView(p) {
    return {
      utr: p.utr,
      amount: p.amount,
      productName: p.productName,
      createdAt: p.createdAt,
      token: p.token,
      downloadUrl: `/download/${p.token}`,
      blocked: p.status === 'blocked',
      fileName: settings.file ? settings.file.name : null,
    };
  }

  function adminView(p) {
    const { token, ...rest } = p;
    return rest;
  }

  function findByToken(token) {
    if (typeof token !== 'string' || token.length < 20) return null;
    return payments.find((p) => auth.safeEqual(p.token, token)) || null;
  }

  async function touchSettings() {
    settings.updatedAt = new Date().toISOString();
    await saveMeta();
  }

  function removeBlobLater(stored) {
    if (stored) store.deleteBlob(stored).catch((err) => console.error(`Could not delete ${stored}: ${err.message}`));
  }

  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) {
    const v = env.TRUST_PROXY;
    app.set('trust proxy', /^\d+$/.test(v) ? Number(v) : v === 'true' ? true : v);
  }
  app.locals.generatedPassword = generatedPassword;
  app.locals.adminUsername = adminUsername;
  app.locals.store = store;

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
    });
    next();
  });
  app.use(express.json({ limit: '20kb' }));
  app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

  app.get('/healthz', (req, res) => res.type('text').send('ok'));

  // ----- buyer -----

  app.get('/api/config', (req, res) => {
    res.set('Cache-Control', 'no-store').json(publicConfig());
  });

  app.get('/api/qr', async (req, res) => {
    res.set('Cache-Control', 'no-cache');
    if (settings.qrImage) {
      await store.ensureLocal(settings.qrImage.stored);
      return res.type(settings.qrImage.mime).sendFile(store.localPath(settings.qrImage.stored));
    }
    if (!settings.upiId) return res.status(404).end();
    const svg = await QRCode.toString(upiLink(settings), { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    res.type('image/svg+xml').send(svg);
  });

  const submitLimit = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 30,
    message: 'Too many tries. Please wait a few minutes and try again.',
  });

  app.post('/api/payments', submitLimit, async (req, res) => {
    const body = req.body || {};
    if (setupProblems().length) {
      return res.status(503).json({ error: 'This page is not ready yet. Please try again later.' });
    }
    const utr = String(body.utr ?? '').replace(/[\s-]/g, '');
    if (!UTR_PATTERN.test(utr)) {
      return res.status(400).json({ error: 'Enter the 12-digit UTR / UPI Ref. No. from your payment app.' });
    }
    if (payments.some((p) => p.utr === utr)) {
      return res.status(409).json({
        error: 'This UTR number has already been used. If you submitted it earlier, open this page on the same phone to download again.',
      });
    }
    const payment = {
      id: crypto.randomUUID(),
      token: crypto.randomBytes(24).toString('base64url'),
      utr,
      name: clean(body.name, 80),
      phone: clean(body.phone, 20),
      amount: settings.amount,
      productName: settings.productName,
      status: 'new',
      createdAt: new Date().toISOString(),
      ip: req.ip,
      userAgent: clean(req.get('user-agent'), 200),
      downloads: 0,
      lastDownloadAt: null,
    };
    payments.push(payment);
    try {
      await store.savePayment(payment);
    } catch (err) {
      payments.splice(payments.indexOf(payment), 1);
      throw err;
    }
    res.status(201).json(buyerView(payment));
  });

  app.get('/api/payments/:token', (req, res) => {
    const payment = findByToken(req.params.token);
    if (!payment) return res.status(404).json({ error: 'Not found' });
    res.set('Cache-Control', 'no-store').json(buyerView(payment));
  });

  app.get('/download/:token', async (req, res) => {
    const payment = findByToken(req.params.token);
    const file = settings.file;
    if (!payment) {
      return res.status(404).type('html').send(messagePage('Link not found', 'This download link is not valid.'));
    }
    if (payment.status === 'blocked') {
      return res
        .status(403)
        .type('html')
        .send(messagePage('Download stopped', 'The seller has stopped this download. Please contact them with your UTR number.'));
    }
    if (!file) {
      return res.status(404).type('html').send(messagePage('File not available', 'The file is not available right now. Please try again later.'));
    }
    await store.ensureLocal(file.stored);
    payment.downloads += 1;
    payment.lastDownloadAt = new Date().toISOString();
    store.savePayment(payment).catch((err) => console.error(`Could not save the download count: ${err.message}`));
    res.download(store.localPath(file.stored), file.name, {
      headers: { 'Cache-Control': 'private, no-store', 'Content-Type': file.mime || 'application/octet-stream' },
    });
  });

  // ----- admin -----

  const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many wrong passwords. Wait 15 minutes and try again.',
  });

  app.post('/api/admin/login', loginLimit, (req, res) => {
    const body = req.body || {};
    const idOk = auth.safeEqual(String(body.username ?? '').trim().toLowerCase(), adminUsername);
    const pwOk = passwordOk(String(body.password ?? ''));
    if (!idOk || !pwOk) {
      return res.status(401).json({ error: 'Wrong ID or password.' });
    }
    res.cookie('admin_session', auth.newSession(sessionKey, SESSION_HOURS), {
      httpOnly: true,
      sameSite: 'strict',
      secure: req.secure,
      maxAge: SESSION_HOURS * 3600 * 1000,
      path: '/',
    });
    res.json({ ok: true });
  });

  app.post('/api/admin/logout', (req, res) => {
    res.clearCookie('admin_session', { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/admin/session', requireAdmin, (req, res) => res.json({ ok: true }));

  app.get('/api/admin/payments', requireAdmin, (req, res) => {
    res.set('Cache-Control', 'no-store').json({ payments: payments.map(adminView).reverse() });
  });

  app.get('/api/admin/payments.csv', requireAdmin, (req, res) => {
    // Prefix formula-like cells so a spreadsheet never executes a buyer's input.
    const cell = (v) => {
      let s = String(v ?? '');
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const rows = [['Date', 'UTR', 'Name', 'Mobile', 'Amount', 'Product', 'Status', 'Downloads', 'Last download', 'IP']];
    for (const p of [...payments].reverse()) {
      rows.push([p.createdAt, p.utr, p.name, p.phone, p.amount, p.productName, p.status, p.downloads, p.lastDownloadAt || '', p.ip]);
    }
    res
      .set('Cache-Control', 'no-store')
      .attachment(`payments-${new Date().toISOString().slice(0, 10)}.csv`)
      .type('text/csv')
      .send(`﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`);
  });

  app.patch('/api/admin/payments/:id', requireAdmin, async (req, res) => {
    const payment = payments.find((p) => p.id === req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found.' });
    const status = (req.body || {}).status;
    if (!STATUSES.has(status)) return res.status(400).json({ error: 'Unknown status.' });
    payment.status = status;
    payment.updatedAt = new Date().toISOString();
    await store.savePayment(payment);
    res.json(adminView(payment));
  });

  app.delete('/api/admin/payments/:id', requireAdmin, async (req, res) => {
    const index = payments.findIndex((p) => p.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Payment not found.' });
    await store.deletePayment(payments[index].id);
    payments.splice(index, 1);
    res.json({ ok: true });
  });

  app.get('/api/admin/settings', requireAdmin, (req, res) => {
    res.set('Cache-Control', 'no-store').json(adminSettings());
  });

  app.put('/api/admin/settings', requireAdmin, async (req, res) => {
    const body = req.body || {};
    const productName = clean(body.productName, 100);
    const description = clean(body.description, 400);
    const note = clean(body.note, 50);
    const payeeName = clean(body.payeeName, 60);
    const upiId = clean(body.upiId, 320);
    const amount = Number(body.amount);

    if (!productName) return res.status(400).json({ error: 'Enter the product name.' });
    if (!Number.isFinite(amount) || amount < 1 || amount > 100000 || Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6) {
      return res.status(400).json({ error: 'Price must be between ₹1 and ₹1,00,000 (at most 2 decimals).' });
    }
    if (upiId && !UPI_ID_PATTERN.test(upiId)) {
      return res.status(400).json({ error: 'That does not look like a UPI ID (example: 9876543210@ybl).' });
    }
    if (!upiId && !settings.qrImage) {
      return res.status(400).json({ error: 'Enter your UPI ID (or upload your scanner image first).' });
    }
    Object.assign(settings, { productName, description, note, payeeName, upiId, amount: Math.round(amount * 100) / 100 });
    await touchSettings();
    res.json(adminSettings());
  });

  const storage = multer.diskStorage({
    destination: store.uploadDir,
    filename: (req, file, cb) => cb(null, randomName()),
  });
  const fileUpload = multer({
    storage,
    defParamCharset: 'utf8',
    limits: { fileSize: maxFileMb * 1024 * 1024, files: 1, fields: 5 },
  }).single('file');
  const qrUpload = multer({
    storage,
    defParamCharset: 'utf8',
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5 },
    fileFilter: (req, file, cb) => cb(null, QR_TYPES.has(file.mimetype)),
  }).single('qr');

  function handleUpload(middleware, maxMb) {
    return (req, res, next) =>
      middleware(req, res, (err) => {
        if (!err) return next();
        const message = err.code === 'LIMIT_FILE_SIZE' ? `File is too large (max ${maxMb} MB).` : 'Upload failed. Please try again.';
        res.status(400).json({ error: message });
      });
  }

  app.post('/api/admin/file', requireAdmin, handleUpload(fileUpload, maxFileMb), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Choose a file to upload.' });
    await store.putBlob(req.file.filename);
    const old = settings.file;
    settings.file = {
      stored: req.file.filename,
      name: cleanFileName(req.file.originalname),
      size: req.file.size,
      mime: req.file.mimetype || 'application/octet-stream',
      uploadedAt: new Date().toISOString(),
    };
    await touchSettings();
    if (old) removeBlobLater(old.stored);
    res.json(adminSettings());
  });

  app.get('/api/admin/file', requireAdmin, async (req, res) => {
    const file = settings.file;
    if (!file) return res.status(404).json({ error: 'No file uploaded yet.' });
    await store.ensureLocal(file.stored);
    res.download(store.localPath(file.stored), file.name, { headers: { 'Cache-Control': 'private, no-store' } });
  });

  app.post('/api/admin/qr', requireAdmin, handleUpload(qrUpload, 5), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Upload a PNG, JPG or WebP image of your scanner.' });
    await store.putBlob(req.file.filename);
    const old = settings.qrImage;
    settings.qrImage = { stored: req.file.filename, mime: req.file.mimetype, uploadedAt: new Date().toISOString() };
    await touchSettings();
    if (old) removeBlobLater(old.stored);
    res.json(adminSettings());
  });

  app.delete('/api/admin/qr', requireAdmin, async (req, res) => {
    if (!settings.upiId) {
      return res.status(400).json({ error: 'Save your UPI ID first, so a QR code can be made from it.' });
    }
    const old = settings.qrImage;
    settings.qrImage = null;
    await touchSettings();
    if (old) removeBlobLater(old.stored);
    res.json(adminSettings());
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
      return res.status(400).json({ error: 'Bad request.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createApp()
    .then((app) => {
      app.listen(port, () => {
        console.log(`Storage      : ${app.locals.store.kind === 'firestore' ? 'Cloud Firestore' : 'local disk'}`);
        console.log(`Payment page : http://localhost:${port}/`);
        console.log(`Admin panel  : http://localhost:${port}/admin   (ID: ${app.locals.adminUsername})`);
        if (app.locals.generatedPassword) {
          console.log(`Admin password (shown only now): ${app.locals.generatedPassword}`);
          console.log('Set the ADMIN_PASSWORD environment variable to choose your own.');
        }
      });
    })
    .catch((err) => {
      console.error('Could not start:', err);
      process.exit(1);
    });
}

module.exports = { createApp };
