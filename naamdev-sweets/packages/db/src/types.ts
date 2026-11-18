/**
 * Firestore document shapes. Field names match the previous relational model so API responses are
 * unchanged. Money is integer paise. Dates are JS Dates in code (stored as Firestore Timestamps).
 */
import type { OrderStatus, PaymentMethod } from "@naamdev/shared";

export type { OrderStatus, PaymentMethod };
export type UserStatus = "ACTIVE" | "SUSPENDED" | "DELETION_REQUESTED" | "DELETED";
export type AddressType = "HOME" | "OFFICE" | "OTHER";
export type FoodType = "VEG" | "EGG" | "NON_VEG";
export type OrderPaymentStatus = "PENDING" | "PAID" | "FAILED" | "COD_PENDING" | "COD_COLLECTED" | "PARTIALLY_REFUNDED" | "REFUNDED";
export type PaymentTxnStatus = "CREATED" | "AUTHORIZED" | "CAPTURED" | "FAILED" | "REFUNDED";
export type RefundStatus = "PENDING" | "PROCESSING" | "PROCESSED" | "FAILED";
export type RefundMethod = "GATEWAY" | "MANUAL";
export type ReturnStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "COMPLETED";
export type ActorType = "CUSTOMER" | "STAFF" | "PARTNER" | "SYSTEM";
export type CouponType = "PERCENTAGE" | "FIXED" | "FREE_DELIVERY";
export type CouponScope = "ALL" | "CATEGORY" | "PRODUCT";
export type StockTxnType = "STOCK_IN" | "RESERVED" | "RELEASED" | "SOLD" | "ADJUSTMENT" | "DAMAGED" | "EXPIRED" | "RETURNED";
export type BatchStatus = "ACTIVE" | "DEPLETED" | "EXPIRED" | "DISCARDED";
export type PartnerStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
export type VehicleType = "BICYCLE" | "MOTORCYCLE" | "SCOOTER" | "EV_SCOOTER" | "CAR";
export type DocumentType = "AADHAAR" | "PAN" | "DRIVING_LICENSE" | "VEHICLE_RC" | "PROFILE_PHOTO" | "BANK_PROOF";
export type DocumentStatus = "PENDING" | "VERIFIED" | "REJECTED";
export type AssignmentStatus = "OFFERED" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "AT_STORE" | "PICKED_UP" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";
export type EarningType = "DELIVERY_FEE" | "INCENTIVE" | "TIP" | "ADJUSTMENT";
export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";
export type NotificationType = "ORDER" | "PAYMENT" | "DELIVERY" | "PROMOTION" | "COUPON" | "INVENTORY" | "SUPPORT" | "ACCOUNT" | "SYSTEM";
export type NotificationChannel = "IN_APP" | "EMAIL" | "SMS" | "PUSH";
export type DeliveryResult = "SENT" | "FAILED" | "SKIPPED";
export type TicketCategory = "ORDER" | "REFUND" | "CANCELLATION" | "PAYMENT" | "DELIVERY" | "PRODUCT_QUALITY" | "ACCOUNT" | "FEEDBACK" | "OTHER";
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TicketStatus = "OPEN" | "IN_PROGRESS" | "AWAITING_CUSTOMER" | "RESOLVED" | "CLOSED";
export type LoyaltyTxnType = "EARN" | "REDEEM" | "SIGNUP_BONUS" | "REFERRAL_BONUS" | "ADJUSTMENT" | "REVERSAL";
export type ReferralStatus = "PENDING" | "COMPLETED" | "CANCELLED";
export type BannerPlacement = "HERO" | "OFFER_STRIP" | "PROMO_GRID";
export type HomeSectionType =
  | "CATEGORY_GRID" | "BESTSELLERS" | "POPULAR" | "NEW_ARRIVALS" | "TRENDING" | "RECOMMENDED" | "FAVOURITES"
  | "GIFT_HAMPERS" | "FESTIVAL_COLLECTION" | "RECENTLY_VIEWED" | "FREQUENTLY_PURCHASED" | "OFFERS";

/** roles/{key} */
export interface Role {
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isStaff: boolean;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  dateOfBirth: Date | null;
  anniversary: Date | null;
  gender: string | null;
  marketingOptIn: boolean;
  smsOptIn: boolean;
  emailOptIn: boolean;
  pushOptIn: boolean;
}

export interface StaffProfile {
  employeeCode: string;
  designation: string;
  storeId: string | null;
  isActive: boolean;
  joinedAt: Date;
  notes: string | null;
}

