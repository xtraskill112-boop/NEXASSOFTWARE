/**
 * Permission catalogue and system role definitions. The database stores roles/permissions
 * (seeded from here) so super admins can build custom roles, but these keys are the
 * canonical identifiers used by the API guards and console navigation.
 */
export const PERMISSIONS = {
  "dashboard.view": { group: "Dashboard", description: "View the operations dashboard" },
  "analytics.view": { group: "Analytics", description: "View revenue analytics and business reports" },
  "reports.export": { group: "Analytics", description: "Export reports as CSV" },
  "orders.view": { group: "Orders", description: "View orders and order details" },
  "orders.process": { group: "Orders", description: "Move orders through kitchen & packing stages" },
  "orders.manage": { group: "Orders", description: "Full order lifecycle management and internal notes" },
  "orders.cancel": { group: "Orders", description: "Cancel orders" },
  "refunds.manage": { group: "Payments", description: "Initiate and manage refunds and returns" },
  "payments.view": { group: "Payments", description: "View payment transactions" },
  "payments.verify": { group: "Payments", description: "Confirm direct UPI payments received in the shop's UPI account" },
  "products.view": { group: "Catalog", description: "View products" },
  "products.manage": { group: "Catalog", description: "Create, edit and archive products and variants" },
  "categories.manage": { group: "Catalog", description: "Manage categories and collections" },
  "inventory.view": { group: "Inventory", description: "View stock, batches and inventory history" },
  "inventory.manage": { group: "Inventory", description: "Stock in/out, adjustments, batches and purchases" },
  "suppliers.manage": { group: "Inventory", description: "Manage suppliers" },
  "coupons.manage": { group: "Marketing", description: "Manage coupons and offers" },
  "notifications.send": { group: "Marketing", description: "Send promotional notifications" },
  "content.manage": { group: "Content", description: "Manage banners, home sections, pages and FAQs" },
  "customers.view": { group: "Customers", description: "View customers" },
  "customers.manage": { group: "Customers", description: "Suspend customers and adjust loyalty points" },
  "reviews.moderate": { group: "Customers", description: "Moderate product reviews" },
  "support.view": { group: "Support", description: "View support tickets" },
  "support.manage": { group: "Support", description: "Reply to, assign and resolve tickets" },
  "delivery.manage": { group: "Delivery", description: "Assign deliveries and monitor partners" },
  "partners.manage": { group: "Delivery", description: "Approve, suspend and verify delivery partners" },
  "staff.manage": { group: "Administration", description: "Create and manage staff accounts" },
  "roles.manage": { group: "Administration", description: "Create custom roles and edit permissions" },
  "settings.manage": { group: "Administration", description: "Change business settings and delivery zones" },
  "audit.view": { group: "Administration", description: "View audit logs" },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

export const ROLE_KEYS = {
  SUPER_ADMIN: "SUPER_ADMIN",
  STORE_OWNER: "STORE_OWNER",
  STORE_MANAGER: "STORE_MANAGER",
  ORDER_MANAGER: "ORDER_MANAGER",
  INVENTORY_MANAGER: "INVENTORY_MANAGER",
  PACKING_STAFF: "PACKING_STAFF",
  SUPPORT_AGENT: "SUPPORT_AGENT",
  DELIVERY_PARTNER: "DELIVERY_PARTNER",
  CUSTOMER: "CUSTOMER",
} as const;
export type RoleKey = (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS];

export const SYSTEM_ROLES: { key: RoleKey; name: string; description: string; isStaff: boolean; permissions: PermissionKey[] }[] = [
  {
    key: "SUPER_ADMIN",
    name: "Super Admin",
    description: "Full platform access including roles, settings and audit logs",
    isStaff: true,
    permissions: ALL_PERMISSIONS,
  },
  {
    key: "STORE_OWNER",
    name: "Store Owner",
    description: "Business owner with full operational access",
    isStaff: true,
    permissions: ALL_PERMISSIONS.filter((p) => p !== "roles.manage"),
  },
  {
    key: "STORE_MANAGER",
    name: "Store Manager",
    description: "Runs daily store operations",
    isStaff: true,
    permissions: [
      "dashboard.view", "analytics.view", "reports.export", "orders.view", "orders.process", "orders.manage",
      "orders.cancel", "refunds.manage", "payments.view", "payments.verify", "products.view", "products.manage", "categories.manage",
      "inventory.view", "inventory.manage", "suppliers.manage", "coupons.manage", "customers.view",
      "reviews.moderate", "support.view", "support.manage", "delivery.manage", "content.manage",
    ],
  },
  {
    key: "ORDER_MANAGER",
    name: "Order Manager",
    description: "Handles incoming orders, cancellations and delivery assignment",
    isStaff: true,
    permissions: [
      "dashboard.view", "orders.view", "orders.process", "orders.manage", "orders.cancel", "payments.view", "payments.verify",
      "customers.view", "delivery.manage", "support.view",
    ],
  },
  {
    key: "INVENTORY_MANAGER",
    name: "Inventory Manager",
    description: "Manages stock, batches, expiry and suppliers",
    isStaff: true,
    permissions: ["dashboard.view", "products.view", "inventory.view", "inventory.manage", "suppliers.manage", "reports.export"],
  },
  {
    key: "PACKING_STAFF",
    name: "Packing Staff",
    description: "Prepares and packs orders in the kitchen",
    isStaff: true,
    permissions: ["orders.view", "orders.process", "inventory.view"],
  },
  {
    key: "SUPPORT_AGENT",
    name: "Customer Support",
    description: "Resolves customer tickets and moderates reviews",
    isStaff: true,
    permissions: ["dashboard.view", "orders.view", "customers.view", "support.view", "support.manage", "reviews.moderate"],
  },
  {
    key: "DELIVERY_PARTNER",
    name: "Delivery Partner",
    description: "Delivers orders through the partner app",
    isStaff: false,
    permissions: [],
  },
  {
    key: "CUSTOMER",
    name: "Customer",
    description: "Shops on the storefront",
    isStaff: false,
    permissions: [],
  },
];

export function hasPermission(granted: readonly string[] | undefined, required: PermissionKey | PermissionKey[]): boolean {
  if (!granted) return false;
  const req = Array.isArray(required) ? required : [required];
  return req.every((r) => granted.includes(r));
}

export function hasAnyPermission(granted: readonly string[] | undefined, required: PermissionKey[]): boolean {
  if (!granted) return false;
  return required.some((r) => granted.includes(r));
}
