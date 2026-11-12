import type { Role } from '@prisma/client';

/**
 * Central role-based access control matrix.
 * Every protected route declares the permission it needs; roles map to permissions here.
 */
export const PERMISSIONS = {
  'dashboard:view': ['ADMIN', 'MANAGER', 'STAFF'],
  'products:view': ['ADMIN', 'MANAGER', 'STAFF'],
  'products:create': ['ADMIN', 'MANAGER'],
  'products:update': ['ADMIN', 'MANAGER'],
  'products:deactivate': ['ADMIN', 'MANAGER'],
  'products:delete': ['ADMIN'],
  'warehouses:view': ['ADMIN', 'MANAGER', 'STAFF'],
  'warehouses:manage': ['ADMIN'],
  'inventory:view': ['ADMIN', 'MANAGER', 'STAFF'],
  'inventory:stock-in': ['ADMIN', 'MANAGER', 'STAFF'],
  'inventory:stock-out': ['ADMIN', 'MANAGER', 'STAFF'],
  'inventory:transfer': ['ADMIN', 'MANAGER'],
  'reports:view': ['ADMIN', 'MANAGER', 'STAFF'],
  'audit:view': ['ADMIN', 'MANAGER'],
  'users:manage': ['ADMIN'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function permissionsForRole(role: Role): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => hasPermission(role, p));
}
