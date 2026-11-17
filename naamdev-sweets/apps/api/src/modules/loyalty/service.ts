import { prisma, type LoyaltyTxnType, type Tx } from "@naamdev/db";
import { pointsEarned } from "@naamdev/shared";
import { getSetting } from "../../lib/settings";
import { notify } from "../notifications/service";

type Db = Tx | typeof prisma;

/** Adds (positive) or deducts (negative) points atomically and records a ledger entry. */
export async function awardPoints(db: Db, userId: string, points: number, type: LoyaltyTxnType, description: string, orderId?: string) {
  if (points === 0) return null;
  const countsTowardTier = points > 0 && type !== "REVERSAL";
  const updated =
    points < 0
      ? await db.user.updateMany({ where: { id: userId, loyaltyPoints: { gte: -points } }, data: { loyaltyPoints: { increment: points } } })
      : await db.user.updateMany({
          where: { id: userId },
          data: { loyaltyPoints: { increment: points }, ...(countsTowardTier ? { lifetimePoints: { increment: points } } : {}) },
        });
  if (updated.count !== 1) throw new Error("INSUFFICIENT_POINTS");
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { loyaltyPoints: true } });
  return db.loyaltyTransaction.create({ data: { userId, type, points, balanceAfter: user.loyaltyPoints, description, orderId } });
}

/** Called when an order is delivered: earns points and completes a pending referral. */
export async function onOrderDelivered(tx: Tx, order: { id: string; userId: string; orderNumber: string; totalPaise: number; deliveryFeePaise: number }) {
  const s = await getSetting("loyalty");
  if (!s.enabled) return;
  const user = await tx.user.findUniqueOrThrow({ where: { id: order.userId }, select: { lifetimePoints: true } });
  const earned = pointsEarned(order.totalPaise - order.deliveryFeePaise, user.lifetimePoints, s);
  if (earned > 0) {
    await awardPoints(tx, order.userId, earned, "EARN", `Earned on order ${order.orderNumber}`, order.id);
    await tx.order.update({ where: { id: order.id }, data: { pointsEarned: earned } });
  }

  const referral = await tx.referral.findUnique({ where: { refereeId: order.userId } });
  if (referral && referral.status === "PENDING") {
    await tx.referral.update({ where: { id: referral.id }, data: { status: "COMPLETED", completedAt: new Date(), rewardPoints: s.referrerBonus } });
    if (s.referrerBonus > 0) await awardPoints(tx, referral.referrerId, s.referrerBonus, "REFERRAL_BONUS", "Referral reward — your friend placed their first order!");
    if (s.refereeBonus > 0) await awardPoints(tx, order.userId, s.refereeBonus, "REFERRAL_BONUS", "Referral welcome reward");
    notify({ userId: referral.referrerId, type: "ACCOUNT", title: "You earned referral points! 🎁", body: `Your friend completed their first order. ${s.referrerBonus} Mithaas points added.`, link: "/account/rewards", template: "referral.completed", channels: ["IN_APP", "PUSH"] });
  }
}
