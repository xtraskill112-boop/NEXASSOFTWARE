import { z } from "zod";
import { normalizeIndianPhone } from "./text";
import {
  ADDRESS_TYPES, BANNER_THEMES, COUPON_SCOPES, COUPON_TYPES, DOCUMENT_TYPES, FOOD_TYPES, HOME_SECTION_TYPES,
  ORDER_STATUSES, STOCK_ADJUST_TYPES, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, VEHICLE_TYPES,
} from "./constants";

const trimmed = (min = 1, max = 200) => z.string().trim().min(min).max(max);

export const phoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizeIndianPhone(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid 10-digit Indian mobile number" });
      return z.NEVER;
    }
    return n;
  });

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(160);
export const pincodeSchema = z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code");
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72)
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/\d/, "Password must contain a number");
export const otpSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit OTP");
export const idSchema = z.string().min(1).max(64);
export const paiseSchema = z.coerce.number().int().min(0).max(100_000_000);

export const identifierSchema = z.string().trim().min(3).max(160);

/** Storefront sign-up form (the account itself is created with Firebase Authentication). */
export const registerSchema = z.object({
  name: trimmed(2, 80),
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema.optional().or(z.literal("").transform(() => undefined)),
  referralCode: z.string().trim().toUpperCase().max(20).optional().or(z.literal("").transform(() => undefined)),
});

export const emailLoginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });

export const passwordLoginSchema = z.object({ identifier: identifierSchema, password: z.string().min(1).max(72) });
export const otpRequestSchema = z.object({
  phone: phoneSchema,
  purpose: z.enum(["LOGIN", "REGISTER", "VERIFY_PHONE", "RESET_PASSWORD"]),
});
export const emailOtpRequestSchema = z.object({ email: emailSchema, purpose: z.enum(["VERIFY_EMAIL", "RESET_PASSWORD"]) });
export const otpLoginSchema = z.object({ phone: phoneSchema, otp: otpSchema });
export const resetPasswordSchema = z.object({ identifier: identifierSchema, otp: otpSchema, password: passwordSchema });
export const changePasswordSchema = z.object({ currentPassword: z.string().max(72).optional(), newPassword: passwordSchema });

export const profileUpdateSchema = z.object({
  name: trimmed(2, 80).optional(),
  email: emailSchema.optional(),
  preferredLanguage: z.enum(["en", "hi"]).optional(),
  dateOfBirth: z.coerce.date().nullable().optional(),
  anniversary: z.coerce.date().nullable().optional(),
  gender: z.enum(["female", "male", "other", "prefer_not"]).nullable().optional(),
  marketingOptIn: z.boolean().optional(),
  smsOptIn: z.boolean().optional(),
  emailOptIn: z.boolean().optional(),
  pushOptIn: z.boolean().optional(),
});

export const addressSchema = z.object({
  type: z.enum(ADDRESS_TYPES).default("HOME"),
  label: z.string().trim().max(40).optional().nullable(),
  fullName: trimmed(2, 80),
  phone: phoneSchema,
  line1: trimmed(3, 160),
  line2: z.string().trim().max(160).optional().nullable(),
  landmark: z.string().trim().max(120).optional().nullable(),
  city: trimmed(2, 60),
  state: trimmed(2, 60),
  pincode: pincodeSchema,
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  instructions: z.string().trim().max(240).optional().nullable(),
  isDefault: z.boolean().optional(),
});

export const cartAddSchema = z.object({ variantId: idSchema, quantity: z.number().int().min(1).max(50).default(1) });
export const cartUpdateSchema = z.object({
  quantity: z.number().int().min(0).max(50).optional(),
  variantId: idSchema.optional(),
  savedForLater: z.boolean().optional(),
});
export const couponApplySchema = z.object({ code: z.string().trim().toUpperCase().min(3).max(30) });

export const checkoutQuoteSchema = z.object({
  addressId: idSchema.optional(),
  couponCode: z.string().trim().toUpperCase().max(30).optional().nullable(),
  redeemPoints: z.number().int().min(0).max(1_000_000).optional(),
});

export const placeOrderSchema = checkoutQuoteSchema.extend({
  addressId: idSchema,
  paymentMethod: z.enum(["ONLINE", "COD"]),
  idempotencyKey: z.string().min(8).max(80),
  customerNote: z.string().trim().max(300).optional().nullable(),
});

export const razorpayVerifySchema = z.object({
  orderId: idSchema,
  razorpay_order_id: z.string().min(5).max(64),
  razorpay_payment_id: z.string().min(5).max(64),
  razorpay_signature: z.string().min(10).max(256),
});

export const cancelOrderSchema = z.object({ reason: trimmed(3, 200) });
export const returnRequestSchema = z.object({ reason: trimmed(3, 120), description: z.string().trim().max(1000).optional() });

