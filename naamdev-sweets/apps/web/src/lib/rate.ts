import type { Variant } from "@naamdev/api-client";

const WEIGHT_LABEL = /^\d+(\.\d+)?\s*(g|kg)\b/i;
const PIECES = /^(\d+)\s*(pc|pcs|piece|pieces)\b|^pack of (\d+)/i;

/**
 * The shop's counter rate for an item, the way a halwai's board shows it: rupees per kg for sweets
 * sold by weight, per piece for kachori, ghevar and the like. Null when the packs don't say.
 */
export function counterRate(variants: Variant[]): { paise: number; unit: "kg" | "piece" } | null {
  const byWeight = variants.filter((v) => v.weightGrams && WEIGHT_LABEL.test(v.label));
  if (byWeight.length) {
    const v = byWeight.find((x) => x.weightGrams === 1000) ?? byWeight[0]!;
    return { paise: Math.round((v.pricePaise * 1000) / v.weightGrams!), unit: "kg" };
  }
  const pieces = variants
    .map((v) => {
      const m = PIECES.exec(v.label);
      const n = m ? Number(m[1] ?? m[3]) : 0;
      return n > 0 ? { v, n } : null;
    })
    .filter((x): x is { v: Variant; n: number } => !!x)
    .sort((a, b) => a.n - b.n);
  if (pieces.length) return { paise: Math.round(pieces[0]!.v.pricePaise / pieces[0]!.n), unit: "piece" };
  return null;
}
