'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { after, before, describe, test } = require('node:test');
const { EMULATOR, tempDir, clearFirestore, storeEnv, start } = require('./helpers');

for (const kind of ['file', 'firestore']) {
  describe(`with ${kind === 'file' ? 'the local disk' : 'Firestore (emulator)'}`, { skip: kind === 'firestore' && !EMULATOR && 'set FIRESTORE_EMULATOR_HOST' }, () => {
    const env = storeEnv(kind, { ADMIN_PASSWORD: 'test-password' });
    const dataDir = tempDir();
    let site;
    let base;
    let cookie = '';
    let gst; // link 1: ₹1000
    let notes; // link 2: ₹250
    let paid; // a payment on link 1

    const json = (method, url, body, headers = {}) =>
      fetch(base + url, {
        method,
        redirect: 'manual',
        headers: { 'Content-Type': 'application/json', cookie, ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const data = async (method, url, body) => (await json(method, url, body)).json();
    const uploadFile = (linkId, name, content, field = 'file', type) => {
      const form = new FormData();
      form.append(field, new Blob([content], type ? { type } : {}), name);
      return fetch(`${base}/api/admin/links/${linkId}/${field === 'file' ? 'file' : 'qr'}`, { method: 'POST', body: form, headers: { cookie } });
    };
    const pay = (code, utr, extra = {}) => json('POST', `/api/links/${code}/payments`, { utr, ...extra });

    before(async () => {
      if (kind === 'firestore') await clearFirestore();
      site = await start({ env, dataDir });
      base = site.base;
    });

    after(async () => {
      await site.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    });

    test('a new site has no links: the home page asks for a payment link', async () => {
      const home = await json('GET', '/');
      assert.equal(home.status, 200);
      assert.match(await home.text(), /Open your payment link/);
      assert.equal((await json('GET', '/api/links/nope1234')).status, 404);
      assert.equal((await fetch(`${base}/healthz`)).status, 200);
    });

    test('admin routes need the ID and password', async () => {
      assert.equal((await json('GET', '/api/admin/links')).status, 401);
      assert.equal((await json('POST', '/api/admin/login', { username: 'admin', password: 'nope' })).status, 401);
      assert.equal((await json('POST', '/api/admin/login', { username: 'someone', password: 'test-password' })).status, 401);
      // The ID is not case-sensitive (phones often capitalise the first letter).
      const res = await json('POST', '/api/admin/login', { username: 'Admin ', password: 'test-password' });
      assert.equal(res.status, 200);
      cookie = res.headers.get('set-cookie').split(';')[0];
      assert.equal((await json('GET', '/api/admin/links')).status, 200);
    });

    test('admin makes links, each with its own price, note and file', async () => {
      assert.equal((await json('POST', '/api/admin/links', { title: '', amount: 10 })).status, 400);
      assert.equal((await json('POST', '/api/admin/links', { title: 'X', amount: 0 })).status, 400);

      gst = await data('POST', '/api/admin/links', { title: 'GST Certificate', amount: 1000, note: 'GST FEES' });
      notes = await data('POST', '/api/admin/links', { title: 'Class notes', amount: '250', description: 'All chapters' });
      assert.match(gst.code, /^[a-z2-9]{8}$/);
      assert.notEqual(gst.code, notes.code);
      assert.equal(gst.path, `/p/${gst.code}`);

      // Without a file the link isn't ready yet.
      const before = await data('GET', `/api/links/${gst.code}`);
      assert.equal(before.ready, false);
      assert.equal((await pay(gst.code, '123456789012')).status, 503);

      let res = await uploadFile(gst.id, 'प्रमाणपत्र certificate.pdf', '%PDF-1.4 gst');
      assert.equal(res.status, 200);
      assert.equal((await res.json()).file.name, 'प्रमाणपत्र certificate.pdf');
      res = await uploadFile(notes.id, 'notes.zip', 'ZIP notes');
      assert.equal(res.status, 200);

      const a = await data('GET', `/api/links/${gst.code}`);
      const b = await data('GET', `/api/links/${notes.code}`);
      assert.equal(a.ready, true);
      assert.equal(a.upiLink, 'upi://pay?pa=7620721565%40ybl&pn=PRINCE%20TAILOR&am=1000.00&cu=INR&tn=GST%20FEES');
      assert.equal(b.amount, 250);
      assert.equal(b.upiLink, 'upi://pay?pa=7620721565%40ybl&pn=PRINCE%20TAILOR&am=250.00&cu=INR&tn=Class%20notes');
      assert.equal(a.fileName, 'प्रमाणपत्र certificate.pdf');

      const qr = await fetch(base + a.qrUrl);
      assert.equal(qr.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
      assert.equal((await json('GET', `/p/${gst.code}`)).status, 200);
    });

    test('a submitted UTR waits for the owner: no download yet', async () => {
      assert.equal((await pay(gst.code, '12345')).status, 400);
      const res = await pay(gst.code, '4123 4567 8901', { name: 'Asha', phone: '9876543210' });
      assert.equal(res.status, 201);
      paid = await res.json();
      assert.equal(paid.status, 'new');
      assert.equal(paid.utr, '412345678901');
      assert.equal(paid.amount, 1000);
      assert.equal(paid.checkSeconds, 120);
      assert.equal(paid.downloadUrl, null);
      assert.ok(paid.elapsedSeconds >= 0 && paid.elapsedSeconds < 5);

      // Guessing the download address doesn't help while it's being checked.
      const early = await fetch(`${base}/download/${paid.token}`);
      assert.equal(early.status, 403);
      assert.match(await early.text(), /under checking/i);

      // A UTR can be used once, on any link.
      assert.equal((await pay(notes.code, '412345678901')).status, 409);
    });

    test('admin sees it waiting and clicks Received: the buyer can download', async () => {
      const { payments } = await data('GET', '/api/admin/payments');
      const p = payments.find((x) => x.utr === '412345678901');
      assert.equal(p.status, 'new');
      assert.equal(p.linkTitle, 'GST Certificate');
      assert.equal(p.token, undefined, 'the download token is not shown to the admin list');

      assert.equal((await json('PATCH', `/api/admin/payments/${p.id}`, { status: 'paid' })).status, 400);
      assert.equal((await json('PATCH', `/api/admin/payments/${p.id}`, { status: 'received' })).status, 200);

      const status = await (await fetch(`${base}/api/payments/${paid.token}`)).json();
      assert.equal(status.status, 'received');
      assert.equal(status.downloadUrl, `/download/${paid.token}`);
      assert.equal(status.fileName, 'प्रमाणपत्र certificate.pdf');

      const download = await fetch(base + status.downloadUrl);
      assert.equal(download.status, 200);
      assert.equal(await download.text(), '%PDF-1.4 gst');
      assert.match(download.headers.get('content-disposition'), /attachment/);
    });

    test('each link delivers its own file', async () => {
      const p = await (await pay(notes.code, '222233334444')).json();
      assert.equal(p.amount, 250);
      const { payments } = await data('GET', '/api/admin/payments');
      await json('PATCH', `/api/admin/payments/${payments.find((x) => x.utr === '222233334444').id}`, { status: 'received' });
      assert.equal(await (await fetch(`${base}/download/${p.token}`)).text(), 'ZIP notes');
    });

    test('Not received tells the buyer and keeps the file locked', async () => {
      const p = await (await pay(gst.code, '111122223333')).json();
      const { payments } = await data('GET', '/api/admin/payments');
      await json('PATCH', `/api/admin/payments/${payments.find((x) => x.utr === '111122223333').id}`, { status: 'blocked' });
      const status = await (await fetch(`${base}/api/payments/${p.token}`)).json();
      assert.equal(status.status, 'blocked');
      assert.equal(status.downloadUrl, null);
      const res = await fetch(`${base}/download/${p.token}`);
      assert.equal(res.status, 403);
      assert.match(await res.text(), /not received/i);
    });

    test('link cards count payments per link', async () => {
      const { links } = await data('GET', '/api/admin/links');
      const a = links.find((l) => l.id === gst.id);
      assert.deepEqual(a.stats, { payments: 2, waiting: 0, received: 1, receivedAmount: 1000 });
      const csv = await (await json('GET', '/api/admin/payments.csv')).text();
      assert.match(csv, /"GST Certificate","Received"/);
      assert.match(csv, /"Not received"/);
    });

    test('a paused link takes no payments, but paid buyers can still download', async () => {
      assert.equal((await json('PUT', `/api/admin/links/${gst.id}`, { active: false })).status, 200);
      assert.equal((await json('GET', `/api/links/${gst.code}`)).status, 404);
      assert.equal((await pay(gst.code, '555566667777')).status, 404);
      assert.equal((await fetch(`${base}/download/${paid.token}`)).status, 200);
      await json('PUT', `/api/admin/links/${gst.id}`, { active: true });
      assert.equal((await json('GET', `/api/links/${gst.code}`)).status, 200);
    });

    test('editing the price changes the QR', async () => {
      const edited = await data('PUT', `/api/admin/links/${gst.id}`, { amount: 1500 });
      assert.equal(edited.amount, 1500);
      assert.equal(edited.title, 'GST Certificate');
      assert.match((await data('GET', `/api/links/${gst.code}`)).upiLink, /am=1500\.00/);
    });

    test('a link can use the owner’s own scanner image', async () => {
      const bad = await uploadFile(gst.id, 'x.svg', '<svg/>', 'qr', 'image/svg+xml');
      assert.equal(bad.status, 400);
      const res = await uploadFile(gst.id, 'scanner.png', 'PNGDATA', 'qr', 'image/png');
      assert.equal(res.status, 200);
      const link = await data('GET', `/api/links/${gst.code}`);
      assert.equal(link.customQr, true);
      assert.equal((await fetch(base + link.qrUrl)).headers.get('content-type'), 'image/png');
      assert.equal((await json('DELETE', `/api/admin/links/${gst.id}/qr`)).status, 200);
      assert.equal((await data('GET', `/api/links/${gst.code}`)).customQr, false);
    });

    test('the home page can open a chosen link', async () => {
      assert.equal((await json('PUT', '/api/admin/settings', { homeLinkId: 'missing' })).status, 400);
      assert.equal((await json('PUT', '/api/admin/settings', { upiId: 'not a upi' })).status, 400);
      await json('PUT', '/api/admin/settings', { homeLinkId: gst.id });
      const home = await json('GET', '/');
      assert.equal(home.status, 302);
      assert.equal(home.headers.get('location'), `/p/${gst.code}`);
      assert.equal((await data('GET', '/api/admin/links')).links.find((l) => l.id === gst.id).isHome, true);
    });

    test('everything survives a restart on a wiped disk', { skip: kind === 'file' && 'the local disk is the storage' }, async () => {
      // Render's free servers lose their disk on every restart: Firestore must hold everything.
      const fresh = await start({ env, dataDir: tempDir() });
      try {
        assert.equal((await (await fetch(`${fresh.base}/api/links/${notes.code}`)).json()).ready, true);
        assert.equal(await (await fetch(`${fresh.base}/download/${paid.token}`)).text(), '%PDF-1.4 gst');
        const res = await fetch(`${fresh.base}/api/admin/payments`, { headers: { cookie } });
        assert.equal(res.status, 200, 'admin sessions stay valid across restarts');
        const { payments } = await res.json();
        assert.deepEqual(payments.map((p) => [p.utr, p.status]), [
          ['111122223333', 'blocked'],
          ['222233334444', 'received'],
          ['412345678901', 'received'],
        ]);
        assert.equal((await fetch(`${fresh.base}/`, { redirect: 'manual' })).headers.get('location'), `/p/${gst.code}`);
      } finally {
        await fresh.close();
      }
    });

    test('deleting a link stops it; its payments stay listed', async () => {
      assert.equal((await json('DELETE', `/api/admin/links/${gst.id}`)).status, 200);
      assert.equal((await json('GET', `/api/links/${gst.code}`)).status, 404);
      assert.equal((await fetch(`${base}/download/${paid.token}`)).status, 404);
      const home = await json('GET', '/');
      assert.equal(home.status, 200, 'the home page no longer redirects');
      const { payments } = await data('GET', '/api/admin/payments');
      assert.equal(payments.find((p) => p.utr === '412345678901').linkTitle, 'GST Certificate');
    });

    test('unknown download links show a friendly page', async () => {
      const res = await fetch(`${base}/download/not-a-real-token-at-all-123`);
      assert.equal(res.status, 404);
      assert.match(await res.text(), /Link not found/);
    });
  });

  describe(`upgrading a first-version site (${kind})`, { skip: kind === 'firestore' && !EMULATOR && 'set FIRESTORE_EMULATOR_HOST' }, () => {
    test('its single product becomes the first link and the home page; old payments are kept', async () => {
      if (kind === 'firestore') await clearFirestore();
      const { createStore } = require('../lib/store');
      const dataDir = tempDir();
      const env = storeEnv(kind, { ADMIN_PASSWORD: 'pw' });
      const store = createStore({ dataDir, env });
      // What version 1 saved: one product in the settings, payments without a link.
      await store.putBlob('aaaa', Buffer.from('%PDF old certificate'));
      await store.putBlob('bbbb', Buffer.from('PNG scanner'));
      await store.saveMeta({
        secret: 'old-secret',
        admin: null,
        settings: {
          productName: 'GST Registration Certificate',
          description: 'Pay the GST fees',
          amount: 1000,
          upiId: '7620721565@ybl',
          payeeName: 'PRINCE TAILOR',
          note: 'GST FEES',
          qrImage: { stored: 'bbbb', mime: 'image/png', uploadedAt: '2026-11-27T00:00:00.000Z' },
          file: { stored: 'aaaa', name: 'AA0811.pdf', size: 20, mime: 'application/pdf', uploadedAt: '2026-11-27T00:00:00.000Z' },
          updatedAt: '2026-11-27T00:00:00.000Z',
        },
      });
      await store.savePayment({
        id: 'p1',
        token: 'old-token-old-token-old-token',
        utr: '999988887777',
        amount: 1000,
        productName: 'GST Registration Certificate',
        status: 'received',
        createdAt: '2026-11-27T01:00:00.000Z',
        downloads: 1,
      });
      await store.close();

      const s = await start({ env, dataDir });
      try {
        const home = await fetch(`${s.base}/`, { redirect: 'manual' });
        assert.equal(home.status, 302);
        const code = home.headers.get('location').split('/')[2];
        const link = await (await fetch(`${s.base}/api/links/${code}`)).json();
        assert.equal(link.title, 'GST Registration Certificate');
        assert.equal(link.amount, 1000);
        assert.equal(link.ready, true);
        assert.equal(link.customQr, true);
        assert.equal(link.fileName, 'AA0811.pdf');
        assert.match(link.upiLink, /tn=GST%20FEES/);
        // The earlier buyer's download link still works.
        assert.equal(await (await fetch(`${s.base}/download/old-token-old-token-old-token`)).text(), '%PDF old certificate');
      } finally {
        await s.close();
      }

      // Starting again doesn't migrate twice.
      const again = await start({ env, dataDir });
      try {
        const login = await fetch(`${again.base}/api/admin/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'admin', password: 'pw' }),
        });
        const c = login.headers.get('set-cookie').split(';')[0];
        const { links } = await (await fetch(`${again.base}/api/admin/links`, { headers: { cookie: c } })).json();
        assert.equal(links.length, 1);
        assert.equal(links[0].stats.received, 1);
      } finally {
        await again.close();
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    });
  });
}
