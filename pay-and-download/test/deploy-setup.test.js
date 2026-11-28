'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { after, before, describe, test } = require('node:test');
const { EMULATOR, PROJECT, tempDir, clearFirestore, start } = require('./helpers');

describe('deploy with an encrypted setup (Firestore emulator)', { skip: !EMULATOR && 'set FIRESTORE_EMULATOR_HOST' }, () => {
  const { prepare, adminCookie } = require('../scripts/deploy-setup');
  const { buildSetup, encryptSetup } = require('../scripts/encrypt-setup');
  const { createStore } = require('../lib/store');

  const env = { FIREBASE_PROJECT_ID: PROJECT };
  const work = tempDir();
  const setupFile = path.join(work, 'setup.enc');
  const pdf = Buffer.from('%PDF-1.4 certificate bytes');
  const pdfPath = path.join(work, 'upload-AA0811.pdf');
  const logs = [];
  const log = (line) => logs.push(line);
  let store;
  let site;

  before(async () => {
    await clearFirestore();
    fs.writeFileSync(pdfPath, pdf);
    store = createStore({ dataDir: tempDir(), env });
  });

  after(async () => {
    if (site) await site.close();
    await store.close();
    fs.rmSync(work, { recursive: true, force: true });
  });

  test('first deploy: prints a public key, nothing private to apply', async () => {
    const first = await prepare(store, { setupFile, log });
    assert.equal(first.applied, false);
    assert.ok(logs.some((l) => l.includes('BEGIN PUBLIC KEY')));

    // The site starts with a random admin password nobody knows yet, and no links.
    site = await start({ env, dataDir: tempDir() });
    assert.ok(site.app.locals.generatedPassword);
    assert.equal((await fetch(`${site.base}/`, { redirect: 'manual' })).status, 200);
    await site.close();
    site = null;

    // Running again keeps the same key until a setup is applied.
    const second = await prepare(store, { setupFile, log });
    assert.equal(second.keyId, first.keyId);
  });

  test('second deploy: the encrypted admin login and file are applied, then the key is deleted', async () => {
    const { publicKeyPem } = await prepare(store, { setupFile, log });
    const setup = buildSetup({ username: 'Admin', password: 'secret-pass-1', filePath: pdfPath, fileName: 'AA0811.pdf' });
    const envelope = encryptSetup(setup, publicKeyPem);
    assert.ok(!JSON.stringify(envelope).includes('secret-pass-1'));
    assert.ok(!JSON.stringify(envelope).includes(pdf.toString('base64')));
    fs.writeFileSync(setupFile, JSON.stringify(envelope));

    const result = await prepare(store, { setupFile, log });
    assert.equal(result.applied, true);
    assert.equal((await store.collection('meta').doc('deployKey').get()).exists, false);

    // A later deploy makes a new key and ignores the old file.
    const later = await prepare(store, { setupFile, log });
    assert.equal(later.applied, false);
    assert.notEqual(later.keyId, result.keyId);
  });

  test('the site uses the new admin login; the file belongs to the home-page link', async () => {
    site = await start({ env, dataDir: tempDir() });
    assert.equal(site.app.locals.generatedPassword, null);
    const home = await fetch(`${site.base}/`, { redirect: 'manual' });
    assert.equal(home.status, 302);
    const code = home.headers.get('location').split('/')[2];
    const link = await (await fetch(`${site.base}/api/links/${code}`)).json();
    assert.equal(link.fileName, 'AA0811.pdf');

    const login = await fetch(`${site.base}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'secret-pass-1' }),
    });
    assert.equal(login.status, 200);
  });

  test('the smoke-test cookie opens the admin API', async () => {
    const cookie = `admin_session=${await adminCookie(store)}`;
    const res = await fetch(`${site.base}/api/admin/links`, { headers: { cookie } });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).links.length, 1);
  });
});
