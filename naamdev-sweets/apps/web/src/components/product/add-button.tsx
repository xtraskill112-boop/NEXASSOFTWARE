"use client";
import { useState } from "react";
import type { ProductCard } from "@naamdev/api-client";
import { QuantityStepper, cn } from "@naamdev/ui";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { VariantSheet } from "./variant-sheet";

/** ADD button that morphs into a quantity stepper once the item is in the cart. */
export function AddButton({ product, className, size = "md", variant = "inline" }: { product: ProductCard; className?: string; size?: "sm" | "md"; variant?: "inline" | "overlay" }) {
  const { add, quantityOf, setQuantity, cart } = useCart();
  const { t, L } = useI18n();
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const multi = product.variants.length > 1;
  const def = product.variants.find((v) => v.id === product.defaultVariantId) ?? product.variants[0];
  const inCart = cart?.items.filter((i) => i.product.id === product.id) ?? [];
  const totalQty = inCart.reduce((s, i) => s + i.quantity, 0);

  if (!product.inStock)
    return <span className={cn("inline-flex h-10 items-center justify-center rounded-lg border border-line bg-surface px-2.5 text-[13px] font-semibold text-muted", variant === "overlay" && "h-11", className)}>{t("common.outOfStock")}</span>;

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
        <QuantityStepper size={variant === "overlay" ? "md" : size === "sm" ? "sm" : "md"} className={cn(variant === "overlay" && "w-full justify-between border-maroon-700/50")} value={!multi ? quantityOf(def!.id) : totalQty} max={20}
          onChange={(q) => {
            if (multi && q > totalQty) return setSheet(true);
            void setQuantity(inCart[0]!.variant.id, q);
          }} />
      ) : totalQty > 0 ? (
        <button type="button" onClick={() => setSheet(true)} className={cn("nd-press h-10 rounded-lg border border-maroon-700/50 bg-surface px-3 text-[14px] font-bold text-maroon-700", variant === "overlay" && "h-11 w-full")}>{totalQty} added +</button>
      ) : (
        <button type="button" disabled={busy} onClick={onAdd}
          className={cn("nd-press inline-flex items-center justify-center rounded-lg border border-maroon-700/50 bg-surface font-bold text-maroon-700 hover:border-maroon-700 hover:bg-maroon-700 hover:text-white disabled:opacity-60 dark:text-maroon-200 dark:hover:bg-maroon-500/15", variant === "overlay" ? "h-11 w-full text-[16px]" : size === "sm" ? "h-10 px-5 text-[14px]" : "h-11 px-6 text-[15px]")}>
          {t("common.add")}
        </button>
      )}
      {multi && <VariantSheet product={product} open={sheet} onClose={() => setSheet(false)} />}
    </div>
  );
}
