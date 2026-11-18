import rateLimit from "express-rate-limit";
import { isTest } from "../config/env";

const common = {
  standardHeaders: "draft-7" as const,
  legacyHeaders: false,
  skip: () => isTest && process.env.RATE_LIMIT_IN_TESTS !== "true",
  message: { error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down and try again shortly." } },
};

/** Note: the memory store is per Cloud Run instance, so limits are per instance rather than global. */
export const globalLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 600 });
export const authLimiter = rateLimit({ ...common, windowMs: 10 * 60_000, limit: 30 });
export const writeLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 120 });
export const uploadLimiter = rateLimit({ ...common, windowMs: 10 * 60_000, limit: 60 });
