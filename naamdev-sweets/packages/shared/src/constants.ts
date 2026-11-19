export const BRAND = {
  name: "NAAMDEV SWEETS",
  shortName: "Naamdev",
  tagline: "Mithaas that feels like home",
  taglineHi: "घर जैसी मिठास",
  currency: "INR",
  locale: "en-IN",
  supportEmail: "care@naamdevsweets.com",
} as const;

export const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "PREPARING",
  "PACKED",
  "READY_FOR_PICKUP",
  "DISPATCHED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "REFUND_INITIATED",
  "REFUNDED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_META: Record<OrderStatus, { label: string; labelHi: string; tone: Tone; description: string }> = {
  PENDING: { label: "Pending", labelHi: "लंबित", tone: "warning", description: "Waiting for payment confirmation" },
  CONFIRMED: { label: "Confirmed", labelHi: "पुष्टि हुई", tone: "info", description: "Your order has been confirmed" },
  PROCESSING: { label: "Processing", labelHi: "प्रोसेसिंग", tone: "info", description: "The store is processing your order" },
  PREPARING: { label: "Preparing", labelHi: "तैयार हो रहा है", tone: "info", description: "Your sweets are being freshly prepared" },
  PACKED: { label: "Packed", labelHi: "पैक हो गया", tone: "info", description: "Packed with care and sealed for freshness" },
  READY_FOR_PICKUP: { label: "Ready for Pickup", labelHi: "पिकअप के लिए तैयार", tone: "info", description: "Waiting for the delivery partner" },
  DISPATCHED: { label: "Dispatched", labelHi: "रवाना", tone: "brand", description: "Picked up by the delivery partner" },
  OUT_FOR_DELIVERY: { label: "Out for Delivery", labelHi: "डिलीवरी के लिए निकला", tone: "brand", description: "Your order is on the way" },
  DELIVERED: { label: "Delivered", labelHi: "डिलीवर हो गया", tone: "success", description: "Enjoy your sweets!" },
  CANCELLED: { label: "Cancelled", labelHi: "रद्द", tone: "danger", description: "This order was cancelled" },
  REFUND_INITIATED: { label: "Refund Initiated", labelHi: "रिफंड शुरू", tone: "warning", description: "Your refund is being processed" },
  REFUNDED: { label: "Refunded", labelHi: "रिफंड हो गया", tone: "neutral", description: "The refund has been completed" },
};

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

/** Customer-facing tracking milestones (collapsed view of the full lifecycle). */
export const TRACKING_MILESTONES: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: "placed", label: "Order placed", statuses: ["PENDING", "CONFIRMED"] },
  { key: "preparing", label: "Preparing", statuses: ["PROCESSING", "PREPARING"] },
  { key: "packed", label: "Packed", statuses: ["PACKED", "READY_FOR_PICKUP"] },
  { key: "onTheWay", label: "On the way", statuses: ["DISPATCHED", "OUT_FOR_DELIVERY"] },
  { key: "delivered", label: "Delivered", statuses: ["DELIVERED"] },
];

/** ONLINE = Razorpay (verified by signature/webhook) · UPI = direct to the shop's UPI ID (verified by staff) · COD = cash. */
export const PAYMENT_METHODS = ["ONLINE", "UPI", "COD"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ORDER_PAYMENT_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Awaiting payment", tone: "warning" },
  VERIFYING: { label: "Verifying UPI payment", tone: "info" },
  PAID: { label: "Paid", tone: "success" },
  FAILED: { label: "Payment failed", tone: "danger" },
  COD_PENDING: { label: "Cash on delivery", tone: "info" },
  COD_COLLECTED: { label: "Cash collected", tone: "success" },
  PARTIALLY_REFUNDED: { label: "Partially refunded", tone: "warning" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
};

export const PAYMENT_METHOD_LABELS: Record<(typeof PAYMENT_METHODS)[number], string> = {
  ONLINE: "Online (Razorpay)",
  UPI: "UPI (direct)",
  COD: "Cash on delivery",
};

export const ADDRESS_TYPES = ["HOME", "OFFICE", "OTHER"] as const;
export const FOOD_TYPES = ["VEG", "EGG", "NON_VEG"] as const;
export const COUPON_TYPES = ["PERCENTAGE", "FIXED", "FREE_DELIVERY"] as const;
export const COUPON_SCOPES = ["ALL", "CATEGORY", "PRODUCT"] as const;
export const TICKET_CATEGORIES = [
  "ORDER",
  "REFUND",
  "CANCELLATION",
  "PAYMENT",
  "DELIVERY",
  "PRODUCT_QUALITY",
  "ACCOUNT",
  "FEEDBACK",
  "OTHER",
] as const;
export const TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "AWAITING_CUSTOMER", "RESOLVED", "CLOSED"] as const;
export const VEHICLE_TYPES = ["BICYCLE", "MOTORCYCLE", "SCOOTER", "EV_SCOOTER", "CAR"] as const;
export const DOCUMENT_TYPES = ["AADHAAR", "PAN", "DRIVING_LICENSE", "VEHICLE_RC", "PROFILE_PHOTO", "BANK_PROOF"] as const;
export const REQUIRED_PARTNER_DOCUMENTS = ["AADHAAR", "DRIVING_LICENSE", "PROFILE_PHOTO"] as const;
export const BANNER_THEMES = ["saffron", "maroon", "royal", "pistachio", "rose", "midnight", "gold"] as const;
export const HOME_SECTION_TYPES = [
  "CATEGORY_GRID",
  "BESTSELLERS",
  "POPULAR",
  "NEW_ARRIVALS",
  "TRENDING",
  "RECOMMENDED",
  "FAVOURITES",
  "GIFT_HAMPERS",
  "FESTIVAL_COLLECTION",
  "RECENTLY_VIEWED",
  "FREQUENTLY_PURCHASED",
  "OFFERS",
] as const;
export const STOCK_ADJUST_TYPES = ["STOCK_IN", "ADJUSTMENT", "DAMAGED", "EXPIRED", "RETURNED"] as const;

export const SOCKET_EVENTS = {
  orderStatus: "order:status",
  orderUpdated: "order:updated",
  trackingLocation: "tracking:location",
  notification: "notification:new",
  adminNewOrder: "admin:order:new",
  adminOrderUpdated: "admin:order:updated",
  deliveryOffer: "delivery:offer",
  deliveryOfferWithdrawn: "delivery:offer:withdrawn",
  deliveryAssignmentUpdated: "delivery:assignment:updated",
  subscribeOrder: "order:subscribe",
  unsubscribeOrder: "order:unsubscribe",
  partnerLocation: "partner:location",
} as const;

export const CANCELLATION_REASONS = [
  "Ordered by mistake",
  "Want to change items or address",
  "Delivery time is too long",
  "Found a better price",
  "Payment issue",
  "Other",
] as const;

export const RETURN_REASONS = [
  "Item damaged in transit",
  "Wrong item delivered",
  "Quality not as expected",
  "Item missing from order",
  "Other",
] as const;
