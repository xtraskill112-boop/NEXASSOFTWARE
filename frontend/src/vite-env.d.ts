/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_SHOW_DEMO_ACCOUNTS?: string;
  readonly VITE_STANDALONE?: string;
  /** App version from frontend/package.json */
  readonly VITE_APP_VERSION?: string;
  /** Firebase web config as JSON, baked into the Firebase edition at build time (optional). */
  readonly VITE_FIREBASE_CONFIG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
