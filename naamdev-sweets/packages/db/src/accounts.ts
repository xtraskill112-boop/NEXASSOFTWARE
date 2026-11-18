import { randomBytes } from "node:crypto";
import type { Transaction } from "firebase-admin/firestore";
import { auth, db } from "./firebase";
import { userSearchText } from "./derived";
import type { StaffProfile, User } from "./types";

export const COLLECTIONS = {
  roles: "roles",
  users: "users",
  referralCodes: "referralCodes",
} as const;

const referralCode = () => "ND" + randomBytes(4).toString("hex").toUpperCase().slice(0, 6);

export const DEFAULT_PROFILE: User["profile"] = {
  dateOfBirth: null,
  anniversary: null,
  gender: null,
  marketingOptIn: true,
  smsOptIn: true,
  emailOptIn: true,
  pushOptIn: true,
};

/** Custom claims let Firestore security rules recognise staff and partners without a database read. */
export async function syncClaims(uid: string, roleKey: string, isStaff: boolean) {
  await auth.setCustomUserClaims(uid, { role: roleKey, staff: isStaff, partner: roleKey === "DELIVERY_PARTNER" });
}

/**
 * Creates the users/{uid} document (and reserves a unique referral code) inside a transaction.
 * The Firebase Auth account must already exist.
 */
export async function createUserDoc(
  tx: Transaction,
  uid: string,
  input: {
    name: string; email: string | null; phone?: string | null; roleKey: string; isStaff: boolean; staff?: StaffProfile | null;
    referredById?: string | null; emailVerified?: boolean;
    /** Opening points balance (e.g. a signup bonus); the caller records the matching ledger entry. */
    initialPoints?: number;
  },
): Promise<User> {
  let code = referralCode();
  for (let i = 0; i < 5; i++) {
    const exists = await tx.get(db.collection(COLLECTIONS.referralCodes).doc(code));
    if (!exists.exists) break;
    code = referralCode();
  }
  const now = new Date();
  const user: User = {
    name: input.name,
    email: input.email,
    phone: input.phone ?? null,
    emailVerifiedAt: input.emailVerified ? now : null,
    status: "ACTIVE",
    roleKey: input.roleKey,
    isStaff: input.isStaff,
    avatarUrl: null,
    preferredLanguage: "en",
    referralCode: code,
    referredById: input.referredById ?? null,
    loyaltyPoints: input.initialPoints ?? 0,
    lifetimePoints: input.initialPoints ?? 0,
    lastLoginAt: null,
    deletionRequestedAt: null,
    tokensValidAfter: null,
    profile: { ...DEFAULT_PROFILE },
    staff: input.staff ?? null,
    searchText: userSearchText(input),
    createdAt: now,
    updatedAt: now,
  };
  tx.set(db.collection(COLLECTIONS.users).doc(uid), user);
  tx.set(db.collection(COLLECTIONS.referralCodes).doc(code), { userId: uid });
  return user;
}

/** Returns the uid of an Auth account with this email, creating it (or resetting its password) when asked. */
export async function ensureAuthUser(email: string, password: string, displayName: string, opts: { resetPassword?: boolean } = {}) {
  try {
    const existing = await auth.getUserByEmail(email);
    if (opts.resetPassword) await auth.updateUser(existing.uid, { password, displayName });
    return existing.uid;
  } catch (err) {
    if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
    const created = await auth.createUser({ email, password, displayName, emailVerified: true });
    return created.uid;
  }
}
