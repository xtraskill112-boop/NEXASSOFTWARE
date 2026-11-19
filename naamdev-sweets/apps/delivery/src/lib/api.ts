import { ApiError, createApiClient } from "@naamdev/api-client";
import { currentIdToken } from "@naamdev/api-client/firebase";

export const api = createApiClient({ app: "delivery", getToken: currentIdToken });
export { ApiError };
export const errorMessage = (e: unknown, f = "Something went wrong") => (e instanceof ApiError ? e.message : e instanceof Error && e.message ? e.message : f);
export const time = (d: string | null | undefined) => (d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");
