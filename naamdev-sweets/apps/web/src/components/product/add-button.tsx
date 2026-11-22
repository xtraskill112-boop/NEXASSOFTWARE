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
    return <span className={cn("inline-flex h-9 items-center justify-center rounded-lg border border-line bg-surface px-2.5 text-[13px] font-semibold text-muted", variant === "overlay" && "shadow-[0_3px_10px_rgb(0_0_0/0.1)]", className)}>{t("common.outOfStock")}</span>;

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
        <QuantityStepper size={variant === "overlay" ? "md" : size === "sm" ? "sm" : "md"} className={cn(variant === "overlay" && "w-full justify-between shadow-[0_3px_10px_rgb(0_0_0/0.12)]")} value={!multi ? quantityOf(def!.id) : totalQty} max={20}
          onChange={(q) => {
            if (multi && q > totalQty) return setSheet(true);
            void setQuantity(inCart[0]!.variant.id, q);
          }} />
      ) : totalQty > 0 ? (
        <button type="button" onClick={() => setSheet(true)} className={cn("h-9 rounded-lg border border-line bg-surface px-3 text-[14px] font-bold text-go-600 shadow-[0_3px_10px_rgb(0_0_0/0.1)]", variant === "overlay" && "h-10 w-full")}>{totalQty} added +</button>
      ) : (
        <button type="button" disabled={busy} onClick={onAdd}
          className={cn("inline-flex items-center justify-center rounded-lg border border-line bg-surface font-extrabold uppercase tracking-wide text-go-600 shadow-[0_3px_10px_rgb(0_0_0/0.1)] transition-colors hover:bg-go-50 disabled:opacity-60 dark:text-go-500 dark:hover:bg-go-600/15", variant === "overlay" ? "h-10 w-full text-[16px]" : size === "sm" ? "h-9 px-5 text-[14px]" : "h-10 px-6 text-[15px]")}>
          {t("common.add")}
        </button>
      )}
      {multi && <VariantSheet product={product} open={sheet} onClose={() => setSheet(false)} />}
    </div>
  );
}
