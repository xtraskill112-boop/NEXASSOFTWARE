import { HttpsError, type CallableRequest } from "firebase-functions/https";
import { ALLOWED_EMAILS } from "./config";

export function parseAllowedEmails(raw: string): Set<string> {
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.includes("@")),
  );
}

export function isAllowed(email: string | undefined | null, emailVerified: unknown, allowed: Set<string>): boolean {
  if (!email) return false;
  return emailVerified === true && allowed.has(email.toLowerCase());
}

/**
 * Every callable starts with this. Rejects anyone who is not signed in, not on the allow-list,
 * or has not verified their e-mail address. Returns the caller's e-mail.
 */
export function assertOwner(request: CallableRequest<unknown>): string {
  const token = request.auth?.token;
  if (!request.auth || !token) {
    throw new HttpsError("unauthenticated", "Please log in first.");
  }
  const email = (token.email ?? "").toLowerCase();
  const allowed = parseAllowedEmails(ALLOWED_EMAILS.value());
  if (!email || !allowed.has(email)) {
    throw new HttpsError("permission-denied", "This account is not allowed to use the dashboard.");
  }
  if (token.email_verified !== true) {
    throw new HttpsError("failed-precondition", "Please verify your e-mail address first.");
  }
  return email;
}
