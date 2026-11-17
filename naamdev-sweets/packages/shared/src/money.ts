/** All money values in the platform are integer paise. ₹1 = 100 paise. */
export const toPaise = (rupees: number): number => Math.round(rupees * 100);
export const toRupees = (paise: number): number => paise / 100;

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

/** Formats paise as an Indian-rupee string, e.g. 125000 → "₹1,250". */
export function formatINR(paise: number | null | undefined): string {
  if (paise == null || Number.isNaN(paise)) return "₹0";
  return inrFormatter.format(paise / 100);
}

export function discountPercent(mrpPaise: number, salePaise: number | null | undefined): number {
  if (!salePaise || salePaise >= mrpPaise || mrpPaise <= 0) return 0;
  return Math.round(((mrpPaise - salePaise) / mrpPaise) * 100);
}

/** Effective selling price for a variant. */
export const sellingPrice = (v: { mrpPaise: number; salePricePaise?: number | null }): number =>
  v.salePricePaise != null && v.salePricePaise > 0 && v.salePricePaise < v.mrpPaise ? v.salePricePaise : v.mrpPaise;

/** Distribute `total` across `weights` proportionally using the largest-remainder method (sums exactly). */
export function allocateProportionally(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floored = raw.map(Math.floor);
  let remainder = total - floored.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floored[i] += 1;
    remainder -= 1;
  }
  return floored;
}
