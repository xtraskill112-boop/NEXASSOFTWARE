import { initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { browserLocalPersistence, connectAuthEmulator, getAuth, setPersistence, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";

export const REGION = "asia-south1";
/** SF360 has its own Firestore database (see functions/src/config.ts). */
export const DATABASE_ID = "sf360";

let app: FirebaseApp;
export let auth: Auth;
export let db: Firestore;
export let functions: Functions;

/**
 * Local dev reads VITE_FIREBASE_* from web/.env.local.
 * On Firebase Hosting the config is served at /__/firebase/init.json, so nothing is baked into the build.
 */
async function loadConfig(): Promise<FirebaseOptions> {
  const env = import.meta.env;
  if (env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID) {
    return {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      appId: env.VITE_FIREBASE_APP_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    };
  }
  const res = await fetch("/__/firebase/init.json");
  if (!res.ok) throw new Error("Firebase config not found. Deploy to Firebase Hosting or set VITE_FIREBASE_* in web/.env.local.");
  return (await res.json()) as FirebaseOptions;
}

export async function initFirebase(): Promise<void> {
  const config = await loadConfig();
  app = initializeApp(config);
  auth = getAuth(app);
  db = initializeFirestore(
    app,
    { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) },
    DATABASE_ID,
  );
  functions = getFunctions(app, REGION);
  // Only for local end-to-end tests (e2e/run.sh); never set for a real deploy. Must run before any auth call.
  if (import.meta.env.VITE_USE_EMULATORS === "true") {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  }
  await setPersistence(auth, browserLocalPersistence);
}
