import { describe, expect, it } from "vitest";
import { evaluateCoupon, describeCoupon, type CouponRule } from "../src";

const base: CouponRule = {
  code: "FESTIVE",
  type: "FIXED",
  scope: "ALL",
  value: 10000,
  minOrderPaise: 50000,
  startsAt: "2026-01-01T00:00:00Z",
  endsAt: "2026-12-31T00:00:00Z",
  usageLimit: 100,
  perUserLimit: 1,
  usedCount: 0,
  firstOrderOnly: false,
  isActive: true,
};
const ctx = {
  now: new Date("2026-06-01T00:00:00Z"),
  lines: [{ productId: "p1", categoryId: "c1", lineTotalPaise: 60000 }],
  subtotalPaise: 60000,
  customerOrderCount: 0,
  customerUsageCount: 0,
  isAuthenticated: true,
};

describe("evaluateCoupon", () => {
  it("accepts a valid fixed coupon", () => {
    const r = evaluateCoupon(base, ctx);
    expect(r.valid && r.discountPaise).toBe(10000);
  });
  it.each([
    [{ isActive: false }, {}, "INACTIVE"],
    [{ startsAt: "2026-07-01T00:00:00Z" }, {}, "NOT_STARTED"],
    [{ endsAt: "2026-05-01T00:00:00Z" }, {}, "EXPIRED"],
    [{ usedCount: 100 }, {}, "USAGE_LIMIT_REACHED"],
    [{}, { customerUsageCount: 1 }, "PER_USER_LIMIT_REACHED"],
    [{ firstOrderOnly: true }, { customerOrderCount: 2 }, "FIRST_ORDER_ONLY"],
    [{ minOrderPaise: 70000 }, {}, "MIN_ORDER_NOT_MET"],
    [{ scope: "PRODUCT", productIds: ["other"] }, {}, "NOT_APPLICABLE"],
    [{}, { isAuthenticated: false }, "LOGIN_REQUIRED"],
  ] as const)("rejects %o / %o with %s", (over, ctxOver, reason) => {
    const r = evaluateCoupon({ ...base, ...over } as CouponRule, { ...ctx, ...ctxOver });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe(reason);
  });
  it("never discounts more than the eligible amount", () => {
    const r = evaluateCoupon({ ...base, value: 999999, minOrderPaise: 0 }, ctx);
    expect(r.valid && r.discountPaise).toBe(60000);
  });
  it("describes coupons in plain language", () => {
    expect(describeCoupon({ type: "PERCENTAGE", value: 20, maxDiscountPaise: 15000, minOrderPaise: 49900 })).toBe(
      "20% off up to ₹150 on orders above ₹499",
    );
  });
});