/** users/{uid} — uid is the Firebase Auth uid. */
export interface User {
  name: string;
  email: string | null;
  phone: string | null;
  emailVerifiedAt: Date | null;
  status: UserStatus;
  roleKey: string;
  isStaff: boolean;
  avatarUrl: string | null;
  preferredLanguage: string;
  referralCode: string;
  referredById: string | null;
  loyaltyPoints: number;
  lifetimePoints: number;
  lastLoginAt: Date | null;
  deletionRequestedAt: Date | null;
  /** ID tokens issued before this moment are rejected ("sign out everywhere", password reset by staff). */
  tokensValidAfter: Date | null;
  profile: UserProfile;
  staff: StaffProfile | null;
  /** Lowercased name/email/phone for console search. */
  searchText: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Store {
  name: string;
  code: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  lat: number;
  lng: number;
  phone: string;
  email: string | null;
  openingTime: string;
  closingTime: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** users/{uid}/addresses/{id} */
export interface Address {
  userId: string;
  type: AddressType;
  label: string | null;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  lat: number | null;
  lng: number | null;
  instructions: string | null;
  isDefault: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** zones/{pincode} */
export interface DeliveryZone {
  pincode: string;
  area: string;
  city: string;
  deliveryFeePaise: number | null;
  etaMinutes: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  name: string;
  nameHi: string | null;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  accentColor: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  gstRate: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductImage {
  id: string;
  url: string;
  alt: string | null;
  publicId: string | null;
  width: number | null;
  height: number | null;
  sortOrder: number;
}

export interface ProductVariant {
  id: string;
  label: string;
  weightGrams: number | null;
  sku: string;
  barcode: string | null;
  mrpPaise: number;
  salePricePaise: number | null;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
}

/** products/{id} — images and variants are embedded. */
export interface Product {
  name: string;
  nameHi: string | null;
  slug: string;
  shortDescription: string;
  shortDescriptionHi: string | null;
  description: string;
  categoryId: string;
  subcategoryId: string | null;
  sku: string;
  barcode: string | null;
  hsnCode: string | null;
  ingredients: string;
  allergens: string[];
  nutrition: Record<string, unknown> | null;
  manufacturingInfo: string | null;
  shelfLifeDays: number;
  storageInstructions: string;
  foodType: FoodType;
  isFeatured: boolean;
  isBestseller: boolean;
  isNewArrival: boolean;
  isActive: boolean;
  tags: string[];
  videoUrl: string | null;
  gstRate: number | null;
  avgRating: number;
  reviewCount: number;
  soldCount: number;
  viewCount: number;
  seoTitle: string | null;
  seoDescription: string | null;
  deletedAt: Date | null;
  images: ProductImage[];
  variants: ProductVariant[];
  /** Lowest active selling price, for price filters and sorting. */
  minPricePaise: number;
  /** Highest active MRP discount in percent, for "on offer" filters. */
  maxDiscountPercent: number;
  /** Lowercased name, Hindi name, tags, ingredients — used by search. */
  searchText: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Collection {
  name: string;
  nameHi: string | null;
  slug: string;
  description: string | null;
  bannerImageUrl: string | null;
  theme: string;
  isFestival: boolean;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  products: { productId: string; sortOrder: number }[];
  createdAt: Date;
  updatedAt: Date;
}

/** inventory/{variantId} — one stock document per variant (also the variant → product index). */
export interface Inventory {
  variantId: string;
  productId: string;
  available: number;
  reserved: number;
  lowStockThreshold: number;
  lastRestockedAt: Date | null;
  lowStockAlertedAt: Date | null;
  updatedAt: Date;
}

export interface Supplier {
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PurchaseItem {
  id: string;
  variantId: string;
  productId: string;
  quantity: number;
  costPricePaise: number;
  batchId: string | null;
}

export interface Purchase {
  purchaseNumber: string;
  supplierId: string | null;
  invoiceNumber: string | null;
  purchasedAt: Date;
  totalPaise: number;
  notes: string | null;
  createdById: string | null;
  items: PurchaseItem[];
  createdAt: Date;
}

export interface InventoryBatch {
  variantId: string;
  productId: string;
  batchNumber: string;
  supplierId: string | null;
  manufacturedAt: Date;
  expiresAt: Date;
  quantity: number;
  remaining: number;
  costPricePaise: number;
  status: BatchStatus;
  expiryAlertedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StockTransaction {
  variantId: string;
  productId: string;
  batchId: string | null;
  type: StockTxnType;
  quantity: number;
  balanceAfter: number;
  reason: string | null;
  orderId: string | null;
  createdById: string | null;
  createdAt: Date;
}

export interface CartItem {
  id: string;
  variantId: string;
  productId: string;
  quantity: number;
  savedForLater: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** carts/{u_<uid> | g_<token>} */
export interface Cart {
  userId: string | null;
  guestToken: string | null;
  couponCode: string | null;
  items: CartItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItemAllocation {
  batchId: string;
  quantity: number;
  releasedAt: Date | null;
}

export interface OrderItem {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  sku: string;
  imageUrl: string | null;
  unitMrpPaise: number;
  unitPricePaise: number;
  quantity: number;
  lineTotalPaise: number;
  discountPaise: number;
  gstRate: number;
  taxPaise: number;
  categoryId: string;
  allocations: OrderItemAllocation[];
}

/** orders/{id} — items, status history and staff notes are embedded. */
export interface Order {
  orderNumber: string;
  userId: string;
  storeId: string | null;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: OrderPaymentStatus;
  mrpTotalPaise: number;
  subtotalPaise: number;
  itemDiscountPaise: number;
  couponDiscountPaise: number;
  loyaltyDiscountPaise: number;
  deliveryFeePaise: number;
  taxPaise: number;
  totalPaise: number;
  refundedPaise: number;
  couponId: string | null;
  couponCode: string | null;
  pointsRedeemed: number;
  pointsEarned: number;
  addressSnapshot: Record<string, unknown>;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  deliveryPincode: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryInstructions: string | null;
  customerNote: string | null;
  deliveryOtp: string | null;
  estimatedDeliveryAt: Date | null;
  reservationExpiresAt: Date | null;
  idempotencyKey: string;
  invoiceNumber: string | null;
  cancelReason: string | null;
  cancelledBy: ActorType | null;
  items: OrderItem[];
  history: (OrderStatusHistory & { id: string })[];
  notes: (OrderNote & { id: string })[];
  /** Product ids in this order (for "verified buyer" checks and reports). */
  productIds: string[];
  /** Current delivery partner (uid) while an assignment is active. */
  partnerId: string | null;
  /** Lowercased order number, customer name, phone and email for console search. */
  searchText: string;
  placedAt: Date;
  confirmedAt: Date | null;
  dispatchedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderStatusHistory {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note: string | null;
  actorType: ActorType;
  changedById: string | null;
  changedByName: string | null;
  createdAt: Date;
}

export interface OrderNote {
  authorId: string;
  authorName: string;
  body: string;
  createdAt: Date;
}

export interface Payment {
  orderId: string;
  userId: string;
  method: PaymentMethod;
  provider: string;
  status: PaymentTxnStatus;
  amountPaise: number;
  currency: string;
  gatewayOrderId: string | null;
  gatewayPaymentId: string | null;
  methodDetail: string | null;
  failureReason: string | null;
  raw: unknown;
  capturedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Refund {
  orderId: string;
  paymentId: string | null;
  amountPaise: number;
  reason: string;
  status: RefundStatus;
  method: RefundMethod;
  gatewayRefundId: string | null;
  reference: string | null;
  failureReason: string | null;
  initiatedById: string | null;
  processedAt: Date | null;
  returnRequestId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReturnRequest {
  orderId: string;
  userId: string;
  reason: string;
  description: string | null;
  images: string[];
  status: ReturnStatus;
  resolutionNote: string | null;
  refundId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookEvent {
  provider: string;
  eventId: string;
  type: string;
  payload: unknown;
  processedAt: Date | null;
  error: string | null;
  createdAt: Date;
}

/** coupons/{CODE} */
export interface Coupon {
  code: string;
  title: string;
  description: string | null;
  type: CouponType;
  scope: CouponScope;
  value: number;
  maxDiscountPaise: number | null;
  minOrderPaise: number;
  startsAt: Date;
  endsAt: Date;
  usageLimit: number | null;
  perUserLimit: number;
  usedCount: number;
  firstOrderOnly: boolean;
  isFestival: boolean;
  isPublic: boolean;
  isActive: boolean;
  productIds: string[];
  categoryIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** couponUsages/{orderId} */
export interface CouponUsage {
  couponId: string;
  couponCode: string;
  userId: string;
  orderId: string;
  discountPaise: number;
  createdAt: Date;
}

/** partners/{uid} */
export interface DeliveryPartner {
  userId: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: PartnerStatus;
  vehicleType: VehicleType;
  vehicleNumber: string | null;
  licenseNumber: string | null;
  city: string;
  isOnline: boolean;
  currentLat: number | null;
  currentLng: number | null;
  lastLocationAt: Date | null;
  rating: number;
  totalDeliveries: number;
  bankAccountName: string | null;
  bankAccountEncrypted: string | null;
  bankAccountLast4: string | null;
  bankIfsc: string | null;
  upiId: string | null;
  emergencyContact: string | null;
  approvedAt: Date | null;
  approvedById: string | null;
  statusReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** partners/{uid}/documents/{type} */
export interface PartnerDocument {
  partnerId: string;
  type: DocumentType;
  storageKey: string;
  mimeType: string;
  status: DocumentStatus;
  rejectionReason: string | null;
  uploadedAt: Date;
  reviewedAt: Date | null;
}

export interface DeliveryAssignment {
  orderId: string;
  orderNumber: string;
  partnerId: string;
  status: AssignmentStatus;
  distanceKm: number | null;
  earningPaise: number;
  offeredAt: Date;
  offerExpiresAt: Date | null;
  respondedAt: Date | null;
  arrivedAtStoreAt: Date | null;
  pickedUpAt: Date | null;
  outForDeliveryAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** orders/{orderId}/tracking/{id} */
export interface TrackingPoint {
  assignmentId: string;
  partnerId: string;
  orderId: string;
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
  recordedAt: Date;
}

export interface PartnerEarning {
  partnerId: string;
  assignmentId: string | null;
  orderId: string | null;
  type: EarningType;
  amountPaise: number;
  description: string;
  isSettled: boolean;
  settledAt: Date | null;
  createdAt: Date;
}

/** reviews/{userId}_{productId} */
export interface Review {
  productId: string;
  userId: string;
  userName: string;
  orderId: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  status: ReviewStatus;
  moderatedById: string | null;
  moderatedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** users/{uid}/notifications/{id} */
export interface Notification {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  data: Record<string, unknown> | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationDelivery {
  userId: string | null;
  channel: NotificationChannel;
  template: string;
  recipient: string;
  status: DeliveryResult;
  provider: string;
  providerMessageId: string | null;
  error: string | null;
  createdAt: Date;
}

/** users/{uid}/devices/{sha256(token)} */
export interface DeviceToken {
  userId: string;
  token: string;
  platform: string;
  createdAt: Date;
  lastUsedAt: Date;
}

export interface SupportTicket {
  ticketNumber: string;
  userId: string | null;
  customerName: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  orderId: string | null;
  orderNumber: string | null;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  subject: string;
  assignedToId: string | null;
  assignedToName: string | null;
  lastActivityAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** tickets/{id}/messages/{id} */
export interface TicketMessage {
  authorId: string | null;
  authorName: string | null;
  authorType: ActorType;
  body: string;
  isInternal: boolean;
  createdAt: Date;
}

export interface Faq {
  question: string;
  answer: string;
  questionHi: string | null;
  answerHi: string | null;
  category: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** users/{uid}/loyalty/{id} */
export interface LoyaltyTransaction {
  userId: string;
  type: LoyaltyTxnType;
  points: number;
  balanceAfter: number;
  orderId: string | null;
  description: string;
  createdAt: Date;
}

/** referrals/{refereeId} */
export interface Referral {
  referrerId: string;
  refereeId: string;
  refereeName: string;
  code: string;
  status: ReferralStatus;
  rewardPoints: number;
  completedAt: Date | null;
  createdAt: Date;
}

export interface Banner {
  title: string;
  titleHi: string | null;
  subtitle: string | null;
  eyebrow: string | null;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaLink: string | null;
  theme: string;
  placement: BannerPlacement;
  sortOrder: number;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface HomeSection {
  type: HomeSectionType;
  title: string;
  titleHi: string | null;
  subtitle: string | null;
  sortOrder: number;
  isActive: boolean;
  limit: number;
  collectionId: string | null;
  categoryId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** pages/{slug} */
export interface ContentPage {
  slug: string;
  title: string;
  titleHi: string | null;
  body: string;
  bodyHi: string | null;
  seoDescription: string | null;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** settings/{key} */
export interface Setting {
  value: unknown;
  updatedById: string | null;
  updatedAt: Date;
}

export interface AuditLog {
  actorId: string | null;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

/** searchQueries/{term} */
export interface SearchQuery {
  term: string;
  count: number;
  resultCount: number;
  lastSearchedAt: Date;
}
