import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, priceCart, type CouponRule, type PricingLineInput } from "../src";

const checkout = DEFAULT_SETTINGS.checkout;
const loyalty = DEFAULT_SETTINGS.loyalty;

const line = (over: Partial<PricingLineInput> = {}): PricingLineInput => ({
  variantId: "v1",
  productId: "p1",
  categoryId: "c1",
  quantity: 1,
  unitMrpPaise: 60000,
  unitPricePaise: 55000,
  gstRate: 5,
  ...over,
});

const coupon = (over: Partial<CouponRule> = {}): CouponRule => ({
  code: "TEST",
  type: "PERCENTAGE",
  scope: "ALL",
  value: 10,
  maxDiscountPaise: null,
  minOrderPaise: 0,
  startsAt: new Date(Date.now() - 86400000),
  endsAt: new Date(Date.now() + 86400000),
  usageLimit: null,
  perUserLimit: 1,
  usedCount: 0,
  firstOrderOnly: false,
  isActive: true,
  ...over,
});

describe("priceCart", () => {
  it("computes subtotal, MRP savings and delivery fee below threshold", () => {
    const r = priceCart({ lines: [line({ quantity: 1 })], checkout, loyalty });
    expect(r.mrpTotalPaise).toBe(60000);
    expect(r.subtotalPaise).toBe(55000);
    expect(r.itemDiscountPaise).toBe(5000);
    expect(r.deliveryFeePaise).toBe(checkout.baseDeliveryFeePaise);
    expect(r.totalPaise).toBe(55000 + checkout.baseDeliveryFeePaise);
    expect(r.amountToFreeDeliveryPaise).toBe(checkout.freeDeliveryThresholdPaise - 55000);
  });

  it("waives delivery fee above the free-delivery threshold", () => {
    const r = priceCart({ lines: [line({ quantity: 2 })], checkout, loyalty });
    expect(r.subtotalPaise).toBe(110000);
    expect(r.deliveryFeePaise).toBe(0);
    expect(r.deliveryFeeWaived).toBe(true);
  });

  it("uses zone delivery fee override", () => {
    const r = priceCart({ lines: [line()], checkout, loyalty, zoneDeliveryFeePaise: 2900 });
    expect(r.deliveryFeePaise).toBe(2900);
  });

  it("computes inclusive GST without changing the total", () => {
    const r = priceCart({ lines: [line({ unitPricePaise: 105000, unitMrpPaise: 105000 })], checkout, loyalty });
    expect(r.taxIncluded).toBe(true);
    expect(r.taxPaise).toBe(5000); // 105000 * 5/105
    expect(r.totalPaise).toBe(105000);
  });

  it("adds GST when prices exclude tax", () => {
    const r = priceCart({
      lines: [line({ unitPricePaise: 100000, unitMrpPaise: 100000 })],
      checkout: { ...checkout, pricesIncludeTax: false },
      loyalty,
    });
    expect(r.taxPaise).toBe(5000);
    expect(r.totalPaise).toBe(105000);
  });

  it("applies percentage coupons with a max cap", () => {
    const r = priceCart({
      lines: [line({ quantity: 4 })],
      checkout,
      loyalty,
      coupon: coupon({ value: 20, maxDiscountPaise: 15000 }),
    });
    expect(r.couponDiscountPaise).toBe(15000);
    expect(r.totalPaise).toBe(220000 - 15000);
  });

  it("restricts category coupons to eligible lines and allocates discount per line", () => {
    const r = priceCart({
      lines: [line({ variantId: "a", categoryId: "kaju" }), line({ variantId: "b", productId: "p2", categoryId: "laddu", unitPricePaise: 40000, unitMrpPaise: 40000 })],
      checkout,
      loyalty,
      coupon: coupon({ scope: "CATEGORY", categoryIds: ["kaju"], value: 10 }),
    });
    expect(r.couponDiscountPaise).toBe(5500);
    expect(r.lines[0]!.discountPaise).toBe(5500);
    expect(r.lines[1]!.discountPaise).toBe(0);
  });

  it("free-delivery coupon waives the fee", () => {
    const r = priceCart({ lines: [line()], checkout, loyalty, coupon: coupon({ type: "FREE_DELIVERY", value: 0 }) });
    expect(r.deliveryFeePaise).toBe(0);
    expect(r.couponDiscountPaise).toBe(0);
  });

  it("reports invalid coupons without applying them", () => {
    const r = priceCart({ lines: [line()], checkout, loyalty, coupon: coupon({ minOrderPaise: 100000 }) });
    expect(r.coupon?.evaluation.valid).toBe(false);
    expect(r.couponDiscountPaise).toBe(0);
  });

  it("redeems loyalty points within the max percentage", () => {
    // subtotal 220000, max 20% = 44000 paise = 1760 points @ 25 paise
    const r = priceCart({ lines: [line({ quantity: 4 })], checkout, loyalty, redeemPoints: 5000, pointsBalance: 5000 });
    expect(r.pointsRedeemed).toBe(1760);
    expect(r.loyaltyDiscountPaise).toBe(44000);
  });

  it("flags carts below the minimum order", () => {
    const r = priceCart({ lines: [line({ unitPricePaise: 10000, unitMrpPaise: 10000 })], checkout, loyalty });
    expect(r.meetsMinimumOrder).toBe(false);
    expect(r.amountToMinimumPaise).toBe(checkout.minOrderPaise - 10000);
  });

  it("returns zeros for an empty cart", () => {
    const r = priceCart({ lines: [], checkout, loyalty });
    expect(r.totalPaise).toBe(0);
    expect(r.deliveryFeePaise).toBe(0);
  });
});
