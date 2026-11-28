'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SEED_QR = path.join(__dirname, '..', 'seed', 'upi-qr.png');

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

function randomName() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Reads the site's state, creating it on the very first start: a secret for signing admin
 * sessions, default settings and the owner's scanner image.
 * Returns { meta: { secret, settings, admin }, payments }.
 */
async function loadState(store) {
  const saved = await store.load();
  let meta = saved.meta;
  if (!meta) {
    meta = { secret: crypto.randomBytes(32).toString('hex'), settings: defaultSettings(), admin: null };
    if (fs.existsSync(SEED_QR)) {
      const stored = randomName();
      await store.putBlob(stored, fs.readFileSync(SEED_QR));
      meta.settings.qrImage = { stored, mime: 'image/png', uploadedAt: new Date().toISOString() };
    }
    await store.saveMeta(meta);
  } else {
    meta = { secret: meta.secret, admin: meta.admin || null, settings: { ...defaultSettings(), ...meta.settings } };
  }
  return { meta, payments: saved.payments };
}

module.exports = { defaultSettings, loadState, randomName };
