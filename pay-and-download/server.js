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
 * Everything is kept in DATA_DIR (default ./data): db.json plus the uploaded files.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SEED_QR = path.join(__dirname, 'seed', 'upi-qr.png');
const MAX_FILE_MB = Number(process.env.MAX_FILE_MB) || 200;
const SESSION_HOURS = 12;

const UTR_PATTERN = /^\d{12}$/;
const UPI_ID_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9]{2,64}$/;
const QR_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const STATUSES = new Set(['new', 'received', 'blocked']);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Storage: one JSON file, rewritten atomically on every change.
// ---------------------------------------------------------------------------

function defaultSettings() {
  return {
    productName: 'GST Registration Certificate',
    description: 'Pay the GST fees with any UPI app, enter the UTR number, and download your certificate.',
    amount: 1000,
    upiId: '7620721565@ybl',
    payeeName: 'PRINCE TAILOR',
    note: 'GST FEES',
    qrImage: null, // { stored, mime, uploadedAt } — the owner's own scanner image
    file: null, // { stored, name, size, mime, uploadedAt } — what buyers download
    updatedAt: new Date().toISOString(),
  };
}

function loadDb() {
  if (fs.existsSync(DB_FILE)) {
    const saved = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return { ...saved, settings: { ...defaultSettings(), ...saved.settings }, payments: saved.payments || [] };
  }
  const fresh = { secret: crypto.randomBytes(32).toString('hex'), settings: defaultSettings(), payments: [] };
  // First start: show the owner's own scanner image (it carries the same UPI ID, name and amount).
  if (fs.existsSync(SEED_QR)) {
    const stored = randomName();
    fs.copyFileSync(SEED_QR, path.join(UPLOAD_DIR, stored));
    fresh.settings.qrImage = { stored, mime: 'image/png', uploadedAt: new Date().toISOString() };
  }
  return fresh;
}

function randomName() {
  return crypto.randomBytes(16).toString('hex');
}

const db = loadDb();

function saveDb() {
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function removeUpload(stored) {
  if (!stored) return;
  fs.rm(path.join(UPLOAD_DIR, path.basename(stored)), { force: true }, () => {});
}

saveDb();

// ---------------------------------------------------------------------------
// Admin login (ID + password) and session cookie
// ---------------------------------------------------------------------------

// The password comes only from the environment, never from this (public) code.
const adminUsername = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
let adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) {
  if (!db.generatedAdminPassword) {
    db.generatedAdminPassword = crypto.randomBytes(6).toString('base64url');
    saveDb();
  }
  adminPassword = db.generatedAdminPassword;
}

// Changing the admin ID or password signs every existing session out.
const sessionKey = crypto.createHmac('sha256', db.secret).update(`${adminUsername}\n${adminPassword}`).digest();

function sign(value) {
  return crypto.createHmac('sha256', sessionKey).update(value).digest('base64url');
}

function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

function newSession() {
  const expires = String(Date.now() + SESSION_HOURS * 3600 * 1000);
  return `${expires}.${sign(expires)}`;
}

function sessionValid(token) {
  if (typeof token !== 'string') return false;
  const [expires, signature] = token.split('.');
  if (!expires || !signature) return false;
  return safeEqual(signature, sign(expires)) && Number(expires) > Date.now();
}

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function requireAdmin(req, res, next) {
  if (sessionValid(cookies(req).admin_session)) return next();
  res.status(401).json({ error: 'Please log in again.' });
}

// ---------------------------------------------------------------------------
// Helpers
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

function setupProblems() {
  const s = db.settings;
  const problems = [];
  if (!s.file) problems.push('Upload the file buyers will download.');
  if (!s.upiId && !s.qrImage) problems.push('Add your UPI ID or upload your scanner (QR) image.');
  if (!(s.amount > 0)) problems.push('Set the price.');
  return problems;
}

