import { discountPercent, normalizeSearchTerm, sellingPrice } from "@naamdev/shared";
import type { Product, ProductVariant } from "./types";

/** Fields kept on each product document so listings can filter and sort without reading variants. */
export function productDerived(p: Pick<Product, "name" | "nameHi" | "tags" | "ingredients" | "shortDescription"> & { variants: ProductVariant[] }) {
  const active = p.variants.filter((v) => v.isActive);
  const list = active.length ? active : p.variants;
  const minPricePaise = list.length ? Math.min(...list.map((v) => sellingPrice(v))) : 0;
  const maxDiscountPercent = list.length ? Math.max(...list.map((v) => discountPercent(v.mrpPaise, v.salePricePaise))) : 0;
  const searchText = normalizeSearchTerm([p.name, p.nameHi ?? "", ...(p.tags ?? []), p.ingredients, p.shortDescription].join(" "));
  return { minPricePaise, maxDiscountPercent, searchText };
}

export function userSearchText(u: { name: string; email?: string | null; phone?: string | null }) {
  return [u.name, u.email ?? "", u.phone ?? ""].join(" ").toLowerCase();
}

export function orderSearchText(o: { orderNumber: string; customerName: string; customerPhone: string; customerEmail?: string | null }) {
  return [o.orderNumber, o.customerName, o.customerPhone, o.customerEmail ?? ""].join(" ").toLowerCase();
}
