import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

/**
 * Firebase Admin for the server side. Credentials come from the environment:
 * - FIREBASE_SERVICE_ACCOUNT_BASE64: a service-account key (base64 JSON) — used on hosts outside Google
 *   Cloud such as Render; the deploy workflow creates and rotates it.
 * - Google Cloud / GitHub Actions: Application Default Credentials.
 * - Local development and tests: the Firebase emulators (FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST,
 *   FIREBASE_STORAGE_EMULATOR_HOST) with a "demo-" project id — no credentials needed.
 */
export const projectId =
  process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "demo-naamdev";
export const storageBucketName = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;

const globalForFirebase = globalThis as unknown as { __naamdevFirebase?: { app: App; db: Firestore } };

function serviceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) return undefined;
  const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as { project_id: string; client_email: string; private_key: string };
  return cert({ projectId: json.project_id, clientEmail: json.client_email, privateKey: json.private_key });
}

function init() {
  const credential = serviceAccount();
  const app = getApps()[0] ?? initializeApp({ projectId, storageBucket: storageBucketName, ...(credential ? { credential } : {}) });
  const db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  return { app, db };
}

const instance = globalForFirebase.__naamdevFirebase ?? init();
globalForFirebase.__naamdevFirebase = instance;

export const firebaseApp = instance.app;
export const db = instance.db;
export const auth = getAuth(firebaseApp);
export const bucket = () => getStorage(firebaseApp).bucket();
export const usingEmulators = !!process.env.FIRESTORE_EMULATOR_HOST;

export { FieldValue, Timestamp };
