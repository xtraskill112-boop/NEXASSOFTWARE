export * from "./firebase";
export * from "./helpers";
export * from "./types";
export * from "./derived";
export { createUserDoc, ensureAuthUser, syncClaims, DEFAULT_PROFILE } from "./accounts";

/** Firestore collection names (single source of truth). */
export const C = {
  roles: "roles",
  users: "users",
  referralCodes: "referralCodes",
  stores: "stores",
  zones: "zones",
  categories: "categories",
  products: "products",
  skus: "skus",
  collections: "collections",
  inventory: "inventory",
  suppliers: "suppliers",
  purchases: "purchases",
  batches: "batches",
  stockTransactions: "stockTransactions",
  carts: "carts",
  searchQueries: "searchQueries",
  orders: "orders",
  orderKeys: "orderKeys",
  payments: "payments",
  refunds: "refunds",
  returns: "returns",
  upiReferences: "upiReferences",
  webhookEvents: "webhookEvents",
  coupons: "coupons",
  couponUsages: "couponUsages",
  partners: "partners",
  assignments: "assignments",
  earnings: "earnings",
  reviews: "reviews",
  notificationDeliveries: "notificationDeliveries",
  tickets: "tickets",
  faqs: "faqs",
  referrals: "referrals",
  banners: "banners",
  homeSections: "homeSections",
  pages: "pages",
  settings: "settings",
  auditLogs: "auditLogs",
  counters: "counters",
  jobRuns: "jobRuns",
  // Realtime "signal" documents that browsers may listen to (see firestore.rules).
  liveOrders: "liveOrders",
  liveUsers: "liveUsers",
  livePartners: "livePartners",
  liveStaff: "liveStaff",
} as const;

/** Subcollection names. */
export const SUB = {
  addresses: "addresses",
  wishlist: "wishlist",
  views: "views",
  notifications: "notifications",
  devices: "devices",
  loyalty: "loyalty",
  history: "history",
  notes: "notes",
  tracking: "tracking",
  documents: "documents",
  messages: "messages",
} as const;
