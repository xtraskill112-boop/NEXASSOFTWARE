import type { NextFunction, Request, Response } from "express";
import { auth as firebaseAuth, C, db, getDoc, type Role, type User } from "@naamdev/db";
import { hasPermission, type PermissionKey } from "@naamdev/shared";
import { forbidden, unauthorized } from "../lib/errors";
import { logger } from "../lib/logger";
import type { ClientApp } from "../types";

export const CLIENT_APPS: ClientApp[] = ["web", "admin", "delivery"];

const roleCache = new Map<string, { role: Role & { id: string }; at: number }>();

export async function getRole(key: string): Promise<(Role & { id: string }) | null> {
  const hit = roleCache.get(key);
  if (hit && Date.now() - hit.at < 30_000) return hit.role;
  const role = await getDoc<Role>(db.collection(C.roles).doc(key));
  if (role) roleCache.set(key, { role, at: Date.now() });
  return role;
}
export const clearPermissionCache = () => roleCache.clear();

/** Resolves the client app from a header set by each frontend. */
export function resolveClientApp(req: Request, _res: Response, next: NextFunction) {
  const h = String(req.get("x-nds-app") ?? "web").toLowerCase();
  req.clientApp = (CLIENT_APPS as string[]).includes(h) ? (h as ClientApp) : "web";
  next();
}

/**
 * Optional authentication. Browsers sign in with Firebase Authentication (email + password) and send
 * the Firebase ID token as `Authorization: Bearer <token>`. Valid tokens attach `req.auth` (users with a
 * NAAMDEV profile) or `req.firebaseUser` (signed up but profile not created yet).
 */
export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  const token = req.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || token.length > 4096) return next();
  let decoded;
  try {
    decoded = await firebaseAuth.verifyIdToken(token);
  } catch (err) {
    logger.debug({ err: (err as Error).message }, "invalid ID token");
    return next();
  }
  const user = await getDoc<User>(db.collection(C.users).doc(decoded.uid));
  if (!user) {
    req.firebaseUser = { uid: decoded.uid, email: decoded.email ?? null, emailVerified: !!decoded.email_verified, name: (decoded.name as string | undefined) ?? null };
    return next();
  }
  if (user.status === "SUSPENDED" || user.status === "DELETED") return next();
  // "Sign out everywhere" / password reset by staff: reject tokens issued before that moment.
  if (user.tokensValidAfter && decoded.iat * 1000 < user.tokensValidAfter.getTime()) return next();
  const role = await getRole(user.roleKey);
  if (!role) return next();
  req.auth = {
    user: { ...user, role },
    permissions: role.permissions,
    roleKey: role.key,
    partnerId: role.key === "DELIVERY_PARTNER" ? user.id : null,
    token: { email: decoded.email, email_verified: decoded.email_verified, auth_time: decoded.auth_time, iat: decoded.iat },
  };
  // Mirror email (changed via Firebase) and its verification into the profile.
  const emailChanged = !!decoded.email && decoded.email !== user.email;
  if (emailChanged || (decoded.email_verified && !user.emailVerifiedAt)) {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (emailChanged) {
      patch.email = decoded.email;
      patch.searchText = [user.name, decoded.email, user.phone ?? ""].join(" ").toLowerCase();
      req.auth.user.email = decoded.email!;
    }
    patch.emailVerifiedAt = decoded.email_verified ? (user.emailVerifiedAt ?? new Date()) : null;
    db.collection(C.users).doc(user.id).update(patch).catch(() => undefined);
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(unauthorized());
  next();
}

export function requireStaff(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(unauthorized());
  if (!req.auth.user.role.isStaff) return next(forbidden("Staff access only"));
  next();
}

export function requirePermission(...perms: PermissionKey[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    if (!req.auth.user.role.isStaff || !hasPermission(req.auth.permissions, perms)) return next(forbidden());
    next();
  };
}

export function requireAnyPermission(...perms: PermissionKey[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    if (!req.auth.user.role.isStaff || !perms.some((p) => req.auth!.permissions.includes(p))) return next(forbidden());
    next();
  };
}

export function requirePartner(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(unauthorized());
  if (req.auth.roleKey !== "DELIVERY_PARTNER" || !req.auth.partnerId) return next(forbidden("Delivery partner access only"));
  next();
}
