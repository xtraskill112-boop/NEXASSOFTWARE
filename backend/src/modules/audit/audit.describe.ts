import type { Prisma } from '@prisma/client';

type Details = Record<string, unknown> | null;

function asRecord(value: Prisma.JsonValue | null): Details {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Human readable one-line description of an audit log entry (used by dashboard activity feed). */
export function describeActivity(action: string, rawDetails: Prisma.JsonValue | null): string {
  const d = asRecord(rawDetails) ?? {};
  const s = (k: string) => (d[k] === undefined || d[k] === null ? '' : String(d[k]));
  const units = (k: string) => `${s(k)} unit${Number(d[k]) === 1 ? '' : 's'}`;

  switch (action) {
    case 'STOCK_IN':
      return `Received ${units('quantity')} of ${s('sku')} into ${s('warehouse')}`;
    case 'STOCK_OUT':
      return `Dispatched ${units('quantity')} of ${s('sku')} from ${s('warehouse')}`;
    case 'STOCK_TRANSFER':
      return `Transferred ${units('quantity')} of ${s('sku')} from ${s('from')} to ${s('to')}`;
    case 'STOCK_OPERATION_REJECTED':
      return `Rejected ${s('type').replace('_', ' ').toLowerCase()} of ${units('requested')} of ${s('sku')} (only ${s('available')} available)`;
    case 'PRODUCT_CREATED':
      return `Created product ${s('sku')} - ${s('name')}`;
    case 'PRODUCT_UPDATED':
      return `Updated product ${s('sku')}`;
    case 'PRODUCT_ACTIVATED':
      return `Activated product ${s('sku')}`;
    case 'PRODUCT_DEACTIVATED':
      return `Deactivated product ${s('sku')}`;
    case 'PRODUCT_DELETED':
      return `Deleted product ${s('sku')}`;
    case 'WAREHOUSE_CREATED':
      return `Created warehouse ${s('code')} - ${s('name')}`;
    case 'WAREHOUSE_UPDATED':
      return `Updated warehouse ${s('code')}`;
    case 'WAREHOUSE_ACTIVATED':
      return `Activated warehouse ${s('code')}`;
    case 'WAREHOUSE_DEACTIVATED':
      return `Deactivated warehouse ${s('code')}`;
    case 'USER_CREATED':
      return `Created user ${s('email')} (${s('role')})`;
    case 'USER_UPDATED':
      return 'Updated a user account';
    case 'USER_ACTIVATED':
      return `Activated user ${s('email')}`;
    case 'USER_DEACTIVATED':
      return `Deactivated user ${s('email')}`;
    case 'USER_PASSWORD_RESET':
      return `Reset password for ${s('email')}`;
    case 'AUTH_LOGIN':
      return 'Signed in';
    case 'AUTH_LOGOUT':
      return 'Signed out';
    case 'AUTH_LOGIN_FAILED':
      return `Failed sign-in attempt for ${s('email')}`;
    case 'AUTH_PASSWORD_CHANGED':
      return 'Changed own password';
    default:
      return action.replace(/_/g, ' ').toLowerCase();
  }
}
