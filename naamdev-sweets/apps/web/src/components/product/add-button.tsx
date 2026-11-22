"use client";
import { useState } from "react";
import type { ProductCard } from "@naamdev/api-client";
import { QuantityStepper, cn } from "@naamdev/ui";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { VariantSheet } from "./variant-sheet";

/** ADD button that morphs into a quantity stepper once the item is in the cart. */
export function AddButton({ product, className, size = "md" }: { product: ProductCard; className?: string; size?: "sm" | "md" }) {
  const { add, quantityOf, setQuantity, cart } = useCart();
  const { t, L } = useI18n();
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const multi = product.variants.length > 1;
  const def = product.variants.find((v) => v.id === product.defaultVariantId) ?? product.variants[0];
  const inCart = cart?.items.filter((i) => i.product.id === product.id) ?? [];
  const totalQty = inCart.reduce((s, i) => s + i.quantity, 0);

  if (!product.inStock)
    return <span className={cn("inline-flex h-9 items-center rounded-md bg-surface-2 px-2.5 text-[13px] font-semibold text-muted", className)}>{t("common.outOfStock")}</span>;

  const onAdd = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (multi) return setSheet(true);
    if (!def) return;
    setBusy(true);
    await add(def.id, 1, L(product, "name"));
    setBusy(false);
  };

  return (
    <div className={className} onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      {totalQty > 0 && (!multi || inCart.length === 1) ? (
        <QuantityStepper size={size === "sm" ? "sm" : "md"} value={!multi ? quantityOf(def!.id) : totalQty} max={20}
          onChange={(q) => {
            if (multi && q > totalQty) return setSheet(true);
            void setQuantity(inCart[0]!.variant.id, q);
          }} />
      ) : totalQty > 0 ? (
        <button type="button" onClick={() => setSheet(true)} className="h-9 rounded-md border border-maroon-700 bg-surface px-3 text-[14px] font-bold text-maroon-700 dark:border-maroon-300 dark:text-maroon-100">{totalQty} added +</button>
      ) : (
        <button type="button" disabled={busy} onClick={onAdd}
          className={cn("inline-flex items-center gap-1 rounded-md border border-maroon-700 bg-surface font-bold text-maroon-700 transition-colors hover:bg-maroon-700 hover:text-white disabled:opacity-60 dark:border-maroon-300 dark:text-maroon-100 dark:hover:bg-maroon-300 dark:hover:text-ink", size === "sm" ? "h-9 px-4 text-[14px]" : "h-10 px-5 text-[15px]")}>
          {t("common.add")}
        </button>
      )}
      {multi && <VariantSheet product={product} open={sheet} onClose={() => setSheet(false)} />}
    </div>
  );
}