function publicConfig() {
  const s = db.settings;
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
  const s = db.settings;
  return {
    ...publicConfig(),
    note: s.note,
    customQr: Boolean(s.qrImage),
    file: s.file ? { name: s.file.name, size: s.file.size, uploadedAt: s.file.uploadedAt } : null,
    problems: setupProblems(),
    maxFileMb: MAX_FILE_MB,
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
    fileName: db.settings.file ? db.settings.file.name : null,
  };
}

function adminView(p) {
  const { token, ...rest } = p;
  return rest;
}

function findByToken(token) {
  if (typeof token !== 'string' || token.length < 20) return null;
  return db.payments.find((p) => safeEqual(p.token, token)) || null;
}

function touchSettings() {
  db.settings.updatedAt = new Date().toISOString();
  saveDb();
}

function messagePage(title, text) {
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="/styles.css"></head><body><main class="shell"><section class="card stack center-text"><h1 class="title">${esc(title)}</h1><p class="muted">${esc(text)}</p><a class="btn primary" href="/">Go to payment page</a></section></main></body></html>`;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) {
  const v = process.env.TRUST_PROXY;
  app.set('trust proxy', /^\d+$/.test(v) ? Number(v) : v === 'true' ? true : v);
}

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

// ----- buyer -----

app.get('/api/config', (req, res) => {
  res.set('Cache-Control', 'no-store').json(publicConfig());
});

app.get('/api/qr', async (req, res) => {
  const s = db.settings;
  res.set('Cache-Control', 'no-cache');
  if (s.qrImage) {
    return res.type(s.qrImage.mime).sendFile(path.join(UPLOAD_DIR, s.qrImage.stored));
  }
  if (!s.upiId) return res.status(404).end();
  const svg = await QRCode.toString(upiLink(s), { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  res.type('image/svg+xml').send(svg);
});

const submitLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: 'Too many tries. Please wait a few minutes and try again.',
});

app.post('/api/payments', submitLimit, (req, res) => {
  const body = req.body || {};
  if (setupProblems().length) {
    return res.status(503).json({ error: 'This page is not ready yet. Please try again later.' });
  }
  const utr = String(body.utr ?? '').replace(/[\s-]/g, '');
  if (!UTR_PATTERN.test(utr)) {
    return res.status(400).json({ error: 'Enter the 12-digit UTR / UPI Ref. No. from your payment app.' });
  }
  if (db.payments.some((p) => p.utr === utr)) {
    return res.status(409).json({
      error: 'This UTR number has already been used. If you submitted it earlier, open this page on the same phone to download again.',
    });
  }
  const s = db.settings;
  const payment = {
    id: crypto.randomUUID(),
    token: crypto.randomBytes(24).toString('base64url'),
    utr,
    name: clean(body.name, 80),
    phone: clean(body.phone, 20),
    amount: s.amount,
    productName: s.productName,
    status: 'new',
    createdAt: new Date().toISOString(),
    ip: req.ip,
    userAgent: clean(req.get('user-agent'), 200),
    downloads: 0,
    lastDownloadAt: null,
  };
  db.payments.push(payment);
  saveDb();
  res.status(201).json(buyerView(payment));
});

app.get('/api/payments/:token', (req, res) => {
  const payment = findByToken(req.params.token);
  if (!payment) return res.status(404).json({ error: 'Not found' });
  res.set('Cache-Control', 'no-store').json(buyerView(payment));
});

app.get('/download/:token', (req, res) => {
  const payment = findByToken(req.params.token);
  const file = db.settings.file;
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
  payment.downloads += 1;
  payment.lastDownloadAt = new Date().toISOString();
  saveDb();
  res.download(path.join(UPLOAD_DIR, file.stored), file.name, {
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
  const idOk = safeEqual(String(body.username ?? '').trim().toLowerCase(), adminUsername);
  const passwordOk = safeEqual(body.password ?? '', adminPassword);
  if (!idOk || !passwordOk) {
    return res.status(401).json({ error: 'Wrong ID or password.' });
  }
  res.cookie('admin_session', newSession(), {
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
  res.set('Cache-Control', 'no-store').json({ payments: db.payments.map(adminView).reverse() });
});

app.get('/api/admin/payments.csv', requireAdmin, (req, res) => {
  // Prefix formula-like cells so a spreadsheet never executes a buyer's input.
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const rows = [['Date', 'UTR', 'Name', 'Mobile', 'Amount', 'Product', 'Status', 'Downloads', 'Last download', 'IP']];
  for (const p of [...db.payments].reverse()) {
    rows.push([p.createdAt, p.utr, p.name, p.phone, p.amount, p.productName, p.status, p.downloads, p.lastDownloadAt || '', p.ip]);
  }
  res
    .set('Cache-Control', 'no-store')
    .attachment(`payments-${new Date().toISOString().slice(0, 10)}.csv`)
    .type('text/csv')
    .send(`﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`);
});

app.patch('/api/admin/payments/:id', requireAdmin, (req, res) => {
  const payment = db.payments.find((p) => p.id === req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found.' });
  const status = (req.body || {}).status;
  if (!STATUSES.has(status)) return res.status(400).json({ error: 'Unknown status.' });
  payment.status = status;
  payment.updatedAt = new Date().toISOString();
  saveDb();
  res.json(adminView(payment));
});

app.delete('/api/admin/payments/:id', requireAdmin, (req, res) => {
  const index = db.payments.findIndex((p) => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Payment not found.' });
  db.payments.splice(index, 1);
  saveDb();
  res.json({ ok: true });
});

app.get('/api/admin/settings', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store').json(adminSettings());
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
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
  if (!upiId && !db.settings.qrImage) {
    return res.status(400).json({ error: 'Enter your UPI ID (or upload your scanner image first).' });
  }
  Object.assign(db.settings, { productName, description, note, payeeName, upiId, amount: Math.round(amount * 100) / 100 });
  touchSettings();
  res.json(adminSettings());
});

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => cb(null, randomName()),
});
const fileUpload = multer({
  storage,
  defParamCharset: 'utf8',
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 1, fields: 5 },
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

app.post('/api/admin/file', requireAdmin, handleUpload(fileUpload, MAX_FILE_MB), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a file to upload.' });
  const old = db.settings.file;
  db.settings.file = {
    stored: req.file.filename,
    name: cleanFileName(req.file.originalname),
    size: req.file.size,
    mime: req.file.mimetype || 'application/octet-stream',
    uploadedAt: new Date().toISOString(),
  };
  touchSettings();
  if (old) removeUpload(old.stored);
  res.json(adminSettings());
});

app.get('/api/admin/file', requireAdmin, (req, res) => {
  const file = db.settings.file;
  if (!file) return res.status(404).json({ error: 'No file uploaded yet.' });
  res.download(path.join(UPLOAD_DIR, file.stored), file.name, { headers: { 'Cache-Control': 'private, no-store' } });
});

app.post('/api/admin/qr', requireAdmin, handleUpload(qrUpload, 5), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Upload a PNG, JPG or WebP image of your scanner.' });
  const old = db.settings.qrImage;
  db.settings.qrImage = { stored: req.file.filename, mime: req.file.mimetype, uploadedAt: new Date().toISOString() };
  touchSettings();
  if (old) removeUpload(old.stored);
  res.json(adminSettings());
});

app.delete('/api/admin/qr', requireAdmin, (req, res) => {
  if (!db.settings.upiId) {
    return res.status(400).json({ error: 'Save your UPI ID first, so a QR code can be made from it.' });
  }
  const old = db.settings.qrImage;
  db.settings.qrImage = null;
  touchSettings();
  if (old) removeUpload(old.stored);
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

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Payment page : http://localhost:${PORT}/`);
    console.log(`Admin panel  : http://localhost:${PORT}/admin   (ID: ${adminUsername})`);
    if (!process.env.ADMIN_PASSWORD) {
      console.log(`Admin password: ${adminPassword}   (set the ADMIN_PASSWORD environment variable to choose your own)`);
    }
  });
}

module.exports = { app };
