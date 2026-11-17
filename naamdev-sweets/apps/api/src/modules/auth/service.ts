import type { Request, Response } from "express";
import { hash, verify } from "@node-rs/argon2";
import jwt from "jsonwebtoken";
import { prisma, type Prisma } from "@naamdev/db";
import { normalizeIndianPhone } from "@naamdev/shared";
import { env } from "../../config/env";
import { randomToken, referralCode, sha256 } from "../../lib/crypto";
import { badRequest, conflict, forbidden, unauthorized } from "../../lib/errors";
import { clientIp } from "../../lib/http";
import { getSetting } from "../../lib/settings";
import { cookieOptions, permissionsForRole, sessionCookieName } from "../../middleware/auth";
import type { ClientApp } from "../../types";
import { mergeGuestCart } from "../cart/service";
import { awardPoints } from "../loyalty/service";

export const hashPassword = (pw: string) => hash(pw, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
export const verifyPassword = (hashStr: string, pw: string) => verify(hashStr, pw).catch(() => false);

// Constant-time-ish dummy verification to avoid account enumeration via timing.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword("not-a-real-password-1"));

export function findUserByIdentifier(identifier: string) {
  const id = identifier.trim().toLowerCase();
  if (id.includes("@")) return prisma.user.findUnique({ where: { email: id }, include: { role: true } });
  const phone = normalizeIndianPhone(id);
  if (!phone) return Promise.resolve(null);
  return prisma.user.findUnique({ where: { phone }, include: { role: true } });
}

export async function assertAppAccess(user: { id: string; status: string; role: { key: string; isStaff: boolean } }, app: ClientApp) {
  if (user.status === "SUSPENDED") throw forbidden("Your account is suspended. Please contact support.");
  if (user.status === "DELETED") throw unauthorized("Account not found");
  if (app === "admin") {
    if (!user.role.isStaff) throw forbidden("This console is for NAAMDEV staff only.");
    const staff = await prisma.staffProfile.findUnique({ where: { userId: user.id } });
    if (!staff?.isActive) throw forbidden("Your staff access has been deactivated.");
  }
  if (app === "delivery" && user.role.key !== "DELIVERY_PARTNER")
    throw forbidden("Please register as a delivery partner to use this app.");
}

export async function createSession(req: Request, res: Response, userId: string) {
  const token = randomToken(32);
  const ttl = env.SESSION_TTL_DAYS * 86_400_000;
  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      app: req.clientApp,
      userAgent: req.get("user-agent")?.slice(0, 250),
      ip: clientIp(req),
      expiresAt: new Date(Date.now() + ttl),
    },
  });
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  res.cookie(sessionCookieName(req.clientApp), token, cookieOptions(ttl));
  if (req.clientApp === "web") await mergeGuestCart(req, res, userId);
  return token;
}

export async function destroySession(req: Request, res: Response) {
  if (req.auth?.session) await prisma.session.update({ where: { id: req.auth.session.id }, data: { revokedAt: new Date() } });
  res.clearCookie(sessionCookieName(req.clientApp), cookieOptions());
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string) {
  await prisma.session.updateMany({ where: { userId, revokedAt: null, id: exceptSessionId ? { not: exceptSessionId } : undefined }, data: { revokedAt: new Date() } });
}

export function signRegistrationToken(phone: string) {
  return jwt.sign({ phone, purpose: "register" }, env.JWT_SECRET, { expiresIn: "20m", audience: "registration" });
}

export function verifyRegistrationToken(token: string): string {
  try {
    const p = jwt.verify(token, env.JWT_SECRET, { audience: "registration" }) as { phone: string; purpose: string };
    if (p.purpose !== "register") throw new Error();
    return p.phone;
  } catch {
    throw badRequest("Your verification has expired. Please verify your mobile number again.", undefined, "REGISTRATION_EXPIRED");
  }
}

export async function registerCustomer(input: {
  name: string;
  phone: string;
  email?: string;
  password?: string;
  referralCode?: string;
  roleKey?: "CUSTOMER" | "DELIVERY_PARTNER";
  tx?: Prisma.TransactionClient;
}) {
  const db = input.tx ?? prisma;
  if (await db.user.findUnique({ where: { phone: input.phone } })) throw conflict("An account with this mobile number already exists. Please log in.", undefined, "ACCOUNT_EXISTS");
  if (input.email && (await db.user.findUnique({ where: { email: input.email } }))) throw conflict("This email is already registered.", undefined, "EMAIL_EXISTS");
  const role = await db.role.findUniqueOrThrow({ where: { key: input.roleKey ?? "CUSTOMER" } });
  const referrer = input.referralCode ? await db.user.findUnique({ where: { referralCode: input.referralCode.toUpperCase() } }) : null;
  if (input.referralCode && !referrer) throw badRequest("That referral code is not valid.", undefined, "INVALID_REFERRAL");

  let code = referralCode();
  while (await db.user.findUnique({ where: { referralCode: code } })) code = referralCode();

  const user = await db.user.create({
    data: {
      name: input.name,
      phone: input.phone,
      email: input.email || null,
      passwordHash: input.password ? await hashPassword(input.password) : null,
      phoneVerifiedAt: new Date(),
      roleId: role.id,
      referralCode: code,
      referredById: referrer?.id,
      profile: { create: {} },
    },
    include: { role: true },
  });
  if (referrer && role.key === "CUSTOMER")
    await db.referral.create({ data: { referrerId: referrer.id, refereeId: user.id, code: referrer.referralCode } });

  if (role.key === "CUSTOMER") {
    const loyalty = await getSetting("loyalty");
    if (loyalty.enabled && loyalty.signupBonus > 0)
      await awardPoints(db, user.id, loyalty.signupBonus, "SIGNUP_BONUS", "Welcome bonus — thanks for joining NAAMDEV!");
  }
  return user;
}

export async function loginWithPassword(identifier: string, password: string) {
  const user = await findUserByIdentifier(identifier);
  if (!user || !user.passwordHash) {
    await verifyPassword(await getDummyHash(), password);
    throw unauthorized("Incorrect email/mobile or password");
  }
  if (!(await verifyPassword(user.passwordHash, password))) throw unauthorized("Incorrect email/mobile or password");
  return user;
}

export async function currentUserPayload(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      role: true,
      profile: true,
      staffProfile: true,
      deliveryPartner: { select: { id: true, status: true, isOnline: true, vehicleType: true, city: true } },
    },
  });
  const permissions = await permissionsForRole(user.roleId);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    emailVerified: !!user.emailVerifiedAt,
    phoneVerified: !!user.phoneVerifiedAt,
    avatarUrl: user.avatarUrl,
    preferredLanguage: user.preferredLanguage,
    status: user.status,
    referralCode: user.referralCode,
    loyaltyPoints: user.loyaltyPoints,
    lifetimePoints: user.lifetimePoints,
    hasPassword: !!user.passwordHash,
    createdAt: user.createdAt,
    deletionRequestedAt: user.deletionRequestedAt,
    role: { key: user.role.key, name: user.role.name, isStaff: user.role.isStaff },
    permissions,
    profile: user.profile,
    staff: user.staffProfile ? { designation: user.staffProfile.designation, employeeCode: user.staffProfile.employeeCode } : null,
    partner: user.deliveryPartner,
  };
}
