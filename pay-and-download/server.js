'use strict';

/*
 * Pay & Download
 *
 *   /p/<code>   buyer page of one payment link: scan the UPI QR, pay, enter the UTR, wait while the
 *               owner checks, then download that link's file
 *   /           opens the link chosen as the home page (Settings), or a short notice
 *   /admin      admin panel: payments to check, payment links (each with its own file, price and QR),
 *               settings
 *
 * A submitted UTR is NOT trusted: the payment stays "new" (Under checking) until the owner finds the
 * money in their UPI app and clicks Received in the admin panel. Only then does the buyer's page show
 * the download button; "Not received" tells the buyer instead.
 *
 * Data lives on the local disk (DATA_DIR, default ./data) or, when FIREBASE_PROJECT_ID is set, in
 * Cloud Firestore (see lib/store.js).
 */

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');
const auth = require('./lib/auth');
const { createStore } = require('./lib/store');
const { loadState, makeLink, randomName } = require('./lib/state');

const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_HOURS = 12;
const CHECK_SECONDS = 120; // how long the buyer is asked to wait while the owner checks
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
function upiLink({ upiId, payeeName, amount, note }) {
  const enc = (v) => encodeURIComponent(v).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `upi://pay?pa=${enc(upiId)}&pn=${enc(payeeName || upiId)}&am=${Number(amount).toFixed(2)}&cu=INR&tn=${enc(String(note).slice(0, 50))}`;
}

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function messagePage(title, text, backUrl = null) {
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const back = backUrl ? `<a class="btn primary" href="${esc(backUrl)}">Go back to the payment page</a>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="/styles.css"></head><body><main class="shell"><section class="card stack center-text"><h1 class="title">${esc(title)}</h1><p class="muted">${esc(text)}</p>${back}</section></main></body></html>`;
}

