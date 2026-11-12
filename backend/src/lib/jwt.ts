import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  ver: number;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign({ role: payload.role, ver: payload.ver }, env.JWT_SECRET, {
    subject: payload.sub,
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    issuer: env.JWT_ISSUER,
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET, {
    issuer: env.JWT_ISSUER,
    algorithms: ['HS256'],
  });
  if (typeof decoded === 'string' || !decoded.sub) throw new Error('Malformed token');
  return { sub: decoded.sub, role: decoded.role as Role, ver: Number(decoded.ver ?? 0) };
}

export function decodeExpiry(token: string): Date | null {
  const decoded = jwt.decode(token);
  if (decoded && typeof decoded === 'object' && decoded.exp) return new Date(decoded.exp * 1000);
  return null;
}
