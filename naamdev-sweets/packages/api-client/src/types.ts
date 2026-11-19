import type { OrderStatus, PricingResult } from "@naamdev/shared";

export interface Variant {
  id: string; label: string; weightGrams: number | null; sku: string; mrpPaise: number; salePricePaise: number | null; pricePaise: number;
  discountPct: number; available: number; inStock: boolean; lowStock: boolean; isDefault: boolean;
}

export interface ProductCard {
  id: string; slug: string; name: string; nameHi: string | null; shortDescription: string; shortDescriptionHi: string | null;
  foodType: "VEG" | "EGG" | "NON_VEG"; isBestseller: boolean; isNewArrival: boolean; isFeatured: boolean; avgRating: number; reviewCount: number;
  soldCount: number; image: string | null; hoverImage: string | null; category: { id: string; slug: string; name: string; nameHi: string | null };
  variants: Variant[]; defaultVariantId: string | null; minPricePaise: number; maxDiscountPct: number; inStock: boolean; tags: string[];
}

export interface ProductDetail extends ProductCard {
  description: string; ingredients: string; allergens: string[]; nutrition: Record<string, string> | null; manufacturingInfo: string | null;
  shelfLifeDays: number; storageInstructions: string; videoUrl: string | null; sku: string; seoTitle: string | null; seoDescription: string | null;
  images: { url: string; alt: string; width: number | null; height: number | null }[]; subcategory: { slug: string; name: string } | null;
  isWishlisted: boolean; reviews: { id: string; rating: number; title: string | null; body: string | null; createdAt: string; author: string }[];
  ratingCounts: { rating: number; count: number }[]; related: ProductCard[]; boughtTogether: ProductCard[];
}

export interface Category { id: string; slug: string; name: string; nameHi: string | null; description?: string | null; imageUrl: string | null; accentColor: string | null; parentId?: string | null; productCount?: number }

export interface Banner { id: string; title: string; titleHi: string | null; subtitle: string | null; eyebrow: string | null; imageUrl: string | null; ctaLabel: string | null; ctaLink: string | null; theme: string; placement: string }

export interface PublicCoupon { code: string; title: string; description: string | null; type: string; value: number; maxDiscountPaise: number | null; minOrderPaise: number; endsAt: string; isFestival: boolean; summary?: string; firstOrderOnly?: boolean }

export interface HomeSection {
  id: string; type: string; title: string; titleHi: string | null; subtitle: string | null;
  products?: ProductCard[]; categories?: Category[]; coupons?: PublicCoupon[]; clientSide?: boolean;
  collection?: { slug: string; name: string; description: string | null; theme: string; bannerImageUrl: string | null };
}

export interface HomeFeed {
  announcement: { active: boolean; text: string; textHi?: string; link?: string } | null;
  banners: { hero: Banner[]; strip: Banner[]; promo: Banner[] };
  freeDeliveryThresholdPaise: number;
  sections: HomeSection[];
}

