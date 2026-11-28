'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createApp } = require('../server');

// Firestore tests run only against the emulator:
//   firebase emulators:start --only firestore --project demo-paydl
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 npm test
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = process.env.TEST_FIREBASE_PROJECT || 'demo-paydl';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pay-and-download-test-'));
}

async function clearFirestore() {
  const res = await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Could not clear the emulator: ${res.status}`);
}

/** Environment for a store: local disk, or Firestore on the emulator. */
function storeEnv(kind, extra = {}) {
  const env = { ...extra };
  if (kind === 'firestore') env.FIREBASE_PROJECT_ID = PROJECT;
  return env;
}

async function start({ env, dataDir }) {
  const app = await createApp({ env, dataDir });
  const server = app.listen(0);
  await once(server, 'listening');
  const close = async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await app.locals.store.close();
  };
  return { app, server, close, base: `http://127.0.0.1:${server.address().port}` };
}

module.exports = { EMULATOR, PROJECT, tempDir, clearFirestore, storeEnv, start };