export const reviewSchema = z.object({
  productId: idSchema,
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(100).optional(),
  body: z.string().trim().max(2000).optional(),
});

export const ticketCreateSchema = z.object({
  subject: trimmed(4, 140),
  category: z.enum(TICKET_CATEGORIES),
  message: trimmed(10, 4000),
  orderId: idSchema.optional().nullable(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
});
export const contactSchema = z.object({
  name: trimmed(2, 80),
  email: emailSchema,
  phone: z.string().trim().max(20).optional(),
  subject: trimmed(4, 140),
  message: trimmed(10, 4000),
});
export const ticketReplySchema = z.object({ body: trimmed(1, 4000), isInternal: z.boolean().optional() });
export const ticketUpdateSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  assignedToId: idSchema.nullable().optional(),
});

// ── Admin schemas ──
export const variantInputSchema = z.object({
  id: idSchema.optional(),
  label: trimmed(1, 40),
  weightGrams: z.coerce.number().int().min(1).max(100000).optional().nullable(),
  sku: trimmed(2, 60),
  barcode: z.string().trim().max(60).optional().nullable(),
  mrpPaise: paiseSchema.refine((v) => v > 0, "Price must be greater than zero"),
  salePricePaise: paiseSchema.optional().nullable(),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  lowStockThreshold: z.coerce.number().int().min(0).max(100000).default(10),
}).refine((v) => v.salePricePaise == null || v.salePricePaise <= v.mrpPaise, {
  message: "Discounted price cannot exceed the original price",
  path: ["salePricePaise"],
});

export const productInputSchema = z.object({
  name: trimmed(2, 120),
  nameHi: z.string().trim().max(120).optional().nullable(),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens").max(90).optional(),
  shortDescription: trimmed(5, 240),
  shortDescriptionHi: z.string().trim().max(240).optional().nullable(),
  description: trimmed(10, 8000),
  categoryId: idSchema,
  subcategoryId: idSchema.optional().nullable(),
  sku: trimmed(2, 60),
  barcode: z.string().trim().max(60).optional().nullable(),
  hsnCode: z.string().trim().max(12).optional().nullable(),
  ingredients: trimmed(2, 2000),
  allergens: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  nutrition: z.record(z.string(), z.string().max(40)).optional().nullable(),
  manufacturingInfo: z.string().trim().max(1000).optional().nullable(),
  shelfLifeDays: z.coerce.number().int().min(1).max(730),
  storageInstructions: trimmed(3, 500),
  foodType: z.enum(FOOD_TYPES).default("VEG"),
  isFeatured: z.boolean().default(false),
  isBestseller: z.boolean().default(false),
  isNewArrival: z.boolean().default(false),
  isActive: z.boolean().default(true),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  videoUrl: z.string().trim().url().max(500).optional().nullable().or(z.literal("").transform(() => null)),
  gstRate: z.coerce.number().min(0).max(28).optional().nullable(),
  seoTitle: z.string().trim().max(70).optional().nullable(),
  seoDescription: z.string().trim().max(170).optional().nullable(),
  images: z.array(z.object({ url: z.string().min(1).max(600), alt: z.string().max(160).optional().nullable(), publicId: z.string().max(200).optional().nullable() })).max(12).default([]),
  variants: z.array(variantInputSchema).min(1, "Add at least one weight/price variant").max(30),
});

export const categoryInputSchema = z.object({
  name: trimmed(2, 60),
  nameHi: z.string().trim().max(60).optional().nullable(),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/).max(60).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  imageUrl: z.string().max(600).optional().nullable(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  parentId: idSchema.optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
  gstRate: z.coerce.number().min(0).max(28).optional().nullable(),
});

export const couponInputSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, "3–30 letters, numbers, - or _"),
    title: trimmed(3, 80),
    description: z.string().trim().max(300).optional().nullable(),
    type: z.enum(COUPON_TYPES),
    scope: z.enum(COUPON_SCOPES).default("ALL"),
    value: z.coerce.number().int().min(0).max(100_000_000),
    maxDiscountPaise: paiseSchema.optional().nullable(),
    minOrderPaise: paiseSchema.default(0),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    usageLimit: z.coerce.number().int().min(1).optional().nullable(),
    perUserLimit: z.coerce.number().int().min(1).max(1000).default(1),
    firstOrderOnly: z.boolean().default(false),
    isFestival: z.boolean().default(false),
    isPublic: z.boolean().default(true),
    isActive: z.boolean().default(true),
    productIds: z.array(idSchema).default([]),
    categoryIds: z.array(idSchema).default([]),
  })
  .refine((c) => c.endsAt > c.startsAt, { message: "Expiry must be after the start date", path: ["endsAt"] })
  .refine((c) => c.type !== "PERCENTAGE" || (c.value >= 1 && c.value <= 100), { message: "Percentage must be 1–100", path: ["value"] })
  .refine((c) => c.type !== "FIXED" || c.value > 0, { message: "Discount amount is required", path: ["value"] })
  .refine((c) => c.scope !== "PRODUCT" || c.productIds.length > 0, { message: "Select at least one product", path: ["productIds"] })
  .refine((c) => c.scope !== "CATEGORY" || c.categoryIds.length > 0, { message: "Select at least one category", path: ["categoryIds"] });

