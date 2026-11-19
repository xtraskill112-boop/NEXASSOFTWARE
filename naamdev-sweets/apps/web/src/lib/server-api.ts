import "server-only";
import { createApiClient } from "@naamdev/api-client";

const base = process.env.API_INTERNAL_URL ?? "http://localhost:4000";
export const serverApi = createApiClient({ app: "web", baseUrl: base });

/**
 * Public data fetch with short ISR-style caching. Returns null instead of throwing.
 * (Signed-in data is loaded in the browser with the visitor's Firebase token.)
 */
export async function fetchPublic<T>(path: string, revalidate = 60, query?: Record<string, string | number | undefined>): Promise<T | null> {
  try {
    return await serverApi.get<T>(path, { query, next: { revalidate } });
  } catch {
    return null;
  }
}

/** Uncached public fetch (stock-sensitive pages such as product detail). */
export async function fetchFresh<T>(path: string): Promise<T | null> {
  try {
    return await serverApi.get<T>(path, { cache: "no-store" });
  } catch {
    return null;
  }
}
