#!/usr/bin/env node
'use strict';

/*
 * Run by the deploy workflow (.github/workflows/pay-and-download-deploy.yml) with Google credentials
 * and FIREBASE_PROJECT_ID in the environment.
 *
 *   prepare   make sure the site's data exists and a deploy key exists (its public key is printed),
 *             then apply deploy/setup.enc if it was encrypted for that key: the admin ID and password
 *             hash, and the file buyers download
 *   cookie    print an admin session cookie valid for 30 minutes (for the deploy smoke test)
 *   file-sha  print the sha256 of the file buyers download
 *
 * Why: this repository is public, so the admin password and the file can't be committed. They are
 * encrypted with scripts/encrypt-setup.js for the public key printed here. The matching private key
 * exists only in Firestore and is deleted once the setup is applied, after which deploy/setup.enc
 * can never be opened again.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const auth = require('../lib/auth');
const { createStore } = require('../lib/store');
const { loadState, randomName } = require('../lib/state');

const SETUP_FILE = path.join(__dirname, '..', 'deploy', 'setup.enc');
const BEGIN = '-----BEGIN PAY-AND-DOWNLOAD DEPLOY KEY-----';
const END = '-----END PAY-AND-DOWNLOAD DEPLOY KEY-----';
const SETTINGS_KEYS = ['productName', 'description', 'amount', 'note', 'upiId', 'payeeName'];

function keyIdOf(publicKeyPem) {
  const der = crypto.createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  return crypto.createHash('sha256').update(der).digest('hex').slice(0, 16);
}

function decryptSetup(envelope, privateKeyPem) {
  const key = crypto.privateDecrypt(
    { key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(envelope.key, 'base64'),
  );
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

function openStore() {
  if (!process.env.FIREBASE_PROJECT_ID) throw new Error('FIREBASE_PROJECT_ID is not set.');
  return createStore({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'pay-and-download-')) });
}

async function prepare(store, { setupFile = SETUP_FILE, log = console.log } = {}) {
  const keyDoc = store.collection('meta').doc('deployKey');
  let snap = await keyDoc.get();
  if (!snap.exists) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 3072 });
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    await keyDoc.set({ publicKeyPem, privateKeyPem, keyId: keyIdOf(publicKeyPem), createdAt: new Date().toISOString() });
    snap = await keyDoc.get();
  }
  const { publicKeyPem, privateKeyPem, keyId } = snap.data();
  log(`Deploy key ${keyId}:`);
  log(BEGIN);
  log(publicKeyPem.trim());
  log(END);

  const { meta } = await loadState(store);

  if (!fs.existsSync(setupFile)) {
    log('No deploy/setup.enc: nothing private to apply.');
    return { applied: false, keyId, publicKeyPem };
  }
  const envelope = JSON.parse(fs.readFileSync(setupFile, 'utf8'));
  if (envelope.keyId !== keyId) {
    log(`deploy/setup.enc was made for deploy key ${envelope.keyId} (already applied earlier); skipping it.`);
    return { applied: false, keyId, publicKeyPem };
  }
  const setup = decryptSetup(envelope, privateKeyPem);
  let oldFile = null;

  if (setup.admin) {
    const username = String(setup.admin.username || '').trim().toLowerCase();
    if (!username || !String(setup.admin.passwordHash || '').startsWith('scrypt$')) {
      throw new Error('deploy/setup.enc has an invalid admin login.');
    }
    meta.admin = { username, passwordHash: setup.admin.passwordHash };
    log(`Admin ID set to "${username}" (password stored as a hash).`);
  }

  if (setup.file) {
    const data = Buffer.from(setup.file.data, 'base64');
    if (crypto.createHash('sha256').update(data).digest('hex') !== setup.file.sha256) {
      throw new Error('deploy/setup.enc: the file is damaged.');
    }
    const stored = randomName();
    await store.putBlob(stored, data);
    oldFile = meta.settings.file;
    meta.settings.file = {
      stored,
      name: setup.file.name,
      size: data.length,
      mime: setup.file.mime || 'application/octet-stream',
      uploadedAt: new Date().toISOString(),
    };
    log(`File buyers download set to "${setup.file.name}" (${data.length} bytes).`);
  }

  if (setup.settings) {
    for (const key of SETTINGS_KEYS) if (key in setup.settings) meta.settings[key] = setup.settings[key];
    log('Settings updated.');
  }

  meta.settings.updatedAt = new Date().toISOString();
  await store.saveMeta(meta);
  if (oldFile) await store.deleteBlob(oldFile.stored);
  await keyDoc.delete();
  log('Setup applied. The deploy key was deleted, so deploy/setup.enc can never be opened again.');
  return { applied: true, keyId, publicKeyPem };
}

async function adminCookie(store) {
  const { meta } = await loadState(store);
  if (!meta.admin) throw new Error('No admin login is stored yet.');
  const key = auth.sessionKey(meta.secret, meta.admin.username.trim().toLowerCase(), meta.admin.passwordHash);
  return auth.newSession(key, 0.5);
}

async function fileSha(store) {
  const { meta } = await loadState(store);
  if (!meta.settings.file) return '';
  return (await store.blobInfo(meta.settings.file.stored)).sha256;
}

async function main(command) {
  const store = openStore();
  if (command === 'prepare') await prepare(store);
  else if (command === 'cookie') console.log(await adminCookie(store));
  else if (command === 'file-sha') console.log(await fileSha(store));
  else throw new Error('Usage: deploy-setup.js prepare|cookie|file-sha');
}

if (require.main === module) {
  main(process.argv[2]).catch((err) => {
    console.error(`::error::${err.message}`);
    process.exit(1);
  });
}

module.exports = { prepare, adminCookie, fileSha, decryptSetup, keyIdOf, BEGIN, END };