export const orderStatusUpdateSchema = z.object({ status: z.enum(ORDER_STATUSES), note: z.string().trim().max(300).optional() });
export const orderNoteSchema = z.object({ body: trimmed(1, 1000) });
export const refundCreateSchema = z.object({
  amountPaise: paiseSchema.refine((v) => v > 0, "Refund amount must be positive"),
  reason: trimmed(3, 200),
  method: z.enum(["GATEWAY", "MANUAL"]).optional(),
  reference: z.string().trim().max(120).optional(),
  returnRequestId: idSchema.optional(),
});

export const stockAdjustSchema = z.object({
  variantId: idSchema,
  type: z.enum(STOCK_ADJUST_TYPES),
  quantity: z.coerce.number().int().refine((v) => v !== 0, "Quantity cannot be zero"),
  batchId: idSchema.optional().nullable(),
  reason: trimmed(3, 200),
});
export const batchCreateSchema = z.object({
  variantId: idSchema,
  batchNumber: trimmed(2, 40),
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  manufacturedAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
  costPricePaise: paiseSchema.default(0),
  supplierId: idSchema.optional().nullable(),
}).refine((b) => b.expiresAt > b.manufacturedAt, { message: "Expiry must be after manufacture date", path: ["expiresAt"] });
export const purchaseCreateSchema = z.object({
  supplierId: idSchema.optional().nullable(),
  invoiceNumber: z.string().trim().max(60).optional().nullable(),
  purchasedAt: z.coerce.date().optional(),
  notes: z.string().trim().max(500).optional().nullable(),
  items: z
    .array(
      z.object({
        variantId: idSchema,
        quantity: z.coerce.number().int().min(1),
        costPricePaise: paiseSchema,
        batchNumber: trimmed(2, 40),
        manufacturedAt: z.coerce.date(),
        expiresAt: z.coerce.date(),
      }),
    )
    .min(1),
});
export const supplierSchema = z.object({
  name: trimmed(2, 120),
  contactPerson: z.string().trim().max(80).optional().nullable(),
  phone: z.string().trim().max(20).optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal("").transform(() => null)),
  gstin: z.string().trim().toUpperCase().regex(/^[0-9A-Z]{15}$/, "GSTIN must be 15 characters").optional().nullable().or(z.literal("").transform(() => null)),
  address: z.string().trim().max(300).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const staffCreateSchema = z.object({
  name: trimmed(2, 80),
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  roleId: idSchema,
  designation: trimmed(2, 60),
  employeeCode: z.string().trim().toUpperCase().max(20).optional(),
});
export const staffUpdateSchema = z.object({
  name: trimmed(2, 80).optional(),
  roleId: idSchema.optional(),
  designation: trimmed(2, 60).optional(),
  isActive: z.boolean().optional(),
});
export const roleInputSchema = z.object({
  key: z.string().trim().toUpperCase().regex(/^[A-Z_]{3,40}$/).optional(),
  name: trimmed(2, 60),
  description: z.string().trim().max(200).optional().nullable(),
  permissions: z.array(z.string()).max(100),
});

export const bannerInputSchema = z.object({
  title: trimmed(2, 120),
  titleHi: z.string().trim().max(120).optional().nullable(),
  subtitle: z.string().trim().max(240).optional().nullable(),
  eyebrow: z.string().trim().max(40).optional().nullable(),
  imageUrl: z.string().max(600).optional().nullable(),
  ctaLabel: z.string().trim().max(30).optional().nullable(),
  ctaLink: z.string().trim().max(300).optional().nullable(),
  theme: z.enum(BANNER_THEMES).default("saffron"),
  placement: z.enum(["HERO", "OFFER_STRIP", "PROMO_GRID"]).default("HERO"),
  sortOrder: z.coerce.number().int().min(0).default(0),
  startsAt: z.coerce.date().optional().nullable(),
  endsAt: z.coerce.date().optional().nullable(),
  isActive: z.boolean().default(true),
});
export const homeSectionInputSchema = z.object({
  type: z.enum(HOME_SECTION_TYPES),
  title: trimmed(2, 80),
  titleHi: z.string().trim().max(80).optional().nullable(),
  subtitle: z.string().trim().max(160).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  limit: z.coerce.number().int().min(2).max(30).default(10),
  collectionId: idSchema.optional().nullable(),
  categoryId: idSchema.optional().nullable(),
});
export const collectionInputSchema = z.object({
  name: trimmed(2, 80),
  nameHi: z.string().trim().max(80).optional().nullable(),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/).max(80).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  bannerImageUrl: z.string().max(600).optional().nullable(),
  theme: z.enum(BANNER_THEMES).default("saffron"),
  isFestival: z.boolean().default(false),
  isActive: z.boolean().default(true),
  startsAt: z.coerce.date().optional().nullable(),
  endsAt: z.coerce.date().optional().nullable(),
  productIds: z.array(idSchema).default([]),
});
export const contentPageSchema = z.object({
  title: trimmed(2, 120),
  titleHi: z.string().trim().max(120).optional().nullable(),
  body: z.string().max(50000),
  bodyHi: z.string().max(50000).optional().nullable(),
  seoDescription: z.string().trim().max(170).optional().nullable(),
});
export const faqSchema = z.object({
  question: trimmed(5, 300),
  answer: trimmed(5, 3000),
  questionHi: z.string().trim().max(300).optional().nullable(),
  answerHi: z.string().trim().max(3000).optional().nullable(),
  category: trimmed(2, 40).default("General"),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});
