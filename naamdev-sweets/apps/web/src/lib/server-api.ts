import "server-only";
import { createApiClient } from "@naamdev/api-client";
import { cookies } from "next/headers";

const base = process.env.API_INTERNAL_URL ?? "http://localhost:4000";
export const serverApi = createApiClient({ app: "web", baseUrl: base });

/** Public data fetch with short ISR-style caching. Returns null instead of throwing. */
export async function fetchPublic<T>(path: string, revalidate = 60, query?: Record<string, string | number | undefined>): Promise<T | null> {
  try {
    return await serverApi.get<T>(path, { query, next: { revalidate } });
  } catch {
    return null;
  }
}

/** Fetch on behalf of the signed-in visitor (forwards cookies, never cached). */
export async function fetchAsUser<T>(path: string): Promise<T | null> {
  try {
    const jar = await cookies();
    return await serverApi.get<T>(path, { cookie: jar.toString(), cache: "no-store" });
  } catch {
    return null;
  }
}
