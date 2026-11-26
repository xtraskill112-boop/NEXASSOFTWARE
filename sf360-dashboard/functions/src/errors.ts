import * as logger from "firebase-functions/logger";
import { HttpsError } from "firebase-functions/https";
import { ShadowfaxError } from "./shadowfax/http";

/** Converts anything thrown inside a callable into an HttpsError the web app can show. Never logs secrets. */
export function toHttpsError(err: unknown, context: string): HttpsError {
  if (err instanceof HttpsError) return err;
  if (err instanceof ShadowfaxError) {
    logger.warn(`Shadowfax call failed in ${context}`, { kind: err.kind, status: err.status, message: err.message });
    switch (err.kind) {
      case "auth":
        return new HttpsError("failed-precondition", err.message);
      case "forbidden":
        return new HttpsError("permission-denied", err.message);
      case "throttled":
        return new HttpsError("resource-exhausted", err.message);
      default:
        return new HttpsError("unavailable", err.message);
    }
  }
  logger.error(`Unexpected error in ${context}`, { error: err instanceof Error ? err.message : String(err) });
  return new HttpsError("internal", "Something went wrong. Please try again.");
}

export async function guarded<T>(context: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toHttpsError(err, context);
  }
}
