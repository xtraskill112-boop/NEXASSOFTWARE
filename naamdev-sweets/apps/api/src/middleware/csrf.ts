import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { randomToken, safeEqual } from "../lib/crypto";
import { AppError } from "../lib/errors";

export const CSRF_COOKIE = "nds_csrf";
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export function issueCsrf(req: Request, res: Response): string {
  const existing = req.cookies?.[CSRF_COOKIE];
  if (typeof existing === "string" && existing.length >= 20) return existing;
  const token = randomToken(24);
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: env.COOKIE_SECURE,
    sameSite: "lax",
    domain: env.COOKIE_DOMAIN || undefined,
    path: "/",
    maxAge: 7 * 86_400_000,
  });
  return token;
}

/**
 * Double-submit CSRF protection for cookie-authenticated requests. Requests that authenticate
 * with a bearer token (native apps, server-to-server) and payment webhooks are exempt.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction) {
  if (SAFE.has(req.method)) return next();
  if (req.path.startsWith("/api/v1/payments/razorpay/webhook")) return next();
  if (/^Bearer\s/i.test(req.get("authorization") ?? "")) return next();
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.get("x-csrf-token");
  if (!cookie || !header || !safeEqual(String(cookie), String(header)))
    return next(new AppError(403, "CSRF_FAILED", "Security check failed. Please refresh the page and try again."));
  next();
}