/** Validates the editable fields of a link; returns { error } or { values }. */
function linkFields(body, current = {}) {
  const title = clean(body.title ?? current.title, 100);
  const description = clean(body.description ?? current.description, 400);
  const note = clean(body.note ?? current.note, 50);
  const amount = Number(body.amount ?? current.amount);
  if (!title) return { error: 'Enter a name for this link.' };
  if (!Number.isFinite(amount) || amount < 1 || amount > 100000 || Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6) {
    return { error: 'Price must be between ₹1 and ₹1,00,000 (at most 2 decimals).' };
  }
  const values = { title, description, note, amount: Math.round(amount * 100) / 100 };
  if (typeof body.active === 'boolean') values.active = body.active;
  return { values };
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

async function createApp({ env = process.env, dataDir, store } = {}) {
  dataDir = path.resolve(dataDir || env.DATA_DIR || path.join(__dirname, 'data'));
  store = store || createStore({ dataDir, env });
  const maxFileMb = Number(env.MAX_FILE_MB) || (store.kind === 'firestore' ? 25 : 200);

  const { meta, payments, links } = await loadState(store);
  const { settings } = meta;
  const saveMeta = () => store.saveMeta({ secret: meta.secret, settings, admin: meta.admin });

  // Uploaded files are served from the local disk; with Firestore that disk is only a cache.
  for (const link of links) {
    for (const blob of [link.file, link.qrImage]) {
      if (!blob) continue;
      try {
        await store.ensureLocal(blob.stored);
      } catch (err) {
        console.error(`Could not load a file of "${link.title}": ${err.message}`);
      }
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

  // ----- lookups & views -----

  const linkById = (id) => links.find((l) => l.id === id) || null;
  const linkByCode = (code) => links.find((l) => l.code === code) || null;
  const linkOf = (payment) => linkById(payment.linkId || settings.homeLinkId);

  function linkProblems(link) {
    const problems = [];
    if (!link.file) problems.push('Upload the file buyers get.');
    if (!settings.upiId && !link.qrImage) problems.push('Add your UPI ID in Settings, or upload a scanner image for this link.');
    return problems;
  }

  function linkUpi(link) {
    return settings.upiId
      ? upiLink({ upiId: settings.upiId, payeeName: settings.payeeName, amount: link.amount, note: link.note || link.title })
      : null;
  }

  function qrUrl(link) {
    return link.qrImage || settings.upiId
      ? `/api/links/${link.code}/qr?v=${encodeURIComponent(`${link.updatedAt}|${settings.updatedAt}`)}`
      : null;
  }

  function publicLink(link) {
    return {
      code: link.code,
      title: link.title,
      description: link.description,
      amount: link.amount,
      upiId: settings.upiId,
      payeeName: settings.payeeName,
      upiLink: linkUpi(link),
      qrUrl: qrUrl(link),
      customQr: Boolean(link.qrImage),
      fileName: link.file ? link.file.name : null,
      ready: link.active && linkProblems(link).length === 0,
      checkSeconds: CHECK_SECONDS,
    };
  }

  function adminLink(link) {
    const mine = payments.filter((p) => (p.linkId || settings.homeLinkId) === link.id);
    const received = mine.filter((p) => p.status === 'received');
    return {
      id: link.id,
      code: link.code,
      path: `/p/${link.code}`,
      title: link.title,
      description: link.description,
      amount: link.amount,
      note: link.note,
      active: link.active,
      isHome: settings.homeLinkId === link.id,
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
      file: link.file ? { name: link.file.name, size: link.file.size, uploadedAt: link.file.uploadedAt } : null,
      customQr: Boolean(link.qrImage),
      qrUrl: qrUrl(link),
      upiLink: linkUpi(link),
      problems: linkProblems(link),
      stats: {
        payments: mine.length,
        waiting: mine.filter((p) => p.status === 'new').length,
        received: received.length,
        receivedAmount: received.reduce((t, p) => t + Number(p.amount), 0),
      },
    };
  }

  function buyerView(p) {
    const link = linkOf(p);
    const received = p.status === 'received';
    return {
      token: p.token,
      status: p.status,
      utr: p.utr,
      amount: p.amount,
      title: link ? link.title : p.linkTitle,
      linkCode: link ? link.code : p.linkCode,
      createdAt: p.createdAt,
      checkSeconds: CHECK_SECONDS,
      elapsedSeconds: Math.max(0, Math.floor((Date.now() - Date.parse(p.createdAt)) / 1000)),
      downloadUrl: received ? `/download/${p.token}` : null,
      fileName: received && link && link.file ? link.file.name : null,
    };
  }

  function adminPayment(p) {
    const { token, ...rest } = p;
    const link = linkOf(p);
    return { ...rest, linkTitle: link ? link.title : p.linkTitle || '(deleted link)', linkCode: link ? link.code : p.linkCode || null };
  }

  function findByToken(token) {
    if (typeof token !== 'string' || token.length < 20) return null;
    return payments.find((p) => auth.safeEqual(p.token, token)) || null;
  }

  function removeBlobLater(stored) {
    if (stored) store.deleteBlob(stored).catch((err) => console.error(`Could not delete ${stored}: ${err.message}`));
  }

  async function saveLink(link) {
    link.updatedAt = new Date().toISOString();
    await store.saveLink(link);
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

  app.get('/healthz', (req, res) => res.type('text').send('ok'));

  // ----- pages -----

  app.get('/', (req, res) => {
    const home = linkById(settings.homeLinkId);
    if (home && home.active) return res.redirect(302, `/p/${home.code}`);
    res.sendFile(path.join(PUBLIC_DIR, 'home.html'));
  });
  app.get('/p/:code', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'pay.html')));
  app.use(express.static(PUBLIC_DIR, { index: false, extensions: ['html'] }));

  // ----- buyer -----

  function activeLink(req, res) {
    const link = linkByCode(req.params.code);
    if (!link || !link.active) {
      res.status(404).json({ error: 'This payment link is not active. Please ask the seller for a new link.' });
      return null;
    }
    return link;
  }

  app.get('/api/links/:code', (req, res) => {
    const link = activeLink(req, res);
    if (link) res.set('Cache-Control', 'no-store').json(publicLink(link));
  });

  app.get('/api/links/:code/qr', async (req, res) => {
    const link = activeLink(req, res);
    if (!link) return;
    res.set('Cache-Control', 'no-cache');
    if (link.qrImage) {
      await store.ensureLocal(link.qrImage.stored);
      return res.type(link.qrImage.mime).sendFile(store.localPath(link.qrImage.stored));
    }
    const upi = linkUpi(link);
    if (!upi) return res.status(404).end();
    const svg = await QRCode.toString(upi, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    res.type('image/svg+xml').send(svg);
  });

  const submitLimit = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 30,
    message: 'Too many tries. Please wait a few minutes and try again.',
  });

  app.post('/api/links/:code/payments', submitLimit, async (req, res) => {
    const link = activeLink(req, res);
    if (!link) return;
    if (linkProblems(link).length) {
      return res.status(503).json({ error: 'This page is not ready yet. Please try again later.' });
    }
    const body = req.body || {};
    const utr = String(body.utr ?? '').replace(/[\s-]/g, '');
    if (!UTR_PATTERN.test(utr)) {
      return res.status(400).json({ error: 'Enter the 12-digit UTR / UPI Ref. No. from your payment app.' });
    }
    if (payments.some((p) => p.utr === utr)) {
      return res.status(409).json({
        error: 'This UTR number has already been submitted. If it was you, open this page on the same phone to see its status.',
      });
    }
    const payment = {
      id: crypto.randomUUID(),
      token: crypto.randomBytes(24).toString('base64url'),
      linkId: link.id,
      linkTitle: link.title,
      linkCode: link.code,
      utr,
      name: clean(body.name, 80),
      phone: clean(body.phone, 20),
      amount: link.amount,
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
    if (!payment) {
      return res.status(404).type('html').send(messagePage('Link not found', 'This download link is not valid.'));
    }
    const link = linkOf(payment);
    const back = link ? `/p/${link.code}` : null;
    if (payment.status === 'new') {
      return res
        .status(403)
        .type('html')
        .send(messagePage('Payment under checking', 'Your download unlocks on the payment page as soon as the seller confirms your payment.', back));
    }
    if (payment.status === 'blocked') {
      return res
        .status(403)
        .type('html')
        .send(messagePage('Payment not received', 'The seller could not find this payment. If you have paid, contact them with your UTR number.', back));
    }
    if (!link || !link.file) {
      return res.status(404).type('html').send(messagePage('File not available', 'The file is not available right now. Please contact the seller.'));
    }
    await store.ensureLocal(link.file.stored);
    payment.downloads += 1;
    payment.lastDownloadAt = new Date().toISOString();
    store.savePayment(payment).catch((err) => console.error(`Could not save the download count: ${err.message}`));
    res.download(store.localPath(link.file.stored), link.file.name, {
      headers: { 'Cache-Control': 'private, no-store', 'Content-Type': link.file.mime || 'application/octet-stream' },
    });
  });

  // ----- admin: login -----

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

  // ----- admin: payments -----

  app.get('/api/admin/payments', requireAdmin, (req, res) => {
    res.set('Cache-Control', 'no-store').json({ payments: payments.map(adminPayment).reverse() });
  });

  app.get('/api/admin/payments.csv', requireAdmin, (req, res) => {
    // Prefix formula-like cells so a spreadsheet never executes a buyer's input.
    const cell = (v) => {
      let s = String(v ?? '');
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const label = { new: 'Waiting', received: 'Received', blocked: 'Not received' };
    const rows = [['Date', 'UTR', 'Name', 'Mobile', 'Amount', 'Link', 'Status', 'Downloads', 'Last download', 'IP']];
    for (const p of [...payments].reverse().map(adminPayment)) {
      rows.push([p.createdAt, p.utr, p.name, p.phone, p.amount, p.linkTitle, label[p.status], p.downloads, p.lastDownloadAt || '', p.ip]);
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
    if (status === 'received') payment.receivedAt = payment.updatedAt;
    await store.savePayment(payment);
    res.json(adminPayment(payment));
  });

  app.delete('/api/admin/payments/:id', requireAdmin, async (req, res) => {
    const index = payments.findIndex((p) => p.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Payment not found.' });
    await store.deletePayment(payments[index].id);
    payments.splice(index, 1);
    res.json({ ok: true });
  });

  // ----- admin: links -----

  app.get('/api/admin/links', requireAdmin, (req, res) => {
    res.set('Cache-Control', 'no-store').json({ links: links.map(adminLink).reverse() });
  });

  app.post('/api/admin/links', requireAdmin, async (req, res) => {
    const { error, values } = linkFields(req.body || {});
    if (error) return res.status(400).json({ error });
    const link = makeLink(values, links);
    await store.saveLink(link);
    links.push(link);
    res.status(201).json(adminLink(link));
  });

  function adminLinkParam(req, res) {
    const link = linkById(req.params.id);
    if (!link) res.status(404).json({ error: 'Link not found.' });
    return link;
  }

  app.put('/api/admin/links/:id', requireAdmin, async (req, res) => {
    const link = adminLinkParam(req, res);
    if (!link) return;
    const { error, values } = linkFields(req.body || {}, link);
    if (error) return res.status(400).json({ error });
    Object.assign(link, values);
    await saveLink(link);
    res.json(adminLink(link));
  });

  app.delete('/api/admin/links/:id', requireAdmin, async (req, res) => {
    const link = adminLinkParam(req, res);
    if (!link) return;
    await store.deleteLink(link.id);
    links.splice(links.indexOf(link), 1);
    if (settings.homeLinkId === link.id) {
      settings.homeLinkId = null;
      await saveMeta();
    }
    removeBlobLater(link.file && link.file.stored);
    removeBlobLater(link.qrImage && link.qrImage.stored);
    res.json({ ok: true });
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
    return (req, res, next) => {
      if (!linkById(req.params.id)) return res.status(404).json({ error: 'Link not found.' });
      middleware(req, res, (err) => {
        if (!err) return next();
        const message = err.code === 'LIMIT_FILE_SIZE' ? `File is too large (max ${maxMb} MB).` : 'Upload failed. Please try again.';
        res.status(400).json({ error: message });
      });
    };
  }

  app.post('/api/admin/links/:id/file', requireAdmin, handleUpload(fileUpload, maxFileMb), async (req, res) => {
    const link = adminLinkParam(req, res);
    if (!link) return;
    if (!req.file) return res.status(400).json({ error: 'Choose a file to upload.' });
    await store.putBlob(req.file.filename);
    const old = link.file;
    link.file = {
      stored: req.file.filename,
      name: cleanFileName(req.file.originalname),
      size: req.file.size,
      mime: req.file.mimetype || 'application/octet-stream',
      uploadedAt: new Date().toISOString(),
    };
    await saveLink(link);
    if (old) removeBlobLater(old.stored);
    res.json(adminLink(link));
  });

  app.get('/api/admin/links/:id/file', requireAdmin, async (req, res) => {
    const link = adminLinkParam(req, res);
    if (!link) return;
    if (!link.file) return res.status(404).json({ error: 'No file uploaded yet.' });
    await store.ensureLocal(link.file.stored);
    res.download(store.localPath(link.file.stored), link.file.name, { headers: { 'Cache-Control': 'private, no-store' } });
  });

  app.post('/api/admin/links/:id/qr', requireAdmin, handleUpload(qrUpload, 5), async (req, res) => {
    const link = adminLinkParam(req, res);
    if (!link) return;
    if (!req.file) return res.status(400).json({ error: 'Upload a PNG, JPG or WebP image of your scanner.' });
    await store.putBlob(req.file.filename);
    const old = link.qrImage;
    link.qrImage = { stored: req.file.filename, mime: req.file.mimetype, uploadedAt: new Date().toISOString() };
    await saveLink(link);
    if (old) removeBlobLater(old.stored);
    res.json(adminLink(link));
  });

  app.delete('/api/admin/links/:id/qr', requireAdmin, async (req, res) => {
    const link = adminLinkParam(req, res);
    if (!link) return;
    if (!settings.upiId) {
      return res.status(400).json({ error: 'Save your UPI ID in Settings first, so a QR code can be made from it.' });
    }
    const old = link.qrImage;
    link.qrImage = null;
    await saveLink(link);
    if (old) removeBlobLater(old.stored);
    res.json(adminLink(link));
  });

  // ----- admin: settings -----

  function adminSettings() {
    return {
      upiId: settings.upiId,
      payeeName: settings.payeeName,
      homeLinkId: settings.homeLinkId,
      maxFileMb,
      checkSeconds: CHECK_SECONDS,
    };
  }

  app.get('/api/admin/settings', requireAdmin, (req, res) => {
    res.set('Cache-Control', 'no-store').json(adminSettings());
  });

  app.put('/api/admin/settings', requireAdmin, async (req, res) => {
    const body = req.body || {};
    const upiId = clean(body.upiId ?? settings.upiId, 320);
    const payeeName = clean(body.payeeName ?? settings.payeeName, 60);
    const homeLinkId = body.homeLinkId === undefined ? settings.homeLinkId : body.homeLinkId || null;
    if (upiId && !UPI_ID_PATTERN.test(upiId)) {
      return res.status(400).json({ error: 'That does not look like a UPI ID (example: 9876543210@ybl).' });
    }
    if (homeLinkId && !linkById(homeLinkId)) return res.status(400).json({ error: 'That link no longer exists.' });
    Object.assign(settings, { upiId, payeeName, homeLinkId, updatedAt: new Date().toISOString() });
    await saveMeta();
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
        console.log(`Site         : http://localhost:${port}/`);
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