export const deliveryZoneSchema = z.object({
  pincode: pincodeSchema,
  area: trimmed(2, 80),
  city: trimmed(2, 60),
  deliveryFeePaise: paiseSchema.optional().nullable(),
  etaMinutes: z.coerce.number().int().min(10).max(600).default(45),
  isActive: z.boolean().default(true),
});
export const promoNotificationSchema = z.object({
  title: trimmed(3, 80),
  body: trimmed(5, 240),
  link: z.string().trim().max(300).optional().nullable(),
  channels: z.array(z.enum(["IN_APP", "EMAIL", "SMS", "PUSH"])).min(1),
  audience: z.enum(["ALL", "MARKETING_OPT_IN"]).default("MARKETING_OPT_IN"),
});

// ── Delivery partner ──
/** Rider profile sent after the Firebase account is created (email + password). */
export const partnerRegisterSchema = z.object({
  name: trimmed(2, 80),
  phone: phoneSchema,
  city: trimmed(2, 60),
  vehicleType: z.enum(VEHICLE_TYPES),
  vehicleNumber: z.string().trim().toUpperCase().max(20).optional(),
  licenseNumber: z.string().trim().toUpperCase().max(30).optional(),
});
export const partnerProfileSchema = z.object({
  vehicleType: z.enum(VEHICLE_TYPES).optional(),
  vehicleNumber: z.string().trim().toUpperCase().max(20).optional().nullable(),
  licenseNumber: z.string().trim().toUpperCase().max(30).optional().nullable(),
  city: trimmed(2, 60).optional(),
  bankAccountName: z.string().trim().max(80).optional().nullable(),
  bankAccountNumber: z.string().trim().regex(/^\d{9,18}$/, "Enter a valid account number").optional().nullable(),
  bankIfsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid IFSC").optional().nullable(),
  upiId: z.string().trim().regex(/^[\w.-]{2,}@[a-zA-Z]{2,}$/, "Enter a valid UPI ID").optional().nullable(),
  emergencyContact: z.string().trim().max(20).optional().nullable(),
});
export const documentTypeSchema = z.enum(DOCUMENT_TYPES);
export const locationUpdateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional().nullable(),
  speed: z.number().min(0).max(100).optional().nullable(),
  accuracy: z.number().min(0).max(10000).optional().nullable(),
});
export const deliveryOtpSchema = z.object({ otp: z.string().trim().regex(/^\d{4}$/, "Enter the 4-digit delivery OTP"), codCollected: z.boolean().optional() });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const productListQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(60).optional(),
  category: z.string().trim().max(80).optional(),
  collection: z.string().trim().max(80).optional(),
  sort: z.enum(["relevance", "popular", "rating", "price_asc", "price_desc", "newest", "discount"]).default("relevance"),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  inStock: z.coerce.boolean().optional(),
  onOffer: z.coerce.boolean().optional(),
  foodType: z.enum(FOOD_TYPES).optional(),
  flag: z.enum(["bestseller", "new", "featured"]).optional(),
  ids: z.string().max(2000).optional(),
});

export type AddressInput = z.infer<typeof addressSchema>;
export type ProductInput = z.infer<typeof productInputSchema>;
export type VariantInput = z.infer<typeof variantInputSchema>;
export type CouponInput = z.infer<typeof couponInputSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
