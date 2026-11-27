'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pay-and-download-'));
process.env.ADMIN_PASSWORD = 'test-password';
const { app } = require('../server');

let server;
let base;
let cookie = '';

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

const json = (method, url, body, headers = {}) =>
  fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', cookie, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

test('page is not ready until a file is uploaded', async () => {
  const config = await (await fetch(`${base}/api/config`)).json();
  assert.equal(config.ready, false);
  assert.equal(config.amount, 1000);
  assert.equal(config.upiId, '7620721565@ybl');
  assert.match(config.upiLink, /^upi:\/\/pay\?pa=7620721565%40ybl&pn=PRINCE%20TAILOR&am=1000\.00&cu=INR&tn=GST%20FEES$/);
  const res = await json('POST', '/api/payments', { utr: '123456789012' });
  assert.equal(res.status, 503);
});

test('the owner scanner image is served as the QR', async () => {
  const res = await fetch(`${base}/api/qr`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
});

test('admin routes need a login', async () => {
  assert.equal((await json('GET', '/api/admin/payments')).status, 401);
  assert.equal((await json('POST', '/api/admin/login', { username: 'admin', password: 'nope' })).status, 401);
  assert.equal((await json('POST', '/api/admin/login', { username: 'someone', password: 'test-password' })).status, 401);
  assert.equal((await json('POST', '/api/admin/login', { password: 'test-password' })).status, 401);
  // The ID is not case-sensitive (phones often capitalise the first letter).
  const res = await json('POST', '/api/admin/login', { username: 'Admin ', password: 'test-password' });
  assert.equal(res.status, 200);
  cookie = res.headers.get('set-cookie').split(';')[0];
  assert.equal((await json('GET', '/api/admin/payments')).status, 200);
});

test('admin uploads the file, keeping a non-English file name', async () => {
  const form = new FormData();
  form.append('file', new Blob(['%PDF-1.4 test']), 'प्रमाणपत्र certificate.pdf');
  const res = await fetch(`${base}/api/admin/file`, { method: 'POST', body: form, headers: { cookie } });
  assert.equal(res.status, 200);
  const settings = await res.json();
  assert.equal(settings.file.name, 'प्रमाणपत्र certificate.pdf');
  assert.equal(settings.ready, true);
});

test('a 12-digit UTR unlocks the download straight away', async () => {
  assert.equal((await json('POST', '/api/payments', { utr: '12345' })).status, 400);

  const res = await json('POST', '/api/payments', { utr: '4123 4567 8901', name: 'Asha', phone: '9876543210' });
  assert.equal(res.status, 201);
  const payment = await res.json();
  assert.equal(payment.utr, '412345678901');
  assert.equal(payment.amount, 1000);

  const download = await fetch(base + payment.downloadUrl);
  assert.equal(download.status, 200);
  assert.equal(await download.text(), '%PDF-1.4 test');
  assert.match(download.headers.get('content-disposition'), /attachment/);

  // The same UTR cannot be used again.
  assert.equal((await json('POST', '/api/payments', { utr: '412345678901' })).status, 409);

  // The buyer's page can reload the receipt from the saved token.
  const again = await (await fetch(`${base}/api/payments/${payment.token}`)).json();
  assert.equal(again.utr, '412345678901');
});

test('admin sees the payment and can mark it received', async () => {
  const { payments } = await (await json('GET', '/api/admin/payments')).json();
  assert.equal(payments.length, 1);
  const [p] = payments;
  assert.equal(p.utr, '412345678901');
  assert.equal(p.downloads, 1);
  assert.equal(p.status, 'new');
  assert.equal(p.token, undefined, 'the download token is not exposed to the admin list');

  assert.equal((await json('PATCH', `/api/admin/payments/${p.id}`, { status: 'received' })).status, 200);
  assert.equal((await json('PATCH', `/api/admin/payments/${p.id}`, { status: 'paid' })).status, 400);

  const csv = await (await json('GET', '/api/admin/payments.csv')).text();
  assert.match(csv, /412345678901/);
  assert.match(csv, /received/);
});

test('a blocked payment cannot download', async () => {
  const res = await json('POST', '/api/payments', { utr: '111122223333' });
  const p = await res.json();
  const { payments: all } = await (await json('GET', '/api/admin/payments')).json();
  const entry = all.find((x) => x.utr === '111122223333');
  await json('PATCH', `/api/admin/payments/${entry.id}`, { status: 'blocked' });
  assert.equal((await fetch(base + p.downloadUrl)).status, 403);
  assert.equal((await (await fetch(`${base}/api/payments/${p.token}`)).json()).blocked, true);
});

test('settings update the price and the auto QR', async () => {
  const bad = await json('PUT', '/api/admin/settings', { productName: 'X', amount: 0, upiId: 'shop@ybl' });
  assert.equal(bad.status, 400);
  const res = await json('PUT', '/api/admin/settings', {
    productName: 'GST Certificate',
    description: '',
    amount: '1500',
    note: 'GST FEES',
    upiId: '7620721565@ybl',
    payeeName: 'PRINCE TAILOR',
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).amount, 1500);

  assert.equal((await json('DELETE', '/api/admin/qr')).status, 200);
  const qr = await fetch(`${base}/api/qr`);
  assert.equal(qr.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
  const config = await (await fetch(`${base}/api/config`)).json();
  assert.match(config.upiLink, /am=1500\.00/);
});

test('unknown download links show a friendly page', async () => {
  const res = await fetch(`${base}/download/not-a-real-token-at-all-123`);
  assert.equal(res.status, 404);
  assert.match(await res.text(), /Link not found/);
});
