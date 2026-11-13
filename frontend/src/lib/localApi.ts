/**
 * In-browser API bridge.
 * In the normal build this module is empty (the app talks to the real backend over HTTP).
 * In the standalone build (`vite build --mode standalone`) Vite aliases `@local-api` to
 * src/standalone/localApi.ts, which runs the REST API inside the browser.
 */
export interface LocalApi {
  fetch: (method: string, path: string, query: Record<string, string>, body: unknown, token: string | null) => Promise<Response>;
  resetData: () => void;
}

export const localApi: LocalApi | null = null;
