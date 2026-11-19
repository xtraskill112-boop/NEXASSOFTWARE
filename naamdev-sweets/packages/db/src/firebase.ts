import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

/**
 * Firebase Admin for the server side. Credentials come from the environment:
 * - Google Cloud (Cloud Run): Application Default Credentials of the service account.
 * - Local development and tests: the Firebase emulators (FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST,
 *   FIREBASE_STORAGE_EMULATOR_HOST) with a "demo-" project id — no credentials needed.
 */
export const projectId =
  process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "demo-naamdev";
export const storageBucketName = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;

const globalForFirebase = globalThis as unknown as { __naamdevFirebase?: { app: App; db: Firestore } };

function init() {
  const app = getApps()[0] ?? initializeApp({ projectId, storageBucket: storageBucketName });
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
