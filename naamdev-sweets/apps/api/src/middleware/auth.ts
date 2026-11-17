import type { NextFunction, Request, Response } from "express";
import { prisma } from "@naamdev/db";
import { hasPermission, type PermissionKey } from "@naamdev/shared";
import { env } from "../config/env";
import { sha256 } from "../lib/crypto";
import { forbidden, unauthorized } from "../lib/errors";
import type { ClientApp } from "../types";

export const CLIENT_APPS: ClientApp[] = ["web", "admin", "delivery"];
export const sessionCookieName = (app: ClientApp) => `nds_sid_${app}`;

export function cookieOptions(maxAgeMs?: number) {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "lax" as const,
    domain: env.COOKIE_DOMAIN || undefined,
    path: "/",
    maxAge: maxAgeMs,
  };
}

const permissionCache = new Map<string, { perms: string[]; at: number }>();
export async function permissionsForRole(roleId: string): Promise<string[]> {
  const hit = permissionCache.get(roleId);
  if (hit && Date.now() - hit.at < 30_000) return hit.perms;
  const rows = await prisma.rolePermission.findMany({ where: { roleId }, include: { permission: true } });
  const perms = rows.map((r) => r.permission.key);
  permissionCache.set(roleId, { perms, at: Date.now() });
  return perms;
}
export const clearPermissionCache = () => permissionCache.clear();

/** Resolves the client app from a header set by each frontend (proxied through Next.js rewrites). */
export function resolveClientApp(req: Request, _res: Response, next: NextFunction) {
  const h = String(req.get("x-nds-app") ?? "web").toLowerCase();
  req.clientApp = (CLIENT_APPS as string[]).includes(h) ? (h as ClientApp) : "web";
  next();
}

/** Optional authentication: attaches req.auth when a valid session cookie or bearer token is present. */
export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  const bearer = req.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const token = bearer ?? req.cookies?.[sessionCookieName(req.clientApp)];
  if (!token || token.length > 200) return next();
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { role: true, deliveryPartner: { select: { id: true } } } } },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return next();
  if (session.user.status === "SUSPENDED" || session.user.status === "DELETED") return next();
  if (session.app !== req.clientApp && !bearer) return next();
  const { deliveryPartner, ...user } = session.user;
  req.auth = {
    user,
    session,
    permissions: await permissionsForRole(user.roleId),
    roleKey: user.role.key,
    partnerId: deliveryPartner?.id ?? null,
  };
  // Touch the session at most every 5 minutes.
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000)
    prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
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
