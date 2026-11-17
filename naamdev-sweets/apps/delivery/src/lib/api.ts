import { ApiError, createApiClient } from "@naamdev/api-client";

export const api = createApiClient({ app: "delivery" });
export { ApiError };
export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4000";
export const errorMessage = (e: unknown, f = "Something went wrong") => (e instanceof ApiError ? e.message : e instanceof Error && e.message ? e.message : f);
export const time = (d: string | null | undefined) => (d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");
