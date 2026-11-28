'use strict';

const crypto = require('node:crypto');

/** Constant-time comparison of two strings of any length. */
function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

/** Passwords are only ever stored as "scrypt$<salt>$<hash>". */
function hashPassword(password, salt = crypto.randomBytes(16).toString('base64url')) {
  const hash = crypto.scryptSync(String(password), salt, 32).toString('base64url');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [kind, salt, hash] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  return safeEqual(hashPassword(password, salt), stored);
}

/**
 * Key that signs admin session cookies. It is tied to the site secret and the current login,
 * so changing the ID or password signs every existing session out.
 */
function sessionKey(secret, username, credential) {
  return crypto.createHmac('sha256', String(secret)).update(`${username}\n${credential}`).digest();
}

function sign(key, value) {
  return crypto.createHmac('sha256', key).update(value).digest('base64url');
}

function newSession(key, hours) {
  const expires = String(Date.now() + hours * 3600 * 1000);
  return `${expires}.${sign(key, expires)}`;
}

function sessionValid(key, token) {
  if (typeof token !== 'string') return false;
  const [expires, signature] = token.split('.');
  if (!expires || !signature) return false;
  return safeEqual(signature, sign(key, expires)) && Number(expires) > Date.now();
}

module.exports = { safeEqual, hashPassword, verifyPassword, sessionKey, newSession, sessionValid };
