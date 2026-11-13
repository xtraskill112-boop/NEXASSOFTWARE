/**
 * Firebase project configuration for the Firebase edition.
 *
 * The web config can be baked in at build time (VITE_FIREBASE_CONFIG='{"apiKey":...}') or
 * entered once in the app's "Connect to Firebase" screen, in which case it is kept in this
 * browser's localStorage. A Firebase web config is not a secret: access is controlled by
 * Firebase Authentication and the Firestore security rules.
 *
 * Project IDs starting with "demo-" use the local Firebase Emulator Suite (Firebase convention).
 */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
}

const KEY = 'stocksense.firebase.config';

function fromBuild(): FirebaseWebConfig | null {
  const raw = import.meta.env.VITE_FIREBASE_CONFIG;
  if (!raw) return null;
  try {
    return validateConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function validateConfig(value: unknown): FirebaseWebConfig {
  const v = (value ?? {}) as Record<string, unknown>;
  const missing = ['apiKey', 'authDomain', 'projectId', 'appId'].filter((k) => typeof v[k] !== 'string' || !(v[k] as string).trim());
  if (missing.length) throw new Error(`Missing ${missing.join(', ')} in the Firebase configuration`);
  const out: FirebaseWebConfig = { apiKey: '', authDomain: '', projectId: '', appId: '' };
  for (const k of ['apiKey', 'authDomain', 'projectId', 'appId', 'storageBucket', 'messagingSenderId', 'measurementId'] as const) {
    if (typeof v[k] === 'string' && (v[k] as string).trim()) out[k] = (v[k] as string).trim();
  }
  return out;
}

/**
 * Accepts the snippet copied from the Firebase console, either as JSON or as the JavaScript
 * `const firebaseConfig = { apiKey: "...", ... };` block.
 */
export function parseConfigSnippet(text: string): FirebaseWebConfig {
  const trimmed = text.trim();
  try {
    return validateConfig(JSON.parse(trimmed));
  } catch {
    /* not JSON - fall back to key: "value" extraction */
  }
  const found: Record<string, string> = {};
  const re = /["']?(\w+)["']?\s*:\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(trimmed))) found[m[1]!] = m[2]!;
  return validateConfig(found);
}

export function getFirebaseConfig(): FirebaseWebConfig | null {
  const built = fromBuild();
  if (built) return built;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? validateConfig(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** True when the configuration was entered in the app (and can therefore be changed there). */
export function isConfigEditable(): boolean {
  return !fromBuild();
}

export function saveFirebaseConfig(config: FirebaseWebConfig) {
  localStorage.setItem(KEY, JSON.stringify(config));
}

export function clearFirebaseConfig() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export const usesEmulator = (config: FirebaseWebConfig) => config.projectId.startsWith('demo-');
