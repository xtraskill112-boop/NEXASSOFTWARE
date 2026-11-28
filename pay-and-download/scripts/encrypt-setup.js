#!/usr/bin/env node
'use strict';

/*
 * Encrypts the private part of the setup (admin login and the file buyers download) for the deploy
 * key that the deploy workflow prints, so it can be committed to this public repository safely.
 *
 *   SETUP_ADMIN_PASSWORD='…' node scripts/encrypt-setup.js \
 *     --public-key key.pem [--username admin] [--file certificate.pdf [--file-name name.pdf]] [--out deploy/setup.enc]
 *
 * The password is read from SETUP_ADMIN_PASSWORD and only its scrypt hash goes into the file.
 * Push the result; the next deploy applies it and deletes the key that can open it.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { hashPassword } = require('../lib/auth');
const { keyIdOf } = require('./deploy-setup');

const MIME = { '.pdf': 'application/pdf', '.zip': 'application/zip', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

function encryptSetup(setup, publicKeyPem) {
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(setup), 'utf8'), cipher.final()]);
  return {
    version: 1,
    alg: 'RSA-OAEP-256 + A256GCM',
    keyId: keyIdOf(publicKeyPem),
    key: crypto.publicEncrypt({ key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, key).toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

function buildSetup({ username, password, filePath, fileName }) {
  const setup = { version: 1, createdAt: new Date().toISOString() };
  if (password) setup.admin = { username: (username || 'admin').trim().toLowerCase(), passwordHash: hashPassword(password) };
  if (filePath) {
    const data = fs.readFileSync(filePath);
    const name = fileName || path.basename(filePath);
    setup.file = {
      name,
      mime: MIME[path.extname(name).toLowerCase()] || 'application/octet-stream',
      sha256: crypto.createHash('sha256').update(data).digest('hex'),
      data: data.toString('base64'),
    };
  }
  return setup;
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1];
  return out;
}

if (require.main === module) {
  const a = args(process.argv.slice(2));
  if (!a['public-key']) {
    console.error('Usage: SETUP_ADMIN_PASSWORD=… encrypt-setup.js --public-key key.pem [--username admin] [--file f] [--file-name n] [--out deploy/setup.enc]');
    process.exit(1);
  }
  const setup = buildSetup({
    username: a.username,
    password: process.env.SETUP_ADMIN_PASSWORD,
    filePath: a.file,
    fileName: a['file-name'],
  });
  const out = a.out || path.join(__dirname, '..', 'deploy', 'setup.enc');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(encryptSetup(setup, fs.readFileSync(a['public-key'], 'utf8')), null, 2)}\n`);
  console.log(`Wrote ${out}: ${[setup.admin && `admin "${setup.admin.username}"`, setup.file && `file "${setup.file.name}"`].filter(Boolean).join(', ') || 'nothing'}`);
}

module.exports = { encryptSetup, buildSetup };
