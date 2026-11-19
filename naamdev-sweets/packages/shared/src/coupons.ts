export type CouponType = "PERCENTAGE" | "FIXED" | "FREE_DELIVERY";
export type CouponScope = "ALL" | "CATEGORY" | "PRODUCT";

export interface CouponRule {
  code: string;
  type: CouponType;
  scope: CouponScope;
  /** Percentage (1–100) for PERCENTAGE; paise for FIXED; ignored for FREE_DELIVERY. */
  value: number;
  maxDiscountPaise?: number | null;
  minOrderPaise: number;
  startsAt: Date | string;
  endsAt: Date | string;
  usageLimit?: number | null;
  perUserLimit: number;
  usedCount: number;
  firstOrderOnly: boolean;
  isActive: boolean;
  productIds?: string[];
  categoryIds?: string[];
}

export interface CouponLine {
  productId: string;
  categoryId: string;
  lineTotalPaise: number;
}

export interface CouponContext {
  now?: Date;
  lines: CouponLine[];
  subtotalPaise: number;
  /** Non-cancelled orders previously placed by this customer. */
  customerOrderCount: number;
  /** Times this customer already used this coupon. */
  customerUsageCount: number;
  isAuthenticated: boolean;
}

export type CouponFailure =
  | "INACTIVE"
  | "NOT_STARTED"
  | "EXPIRED"
  | "USAGE_LIMIT_REACHED"
  | "PER_USER_LIMIT_REACHED"
  | "FIRST_ORDER_ONLY"
  | "MIN_ORDER_NOT_MET"
  | "NOT_APPLICABLE"
  | "LOGIN_REQUIRED";

export type CouponEvaluation =
  | { valid: true; discountPaise: number; freeDelivery: boolean; eligibleSubtotalPaise: number; eligibleLineIndexes: number[] }
  | { valid: false; reason: CouponFailure; message: string };

const fmt = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;

export function evaluateCoupon(coupon: CouponRule, ctx: CouponContext): CouponEvaluation {
  const now = ctx.now ?? new Date();
  const fail = (reason: CouponFailure, message: string): CouponEvaluation => ({ valid: false, reason, message });

  if (!coupon.isActive) return fail("INACTIVE", "This coupon is no longer active.");
  if (now < new Date(coupon.startsAt)) return fail("NOT_STARTED", "This coupon is not live yet.");
  if (now > new Date(coupon.endsAt)) return fail("EXPIRED", "This coupon has expired.");
  if (!ctx.isAuthenticated) return fail("LOGIN_REQUIRED", "Please log in to apply coupons.");
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit)
    return fail("USAGE_LIMIT_REACHED", "This coupon has reached its usage limit.");
  if (ctx.customerUsageCount >= coupon.perUserLimit)
    return fail("PER_USER_LIMIT_REACHED", "You have already used this coupon.");
  if (coupon.firstOrderOnly && ctx.customerOrderCount > 0)
    return fail("FIRST_ORDER_ONLY", "This coupon is valid on your first order only.");

  const eligibleLineIndexes = ctx.lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => {
      if (coupon.scope === "ALL") return true;
      if (coupon.scope === "PRODUCT") return (coupon.productIds ?? []).includes(l.productId);
      return (coupon.categoryIds ?? []).includes(l.categoryId);
    })
    .map(({ i }) => i);
  const eligibleSubtotalPaise = eligibleLineIndexes.reduce((s, i) => s + ctx.lines[i]!.lineTotalPaise, 0);

  if (eligibleSubtotalPaise <= 0) return fail("NOT_APPLICABLE", "This coupon doesn't apply to items in your cart.");
  const thresholdBase = coupon.scope === "ALL" ? ctx.subtotalPaise : eligibleSubtotalPaise;
  if (thresholdBase < coupon.minOrderPaise)
    return fail("MIN_ORDER_NOT_MET", `Add items worth ${fmt(coupon.minOrderPaise - thresholdBase)} more to use this coupon.`);

  let discountPaise = 0;
  if (coupon.type === "PERCENTAGE") {
    const pct = Math.min(100, Math.max(0, coupon.value));
    discountPaise = Math.floor((eligibleSubtotalPaise * pct) / 100);
    if (coupon.maxDiscountPaise != null) discountPaise = Math.min(discountPaise, coupon.maxDiscountPaise);
  } else if (coupon.type === "FIXED") {
    discountPaise = Math.min(coupon.value, eligibleSubtotalPaise);
  }

  return {
    valid: true,
    discountPaise,
    freeDelivery: coupon.type === "FREE_DELIVERY",
    eligibleSubtotalPaise,
    eligibleLineIndexes,
  };
}

export function describeCoupon(c: Pick<CouponRule, "type" | "value" | "maxDiscountPaise" | "minOrderPaise">): string {
  const min = c.minOrderPaise > 0 ? ` on orders above ${fmt(c.minOrderPaise)}` : "";
  if (c.type === "PERCENTAGE")
    return `${c.value}% off${c.maxDiscountPaise ? ` up to ${fmt(c.maxDiscountPaise)}` : ""}${min}`;
  if (c.type === "FIXED") return `Flat ${fmt(c.value)} off${min}`;
  return `Free delivery${min}`;
}
