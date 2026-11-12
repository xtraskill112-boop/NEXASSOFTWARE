import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../config/env';

const tooMany = (message: string) => ({ error: { code: 'TOO_MANY_REQUESTS', message } });

/**
 * Brute-force protection for the login endpoint.
 * Keyed by client IP + submitted email; successful logins do not count against the limit.
 */
export function createLoginRateLimiter() {
  return rateLimit({
    windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MS,
    limit: env.LOGIN_RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req: Request) => {
      const ip = ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'unknown');
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      return `${ip}|${email}`;
    },
    message: tooMany('Too many login attempts. Please wait a few minutes and try again.'),
  });
}

/** General API limiter to protect against abusive clients. */
export function createApiRateLimiter() {
  return rateLimit({
    windowMs: env.API_RATE_LIMIT_WINDOW_MS,
    limit: env.API_RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: tooMany('Too many requests. Please slow down.'),
  });
}
