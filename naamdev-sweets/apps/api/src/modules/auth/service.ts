import { auth as firebaseAuth, C, createUserDoc, db, getDoc, runTx, SUB, syncClaims, type DeliveryPartner, type User, type WithId } from "@naamdev/db";
import { badRequest, conflict, forbidden, unauthorized } from "../../lib/errors";
import { getSetting } from "../../lib/settings";
import { getRole } from "../../middleware/auth";
import type { ClientApp } from "../../types";

export async function assertAppAccess(user: WithId<User> & { role: { key: string; isStaff: boolean } }, app: ClientApp) {
  if (user.status === "SUSPENDED") throw forbidden("Your account is suspended. Please contact support.");
  if (user.status === "DELETED") throw unauthorized("Account not found");
  if (app === "admin") {
    if (!user.role.isStaff) throw forbidden("This console is for NAAMDEV staff only.");
    if (!user.staff?.isActive) throw forbidden("Your staff access has been deactivated.");
  }
  if (app === "delivery" && user.role.key !== "DELIVERY_PARTNER")
    throw forbidden("Please register as a delivery partner to use this app.");
}

/**
 * Creates the NAAMDEV profile for a Firebase account that just signed up on the storefront:
 * customer role, optional referral, and the signup bonus — atomically.
 */
export async function registerCustomer(input: { uid: string; email: string | null; emailVerified: boolean; name: string; phone?: string | null; referralCode?: string }) {
  const loyalty = await getSetting("loyalty");
  const user = await runTx(async (tx) => {
    const userRef = db.collection(C.users).doc(input.uid);
    if ((await tx.get(userRef)).exists) throw conflict("Your account is already set up. Please log in.", undefined, "ACCOUNT_EXISTS");
    let referrer: WithId<User> | null = null;
    if (input.referralCode) {
      const code = (await tx.get(db.collection(C.referralCodes).doc(input.referralCode.toUpperCase()))).data();
      if (code) referrer = await getDoc<User>(db.collection(C.users).doc(code.userId as string), tx);
      if (!referrer || referrer.id === input.uid) throw badRequest("That referral code is not valid.", undefined, "INVALID_REFERRAL");
    }
    const bonus = loyalty.enabled && loyalty.signupBonus > 0 ? loyalty.signupBonus : 0;
    const created = await createUserDoc(tx, input.uid, {
      name: input.name, email: input.email, phone: input.phone ?? null, roleKey: "CUSTOMER", isStaff: false,
      referredById: referrer?.id ?? null, emailVerified: input.emailVerified, initialPoints: bonus,
    });
    if (bonus)
      tx.set(db.collection(C.users).doc(input.uid).collection(SUB.loyalty).doc(), {
        userId: input.uid, type: "SIGNUP_BONUS", points: bonus, balanceAfter: bonus, description: "Welcome bonus — thanks for joining NAAMDEV!", orderId: null, createdAt: new Date(),
      });
    if (referrer)
      tx.set(db.collection(C.referrals).doc(input.uid), {
        referrerId: referrer.id, refereeId: input.uid, refereeName: input.name, code: referrer.referralCode, status: "PENDING",
        rewardPoints: 0, completedAt: null, createdAt: new Date(),
      });
    return created;
  });
  await syncClaims(input.uid, "CUSTOMER", false);
  return user;
}

/**
 * Signs an account out everywhere. ID tokens carry a whole-second issue time, so the cut-off is rounded
 * up: every token issued up to and including this second is rejected (a sign-in in the same second
 * has to be repeated a moment later).
 */
export async function revokeAllSessions(uid: string) {
  await firebaseAuth.revokeRefreshTokens(uid);
  await db.collection(C.users).doc(uid).update({ tokensValidAfter: new Date(Math.ceil(Date.now() / 1000) * 1000), updatedAt: new Date() });
}

export async function currentUserPayload(userId: string) {
  const user = await getDoc<User>(db.collection(C.users).doc(userId));
  if (!user) throw unauthorized("Account not found");
  const role = await getRole(user.roleKey);
  const partner = role?.key === "DELIVERY_PARTNER" ? await getDoc<DeliveryPartner>(db.collection(C.partners).doc(userId)) : null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    emailVerified: !!user.emailVerifiedAt,
    phoneVerified: false,
    avatarUrl: user.avatarUrl,
    preferredLanguage: user.preferredLanguage,
    status: user.status,
    referralCode: user.referralCode,
    loyaltyPoints: user.loyaltyPoints,
    lifetimePoints: user.lifetimePoints,
    hasPassword: true,
    createdAt: user.createdAt,
    deletionRequestedAt: user.deletionRequestedAt,
    role: { key: role?.key ?? user.roleKey, name: role?.name ?? user.roleKey, isStaff: !!role?.isStaff },
    permissions: role?.permissions ?? [],
    profile: user.profile,
    staff: user.staff ? { designation: user.staff.designation, employeeCode: user.staff.employeeCode } : null,
    partner: partner ? { id: partner.id, status: partner.status, isOnline: partner.isOnline, vehicleType: partner.vehicleType, city: partner.city } : null,
  };
}
