import { ApiError, createApiClient } from "@naamdev/api-client";

export const api = createApiClient({ app: "admin" });
export { ApiError };
export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4000";
export const STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL ?? "http://localhost:3000";

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export const rupees = (paise: number | null | undefined) => (paise == null ? "" : String(paise / 100));
export const toPaise = (rupeeStr: string | number) => Math.round(Number(rupeeStr || 0) * 100);
export const dt = (d: string | Date | null | undefined, withTime = true) =>
  d ? new Date(d).toLocaleString("en-IN", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }) : "—";
