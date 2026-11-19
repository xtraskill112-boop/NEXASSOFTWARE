import type { Transaction } from "firebase-admin/firestore";
import { beforeCommit, C, db, FieldValue, getDoc, runTx, SUB, type LoyaltyTxnType, type Referral, type User, type WithId } from "@naamdev/db";
import { pointsEarned } from "@naamdev/shared";
import { getSetting } from "../../lib/settings";
import { notify } from "../notifications/service";

const pendingPoints = new WeakMap<Transaction, Map<string, { points: number; lifetime: number }>>();

/** Points balance as read inside the current transaction; updated in place as points change. */
export type PointsHolder = { id: string; loyaltyPoints: number; lifetimePoints: number };

/**
 * Adds (positive) or deducts (negative) points and records a ledger entry. Write-only: the caller reads
 * the user inside the same transaction first (Firestore transactions read before they write).
 */
export function awardPoints(tx: Transaction, user: PointsHolder, points: number, type: LoyaltyTxnType, description: string, orderId?: string | null) {
  if (points === 0) return;
  if (points < 0 && user.loyaltyPoints < -points) throw new Error("INSUFFICIENT_POINTS");
  const countsTowardTier = points > 0 && type !== "REVERSAL";
  user.loyaltyPoints += points;
  if (countsTowardTier) user.lifetimePoints += points;
  const userRef = db.collection(C.users).doc(user.id);
  // Several awards to one user in a transaction become a single update.
  let byUser = pendingPoints.get(tx);
  if (!byUser) pendingPoints.set(tx, (byUser = new Map()));
  const sum = byUser.get(user.id) ?? { points: 0, lifetime: 0 };
  sum.points += points;
  if (countsTowardTier) sum.lifetime += points;
  byUser.set(user.id, sum);
  beforeCommit(tx, `points:${user.id}`, () =>
    tx.update(userRef, {
      loyaltyPoints: FieldValue.increment(sum.points),
      ...(sum.lifetime ? { lifetimePoints: FieldValue.increment(sum.lifetime) } : {}),
      updatedAt: new Date(),
    }),
  );
  tx.set(userRef.collection(SUB.loyalty).doc(), {
    userId: user.id, type, points, balanceAfter: user.loyaltyPoints, description, orderId: orderId ?? null, createdAt: new Date(),
  });
}

/** Standalone award (own transaction), e.g. staff adjustments. */
export async function awardPointsNow(userId: string, points: number, type: LoyaltyTxnType, description: string) {
  await runTx(async (tx) => {
    const user = await getDoc<User>(db.collection(C.users).doc(userId), tx);
    if (!user) throw new Error("USER_NOT_FOUND");
    awardPoints(tx, user, points, type, description);
  });
}

/** Reads needed by onOrderDelivered (do these before any write in the transaction). */
export async function readDeliveryRewards(tx: Transaction, userId: string) {
  const [user, referral] = await Promise.all([
    getDoc<User>(db.collection(C.users).doc(userId), tx),
    getDoc<Referral>(db.collection(C.referrals).doc(userId), tx),
  ]);
  const referrer = referral && referral.status === "PENDING" ? await getDoc<User>(db.collection(C.users).doc(referral.referrerId), tx) : null;
  return { user, referral, referrer };
}

/** Called when an order is delivered: earns points and completes a pending referral. Write-only. */
export async function onOrderDelivered(
  tx: Transaction,
  order: { id: string; userId: string; orderNumber: string; totalPaise: number; deliveryFeePaise: number; pointsEarned: number },
  pre: Awaited<ReturnType<typeof readDeliveryRewards>>,
  /** Side effects to run after the transaction commits (transactions may retry). */
  after: Array<() => void>,
) {
  const s = await getSetting("loyalty");
  if (!s.enabled || !pre.user) return;
  const user = pre.user as WithId<User>;
  const earned = pointsEarned(order.totalPaise - order.deliveryFeePaise, user.lifetimePoints, s);
  if (earned > 0) {
    awardPoints(tx, user, earned, "EARN", `Earned on order ${order.orderNumber}`, order.id);
    order.pointsEarned = earned; // saved with the order by the caller
  }
  const { referral, referrer } = pre;
  if (referral && referral.status === "PENDING" && referrer) {
    tx.update(db.collection(C.referrals).doc(referral.id), { status: "COMPLETED", completedAt: new Date(), rewardPoints: s.referrerBonus });
    if (s.referrerBonus > 0) awardPoints(tx, referrer, s.referrerBonus, "REFERRAL_BONUS", "Referral reward — your friend placed their first order!");
    if (s.refereeBonus > 0) awardPoints(tx, user, s.refereeBonus, "REFERRAL_BONUS", "Referral welcome reward");
    after.push(() => notify({ userId: referral.referrerId, type: "ACCOUNT", title: "You earned referral points! 🎁", body: `Your friend completed their first order. ${s.referrerBonus} Mithaas points added.`, link: "/account/rewards", template: "referral.completed", channels: ["IN_APP", "PUSH"] }));
  }
}
