"use client";
import { useState } from "react";
import { motion } from "framer-motion";
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
    return <span className={cn("inline-flex h-9 items-center rounded-xl bg-surface-2 px-3 text-xs font-bold uppercase tracking-wide text-muted", className)}>{t("common.outOfStock")}</span>;

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
          }} className="bg-surface shadow-card" />
      ) : totalQty > 0 ? (
        <button type="button" onClick={() => setSheet(true)} className="h-10 rounded-xl border border-saffron-300 bg-surface px-4 text-sm font-extrabold text-saffron-700 shadow-card">{totalQty} added +</button>
      ) : (
        <motion.button whileTap={{ scale: 0.92 }} type="button" disabled={busy} onClick={onAdd}
          className={cn("relative rounded-xl border border-saffron-300 bg-surface font-extrabold uppercase tracking-wide text-saffron-700 shadow-card transition hover:bg-saffron-50 dark:border-saffron-500/40 dark:text-saffron-300 dark:hover:bg-saffron-500/10", size === "sm" ? "h-8 px-4 text-xs" : "h-10 px-6 text-sm")}>
          {t("common.add")}
          {multi && <span className="absolute -right-1 -top-1.5 rounded-md bg-saffron-500 px-1 text-[9px] text-white">+</span>}
        </motion.button>
      )}
      {multi && <VariantSheet product={product} open={sheet} onClose={() => setSheet(false)} />}
    </div>
  );
}
