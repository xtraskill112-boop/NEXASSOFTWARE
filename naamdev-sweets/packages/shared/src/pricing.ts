import { allocateProportionally } from "./money";
import { evaluateCoupon, type CouponContext, type CouponEvaluation, type CouponRule } from "./coupons";
import { redemption } from "./loyalty";
import type { CheckoutSettings, LoyaltySettings } from "./settings";

export interface PricingLineInput {
  variantId: string;
  productId: string;
  categoryId: string;
  quantity: number;
  unitMrpPaise: number;
  unitPricePaise: number;
  gstRate: number;
}

export interface PricingInput {
  lines: PricingLineInput[];
  checkout: CheckoutSettings;
  loyalty: LoyaltySettings;
  /** Delivery fee override for the customer's delivery zone. */
  zoneDeliveryFeePaise?: number | null;
  coupon?: CouponRule | null;
  couponContext?: Omit<CouponContext, "lines" | "subtotalPaise">;
  redeemPoints?: number;
  pointsBalance?: number;
}

export interface PricedLine extends PricingLineInput {
  lineMrpPaise: number;
  lineTotalPaise: number;
  discountPaise: number;
  taxPaise: number;
}

export interface PricingResult {
  lines: PricedLine[];
  itemCount: number;
  mrpTotalPaise: number;
  subtotalPaise: number;
  itemDiscountPaise: number;
  couponDiscountPaise: number;
  coupon: { code: string; evaluation: CouponEvaluation } | null;
  loyaltyDiscountPaise: number;
  pointsRedeemed: number;
  maxRedeemablePoints: number;
  deliveryFeePaise: number;
  deliveryFeeWaived: boolean;
  taxPaise: number;
  taxIncluded: boolean;
  totalPaise: number;
  totalSavingsPaise: number;
  minOrderPaise: number;
  meetsMinimumOrder: boolean;
  amountToMinimumPaise: number;
  freeDeliveryThresholdPaise: number;
  amountToFreeDeliveryPaise: number;
}

/**
 * Authoritative order pricing. The API calls this with server-side prices; the result is what
 * the customer is charged. Clients only ever display these numbers.
 */
export function priceCart(input: PricingInput): PricingResult {
  const { checkout } = input;
  const lines = input.lines.filter((l) => l.quantity > 0);

  const base = lines.map((l) => ({
    ...l,
    lineMrpPaise: l.unitMrpPaise * l.quantity,
    lineTotalPaise: l.unitPricePaise * l.quantity,
  }));
  const mrpTotalPaise = base.reduce((s, l) => s + l.lineMrpPaise, 0);
  const subtotalPaise = base.reduce((s, l) => s + l.lineTotalPaise, 0);
  const itemDiscountPaise = mrpTotalPaise - subtotalPaise;
  const itemCount = base.reduce((s, l) => s + l.quantity, 0);

  // Coupon
  let couponDiscountPaise = 0;
  let freeDeliveryByCoupon = false;
  let couponResult: PricingResult["coupon"] = null;
  const lineCouponDiscount = base.map(() => 0);
  if (input.coupon && lines.length) {
    const evaluation = evaluateCoupon(input.coupon, {
      customerOrderCount: 0,
      customerUsageCount: 0,
      isAuthenticated: true,
      ...input.couponContext,
      lines: base.map((l) => ({ productId: l.productId, categoryId: l.categoryId, lineTotalPaise: l.lineTotalPaise })),
      subtotalPaise,
    });
    couponResult = { code: input.coupon.code, evaluation };
    if (evaluation.valid) {
      couponDiscountPaise = evaluation.discountPaise;
      freeDeliveryByCoupon = evaluation.freeDelivery;
      const weights = base.map((l, i) => (evaluation.eligibleLineIndexes.includes(i) ? l.lineTotalPaise : 0));
      allocateProportionally(couponDiscountPaise, weights).forEach((d, i) => (lineCouponDiscount[i] = d));
    }
  }

  // Loyalty redemption on the post-coupon amount
  const afterCoupon = subtotalPaise - couponDiscountPaise;
  const red = redemption(input.redeemPoints ?? 0, input.pointsBalance ?? 0, afterCoupon, input.loyalty);
  const loyaltyDiscountPaise = Math.min(red.discountPaise, afterCoupon);
  const lineLoyaltyDiscount = allocateProportionally(
    loyaltyDiscountPaise,
    base.map((l, i) => l.lineTotalPaise - lineCouponDiscount[i]!),
  );

  // Delivery
  const qualifiesFreeDelivery = subtotalPaise >= checkout.freeDeliveryThresholdPaise;
  const standardFee = input.zoneDeliveryFeePaise ?? checkout.baseDeliveryFeePaise;
  const deliveryFeeWaived = lines.length > 0 && (qualifiesFreeDelivery || freeDeliveryByCoupon);
  const deliveryFeePaise = lines.length === 0 || deliveryFeeWaived ? 0 : standardFee;

  // GST per line on the discounted (taxable) value
  const priced: PricedLine[] = base.map((l, i) => {
    const discountPaise = lineCouponDiscount[i]! + lineLoyaltyDiscount[i]!;
    const taxable = Math.max(0, l.lineTotalPaise - discountPaise);
    const rate = l.gstRate ?? checkout.defaultGstRate;
    const taxPaise = checkout.pricesIncludeTax
      ? Math.round((taxable * rate) / (100 + rate))
      : Math.round((taxable * rate) / 100);
    return { ...l, gstRate: rate, discountPaise, taxPaise };
  });
  const taxPaise = priced.reduce((s, l) => s + l.taxPaise, 0);

  const totalPaise = Math.max(
    0,
    subtotalPaise - couponDiscountPaise - loyaltyDiscountPaise + deliveryFeePaise + (checkout.pricesIncludeTax ? 0 : taxPaise),
  );

  const waivedFee = deliveryFeeWaived ? standardFee : 0;
  return {
    lines: priced,
    itemCount,
    mrpTotalPaise,
    subtotalPaise,
    itemDiscountPaise,
    couponDiscountPaise,
    coupon: couponResult,
    loyaltyDiscountPaise,
    pointsRedeemed: loyaltyDiscountPaise > 0 ? red.points : 0,
    maxRedeemablePoints: red.maxPoints,
    deliveryFeePaise,
    deliveryFeeWaived,
    taxPaise,
    taxIncluded: checkout.pricesIncludeTax,
    totalPaise,
    totalSavingsPaise: itemDiscountPaise + couponDiscountPaise + loyaltyDiscountPaise + waivedFee,
    minOrderPaise: checkout.minOrderPaise,
    meetsMinimumOrder: subtotalPaise >= checkout.minOrderPaise,
    amountToMinimumPaise: Math.max(0, checkout.minOrderPaise - subtotalPaise),
    freeDeliveryThresholdPaise: checkout.freeDeliveryThresholdPaise,
    amountToFreeDeliveryPaise: Math.max(0, checkout.freeDeliveryThresholdPaise - subtotalPaise),
  };
}
