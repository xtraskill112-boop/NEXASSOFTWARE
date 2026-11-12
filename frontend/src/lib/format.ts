const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const inrWhole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrCompact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 2 });
const num = new Intl.NumberFormat('en-IN');
const numCompact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });

export const formatCurrency = (v: number) => inr.format(v);
export const formatCurrencyWhole = (v: number) => inrWhole.format(v);
export const formatCurrencyCompact = (v: number) => (Math.abs(v) >= 100000 ? inrCompact.format(v) : inr.format(v));
export const formatNumber = (v: number) => num.format(v);
export const formatCompact = (v: number) => (Math.abs(v) >= 10000 ? numCompact.format(v) : num.format(v));
/** Axis ticks: one consistent compact style per axis. */
export const formatAxisNumber = (v: number) => numCompact.format(v);
export const formatAxisCurrency = (v: number) => inrCompact.format(v).replace(/\.00(?=\D|$)/, '');

export function formatDateTime(iso: string | Date) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(iso: string | Date) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatShortDate(isoDate: string) {
  // isoDate is YYYY-MM-DD (already bucketed server-side); render without TZ shifting
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export function timeAgo(iso: string | Date) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr${h > 1 ? 's' : ''} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d > 1 ? 's' : ''} ago`;
  return formatDate(iso);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export const roleLabel: Record<string, string> = { ADMIN: 'Admin', MANAGER: 'Manager', STAFF: 'Staff' };

export const movementLabel: Record<string, string> = {
  STOCK_IN: 'Stock In',
  STOCK_OUT: 'Stock Out',
  TRANSFER: 'Transfer',
};

export function humanizeAction(action: string) {
  return action
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
