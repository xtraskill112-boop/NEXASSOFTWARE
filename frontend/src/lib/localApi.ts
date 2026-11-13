/**
 * In-browser API bridge.
 * In the normal build this module is empty (the app talks to the real backend over HTTP).
 * In the standalone build (`vite build --mode standalone`) Vite aliases `@local-api` to
 * src/standalone/localApi.ts, which runs the REST API inside the browser.
 */
export interface LocalApi {
  /** 'standalone' = offline demo in browser storage, 'firebase' = Firebase Auth + Cloud Firestore */
  kind: 'standalone' | 'firebase';
  fetch: (method: string, path: string, query: Record<string, string>, body: unknown, token: string | null) => Promise<Response>;
  /** Restores the demo dataset (standalone edition only). */
  resetData?: () => void;
}

export const localApi: LocalApi | null = null;
