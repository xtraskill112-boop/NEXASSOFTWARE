'use strict';

const crypto = require('node:crypto');

// Link codes: 8 characters without look-alikes (0/o, 1/l/i), hard to guess, easy to read out.
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function defaultSettings() {
  return {
    upiId: '7620721565@ybl',
    payeeName: 'PRINCE TAILOR',
    homeLinkId: null, // the link that the site's home page (/) opens
    updatedAt: new Date().toISOString(),
  };
}

function randomName() {
  return crypto.randomBytes(16).toString('hex');
}

function newLinkCode(links) {
  for (;;) {
    let code = '';
    for (const byte of crypto.randomBytes(8)) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    if (!links.some((l) => l.code === code)) return code;
  }
}

/** A payment link: its own title, price, UPI note, file and (optionally) scanner image. */
function makeLink({ title, description = '', amount, note = '' }, links) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    code: newLinkCode(links),
    title,
    description,
    amount,
    note,
    active: true,
    file: null, // { stored, name, size, mime, uploadedAt }
    qrImage: null, // { stored, mime, uploadedAt }
    createdAt: now,
    updatedAt: now,
  };
}

// Settings keys of the first version, which sold a single file from the site's settings.
const V1_KEYS = ['productName', 'description', 'amount', 'note', 'file', 'qrImage'];

/**
 * Reads the site's state, creating it on the very first start (a secret for signing admin sessions
 * and default settings). A site from the first version gets its product turned into its first link,
 * which also becomes the home page, so the address already shared keeps working.
 * Returns { meta: { secret, settings, admin }, payments, links }.
 */
async function loadState(store) {
  const saved = await store.load();
  const payments = saved.payments || [];
  const links = saved.links || [];
  if (!saved.meta) {
    const meta = { secret: crypto.randomBytes(32).toString('hex'), settings: defaultSettings(), admin: null };
    await store.saveMeta(meta);
    return { meta, payments, links };
  }

  const old = saved.meta.settings || {};
  const defaults = defaultSettings();
  const settings = {
    upiId: old.upiId ?? defaults.upiId,
    payeeName: old.payeeName ?? defaults.payeeName,
    homeLinkId: old.homeLinkId ?? null,
    updatedAt: old.updatedAt || defaults.updatedAt,
  };
  const meta = { secret: saved.meta.secret, admin: saved.meta.admin || null, settings };
  const fromV1 = V1_KEYS.some((key) => key in old);

  if (fromV1 && links.length === 0 && (old.file || old.qrImage)) {
    const link = makeLink(
      {
        title: old.productName || 'Payment',
        description: old.description || '',
        amount: Number(old.amount) > 0 ? Number(old.amount) : 1,
        note: old.note || '',
      },
      links,
    );
    link.file = old.file || null;
    link.qrImage = old.qrImage || null;
    links.push(link);
    await store.saveLink(link);
    settings.homeLinkId = link.id;
    for (const p of payments) {
      if (p.linkId) continue;
      Object.assign(p, { linkId: link.id, linkTitle: p.productName || link.title, linkCode: link.code });
      await store.savePayment(p);
    }
  }
  if (fromV1) await store.saveMeta(meta);
  return { meta, payments, links };
}

module.exports = { defaultSettings, loadState, makeLink, newLinkCode, randomName };
