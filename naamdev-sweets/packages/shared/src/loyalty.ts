import type { LoyaltySettings } from "./settings";

export const LOYALTY_TIERS = [
  { key: "SILVER", name: "Silver Mithaas", minLifetime: 0, multiplier: 1, color: "#9CA3AF", perks: ["5 points per ₹100", "Birthday surprise"] },
  { key: "GOLD", name: "Gold Mithaas", minLifetime: 1500, multiplier: 1.25, color: "#D4A017", perks: ["1.25× points", "Early festival access", "Priority support"] },
  { key: "PLATINUM", name: "Royal Platinum", minLifetime: 5000, multiplier: 1.5, color: "#7C3AED", perks: ["1.5× points", "Free delivery on all orders", "Exclusive hampers"] },
] as const;

export type LoyaltyTier = (typeof LOYALTY_TIERS)[number];

export function tierFor(lifetimePoints: number): LoyaltyTier {
  let tier: LoyaltyTier = LOYALTY_TIERS[0];
  for (const t of LOYALTY_TIERS) if (lifetimePoints >= t.minLifetime) tier = t;
  return tier;
}

export function nextTier(lifetimePoints: number): { tier: LoyaltyTier; pointsNeeded: number } | null {
  const t = LOYALTY_TIERS.find((x) => x.minLifetime > lifetimePoints);
  return t ? { tier: t, pointsNeeded: t.minLifetime - lifetimePoints } : null;
}

/** Points earned on a delivered order, computed on the amount actually paid (excluding delivery). */
export function pointsEarned(paidAmountPaise: number, lifetimePoints: number, s: LoyaltySettings): number {
  if (!s.enabled || paidAmountPaise <= 0) return 0;
  const base = Math.floor(paidAmountPaise / 10000) * s.pointsPer100;
  return Math.floor(base * tierFor(lifetimePoints).multiplier);
}

/** Clamp a redemption request to the allowed amount. Returns points used and discount in paise. */
export function redemption(
  requestedPoints: number,
  balance: number,
  eligibleAmountPaise: number,
  s: LoyaltySettings,
): { points: number; discountPaise: number; maxPoints: number } {
  if (!s.enabled || s.pointValuePaise <= 0) return { points: 0, discountPaise: 0, maxPoints: 0 };
  const capPaise = Math.floor((eligibleAmountPaise * s.maxRedeemPercent) / 100);
  const maxPoints = Math.max(0, Math.min(balance, Math.floor(capPaise / s.pointValuePaise)));
  if (requestedPoints <= 0 || maxPoints < s.minRedeemPoints) return { points: 0, discountPaise: 0, maxPoints };
  const points = Math.min(Math.floor(requestedPoints), maxPoints);
  if (points < s.minRedeemPoints) return { points: 0, discountPaise: 0, maxPoints };
  return { points, discountPaise: points * s.pointValuePaise, maxPoints };
}
