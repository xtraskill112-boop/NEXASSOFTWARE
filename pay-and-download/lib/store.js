'use strict';

/*
 * Where the app keeps its data. Two interchangeable drivers:
 *
 *   FileStore       data/db.json + data/uploads/ on the local disk (default; for a server with a lasting disk)
 *   FirestoreStore  Cloud Firestore (when FIREBASE_PROJECT_ID is set), for hosts whose disk is wiped on
 *                   every restart, such as Render's free plan. Files are kept in Firestore as chunks and
 *                   copied to the local disk, which then serves as a cache.
 *
 * Both expose the same methods:
 *   load() -> { meta, payments, links }   meta = { secret, settings, admin } or null on a brand-new site
 *   saveMeta(meta) · savePayment(p) · deletePayment(id) · saveLink(link) · deleteLink(id)
 *   putBlob(name, buffer?)            store a file (without a buffer: the file already in uploadDir)
 *   ensureLocal(name)                 make sure uploadDir has the file
 *   deleteBlob(name) · blobInfo(name) · localPath(name)
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const byCreatedAt = (a, b) => String(a.createdAt).localeCompare(String(b.createdAt));

class FileStore {
  constructor({ dataDir }) {
    this.kind = 'file';
    this.dataDir = dataDir;
    this.uploadDir = path.join(dataDir, 'uploads');
    this.dbFile = path.join(dataDir, 'db.json');
    this.meta = null;
    this.payments = new Map();
    this.links = new Map();
    this.writing = Promise.resolve();
    fs.mkdirSync(this.uploadDir, { recursive: true });
  }

  localPath(name) {
    return path.join(this.uploadDir, path.basename(name));
  }

  async load() {
    if (!fs.existsSync(this.dbFile)) return { meta: null, payments: [], links: [] };
    const saved = JSON.parse(await fsp.readFile(this.dbFile, 'utf8'));
    this.meta = { secret: saved.secret, settings: saved.settings, admin: saved.admin || null };
    this.payments = new Map((saved.payments || []).map((p) => [p.id, p]));
    this.links = new Map((saved.links || []).map((l) => [l.id, l]));
    return {
      meta: this.meta,
      payments: [...this.payments.values()].sort(byCreatedAt),
      links: [...this.links.values()].sort(byCreatedAt),
    };
  }

  /** Writes db.json; writes are queued so two saves never race on the temporary file. */
  flush() {
    const write = async () => {
      const data = {
        ...this.meta,
        links: [...this.links.values()].sort(byCreatedAt),
        payments: [...this.payments.values()].sort(byCreatedAt),
      };
      const tmp = `${this.dbFile}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(data, null, 2));
      await fsp.rename(tmp, this.dbFile);
    };
    this.writing = this.writing.then(write, write);
    return this.writing;
  }

  async saveLink(link) {
    this.links.set(link.id, link);
    await this.flush();
  }

  async deleteLink(id) {
    this.links.delete(id);
    await this.flush();
  }

  async saveMeta(meta) {
    this.meta = meta;
    await this.flush();
  }

  async savePayment(payment) {
    this.payments.set(payment.id, payment);
    await this.flush();
  }

  async deletePayment(id) {
    this.payments.delete(id);
    await this.flush();
  }

  async putBlob(name, buffer) {
    if (buffer) await fsp.writeFile(this.localPath(name), buffer);
  }

  async ensureLocal(name) {
    if (!fs.existsSync(this.localPath(name))) throw new Error(`File ${name} is missing from ${this.uploadDir}`);
  }

  async deleteBlob(name) {
    await fsp.rm(this.localPath(name), { force: true });
  }

  async blobInfo(name) {
    const buf = await fsp.readFile(this.localPath(name));
    return { size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
  }

  async close() {}
}

// Firestore documents hold at most 1 MiB; files are split into chunks well under that.
const CHUNK_BYTES = 750 * 1024;

class FirestoreStore {
  constructor({ dataDir, projectId, credentials, prefix = 'payDownload' }) {
    // Loaded only when Firestore is used, so local runs don't need it configured.
    const { Firestore } = require('@google-cloud/firestore');
    this.kind = 'firestore';
    this.uploadDir = path.join(dataDir, 'uploads');
    fs.mkdirSync(this.uploadDir, { recursive: true });
    this.db = new Firestore({
      projectId,
      ignoreUndefinedProperties: true,
      ...(credentials ? { credentials: { client_email: credentials.client_email, private_key: credentials.private_key } } : {}),
    });
    this.metaDoc = this.db.collection(`${prefix}_meta`).doc('main');
    this.paymentsCol = this.db.collection(`${prefix}_payments`);
    this.linksCol = this.db.collection(`${prefix}_links`);
    this.blobsCol = this.db.collection(`${prefix}_blobs`);
    this.prefix = prefix;
  }

  localPath(name) {
    return path.join(this.uploadDir, path.basename(name));
  }

  collection(suffix) {
    return this.db.collection(`${this.prefix}_${suffix}`);
  }

  async load() {
    const [meta, payments, links] = await Promise.all([this.metaDoc.get(), this.paymentsCol.get(), this.linksCol.get()]);
    return {
      meta: meta.exists ? meta.data() : null,
      payments: payments.docs.map((d) => d.data()).sort(byCreatedAt),
      links: links.docs.map((d) => d.data()).sort(byCreatedAt),
    };
  }

  async saveLink(link) {
    await this.linksCol.doc(link.id).set(link);
  }

  async deleteLink(id) {
    await this.linksCol.doc(id).delete();
  }

  async saveMeta(meta) {
    await this.metaDoc.set(meta);
  }

  async savePayment(payment) {
    await this.paymentsCol.doc(payment.id).set(payment);
  }

  async deletePayment(id) {
    await this.paymentsCol.doc(id).delete();
  }

  async putBlob(name, buffer) {
    const local = this.localPath(name);
    if (buffer) await fsp.writeFile(local, buffer);
    const data = buffer || (await fsp.readFile(local));
    const ref = this.blobsCol.doc(path.basename(name));
    const chunks = Math.max(1, Math.ceil(data.length / CHUNK_BYTES));
    for (let i = 0; i < chunks; i += 1) {
      await ref
        .collection('chunks')
        .doc(String(i).padStart(5, '0'))
        .set({ data: data.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES) });
    }
    // Written last: a blob with a header is complete.
    await ref.set({
      size: data.length,
      chunks,
      sha256: crypto.createHash('sha256').update(data).digest('hex'),
      createdAt: new Date().toISOString(),
    });
  }

  async ensureLocal(name) {
    const local = this.localPath(name);
    if (fs.existsSync(local)) return;
    const ref = this.blobsCol.doc(path.basename(name));
    const head = await ref.get();
    if (!head.exists) throw new Error(`File ${name} is missing from Firestore`);
    const { chunks, sha256 } = head.data();
    const parts = [];
    for (let i = 0; i < chunks; i += 1) {
      const chunk = await ref.collection('chunks').doc(String(i).padStart(5, '0')).get();
      if (!chunk.exists) throw new Error(`File ${name} is incomplete in Firestore`);
      parts.push(Buffer.from(chunk.get('data')));
    }
    const data = Buffer.concat(parts);
    if (crypto.createHash('sha256').update(data).digest('hex') !== sha256) {
      throw new Error(`File ${name} is damaged in Firestore`);
    }
    const tmp = `${local}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, data);
    await fsp.rename(tmp, local);
  }

  async deleteBlob(name) {
    await fsp.rm(this.localPath(name), { force: true });
    await this.db.recursiveDelete(this.blobsCol.doc(path.basename(name)));
  }

  async blobInfo(name) {
    const head = await this.blobsCol.doc(path.basename(name)).get();
    if (!head.exists) throw new Error(`File ${name} is missing from Firestore`);
    const { size, sha256 } = head.data();
    return { size, sha256 };
  }

  async close() {
    await this.db.terminate();
  }
}

/** Firestore when FIREBASE_PROJECT_ID is set, otherwise the local disk. */
function createStore({ dataDir, env = process.env }) {
  if (!env.FIREBASE_PROJECT_ID) return new FileStore({ dataDir });
  let credentials;
  if (env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    credentials = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
  }
  // Without a key, Google's default credentials are used (e.g. the GitHub Actions sign-in).
  return new FirestoreStore({ dataDir, projectId: env.FIREBASE_PROJECT_ID, credentials });
}

module.exports = { createStore, FileStore, FirestoreStore };