export interface ProductList {
  items: ProductCard[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
  facets: { categories: { slug: string; name: string; count: number }[]; priceRange: { min: number; max: number } | null };
  suggestion: string | null;
}

export interface CartItem {
  id: string; quantity: number; savedForLater: boolean; lineTotalPaise: number; issues: string[];
  variant: { id: string; label: string; sku: string; mrpPaise: number; salePricePaise: number | null; pricePaise: number; available: number; inStock: boolean };
  product: { id: string; slug: string; name: string; nameHi: string | null; image: string | null; foodType: "VEG" | "EGG" | "NON_VEG"; category: { slug: string; name: string }; variants: { id: string; label: string; pricePaise: number; mrpPaise: number; inStock: boolean }[] };
}

export interface CartView { id: string | null; items: CartItem[]; savedItems: CartItem[]; couponCode: string | null; pricing: PricingResult; canCheckout: boolean; blockers: string[] }

export interface Address {
  id: string; type: "HOME" | "OFFICE" | "OTHER"; label: string | null; fullName: string; phone: string; line1: string; line2: string | null; landmark: string | null;
  city: string; state: string; pincode: string; lat: number | null; lng: number | null; instructions: string | null; isDefault: boolean; serviceable?: boolean;
}

export interface Quote extends CartView {
  address: Address | null; zone: { area: string; etaMinutes: number; deliveryFeePaise: number | null } | null; serviceable: boolean; etaMinutes: number;
  paymentOptions: { online: { available: boolean; reason: string | null }; upi: { available: boolean; reason: string | null }; cod: { available: boolean; reason: string | null } };
}

export interface OrderItem { id: string; productId: string; productSlug: string; variantId: string; name: string; variantLabel: string; sku: string; imageUrl: string | null; unitMrpPaise: number; unitPricePaise: number; quantity: number; lineTotalPaise: number; discountPaise: number; gstRate: number; taxPaise: number }

export interface Order {
  id: string; orderNumber: string; invoiceNumber: string | null; status: OrderStatus; paymentMethod: "ONLINE" | "UPI" | "COD"; paymentStatus: string;
  placedAt: string; confirmedAt: string | null; dispatchedAt: string | null; deliveredAt: string | null; cancelledAt: string | null; cancelReason: string | null;
  estimatedDeliveryAt: string | null; reservationExpiresAt: string | null; customerName: string; customerPhone: string; customerEmail: string | null;
  address: { type: string; label: string | null; fullName: string; phone: string; line1: string; line2: string | null; landmark: string | null; city: string; state: string; pincode: string };
  deliveryInstructions: string | null; customerNote: string | null; deliveryOtp: string | null;
  totals: { mrpTotalPaise: number; subtotalPaise: number; itemDiscountPaise: number; couponDiscountPaise: number; loyaltyDiscountPaise: number; deliveryFeePaise: number; taxPaise: number; totalPaise: number; refundedPaise: number };
  couponCode: string | null; pointsRedeemed: number; pointsEarned: number; items: OrderItem[];
  timeline: { status: OrderStatus; at: string; note: string | null }[];
  payments: { id: string; method: string; provider: string; status: string; amountPaise: number; methodDetail: string | null; gatewayPaymentId: string | null; capturedAt: string | null; createdAt: string }[];
  refunds: { id: string; amountPaise: number; status: string; method: string; reason: string; createdAt: string; processedAt: string | null }[];
  returnRequests: { id: string; reason: string; status: string; resolutionNote: string | null; createdAt: string }[];
  store: { name: string; phone: string; address: string; lat: number; lng: number } | null;
  deliveryPartner: { name: string; phone: string | null; avatarUrl: string | null; vehicleType: string; vehicleNumber: string | null; rating: number; assignmentStatus: string } | null;
}

export interface OrderActions { canCancel: boolean; canPay: boolean; canReturn: boolean; canReview: boolean; reviewedProductIds: string[] }

export interface Tracking {
  orderId: string; status: OrderStatus; estimatedDeliveryAt: string | null; pickup: { lat: number; lng: number } | null; drop: { lat: number; lng: number } | null;
  partnerLocation: { lat: number; lng: number; heading: number | null; at: string } | null; path: { lat: number; lng: number }[]; etaMinutes: number | null; assignmentStatus: string | null;
}

export interface PaymentSession { keyId: string; razorpayOrderId: string; amountPaise: number; currency: string; orderId: string; orderNumber: string; expiresAt: string | null; prefill: { name: string; email?: string; contact?: string } }

export interface Me {
  id: string; name: string; email: string | null; phone: string | null; emailVerified: boolean; phoneVerified: boolean; avatarUrl: string | null;
  preferredLanguage: string; status: string; referralCode: string; loyaltyPoints: number; lifetimePoints: number; hasPassword: boolean; createdAt: string;
  deletionRequestedAt: string | null; role: { key: string; name: string; isStaff: boolean }; permissions: string[];
  profile: { dateOfBirth: string | null; anniversary: string | null; gender: string | null; marketingOptIn: boolean; smsOptIn: boolean; emailOptIn: boolean; pushOptIn: boolean } | null;
  staff: { designation: string; employeeCode: string } | null;
  partner: { id: string; status: string; isOnline: boolean; vehicleType: string; city: string } | null;
}

export interface AppNotification { id: string; type: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string }

export interface PublicSettings {
  checkout: { minOrderPaise: number; freeDeliveryThresholdPaise: number; baseDeliveryFeePaise: number; codEnabled: boolean; codMaxOrderPaise: number; pricesIncludeTax: boolean; maxQtyPerItem: number; preparationMinutes: number };
  loyalty: { enabled: boolean; pointsPer100: number; pointValuePaise: number; maxRedeemPercent: number; minRedeemPoints: number; signupBonus: number; referrerBonus: number; refereeBonus: number };
  storeProfile: { name: string; legalName: string; gstin: string; fssaiLicense: string; phone: string; whatsapp: string; email: string; supportHours: string; address: string };
  social: { instagram?: string; facebook?: string; youtube?: string; x?: string; whatsapp?: string };
  returns: { enabled: boolean; windowHours: number };
  announcement: { active: boolean; text: string; textHi?: string; link?: string };
  store: { name: string; city: string; lat: number; lng: number; openingTime: string; closingTime: string } | null;
  payments: { razorpayEnabled: boolean; razorpayKeyId: string | null };
  integrations: { push: boolean; sms: boolean; email: boolean; otpDevEcho: boolean };
}

export interface Paged<T> { items: T[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }

/** Direct UPI payment to the shop's UPI ID; confirmed by staff, never automatically. */
export interface UpiSession {
  status: "AWAITING_PAYMENT" | "VERIFYING" | "PAID" | "CLOSED";
  vpa: string;
  payeeName: string;
  amountPaise: number;
  note: string;
  link: string | null;
  qrSvg: string | null;
  expiresAt: string | null;
  reference: string | null;
  lastRejection: string | null;
}
