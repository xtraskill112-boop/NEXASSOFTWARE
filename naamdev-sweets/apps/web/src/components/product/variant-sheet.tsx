"use client";
import { useState } from "react";
import type { ProductCard } from "@naamdev/api-client";
import { formatINR } from "@naamdev/shared";
import { Button, Price, QuantityStepper, Sheet, VegMark, cn } from "@naamdev/ui";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { ProductImage } from "../common/product-image";

/** "Choose weight" bottom sheet shown when a product has several weight variants. */
export function VariantSheet({ product, open, onClose }: { product: ProductCard; open: boolean; onClose: () => void }) {
  const { add } = useCart();
  const { L, t } = useI18n();
  const [variantId, setVariantId] = useState(product.defaultVariantId ?? product.variants[0]?.id);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const v = product.variants.find((x) => x.id === variantId);
  return (
    <Sheet open={open} onClose={onClose} side="bottom" className="sm:mx-auto sm:max-w-lg"
      footer={
        <div className="flex items-center gap-3">
          <QuantityStepper value={qty} onChange={setQty} min={1} max={Math.max(1, Math.min(20, v?.available ?? 1))} size="lg" />
          <Button block size="lg" className="font-bold" loading={busy} disabled={!v?.inStock} onClick={async () => {
            if (!v) return;
            setBusy(true);
            const ok = await add(v.id, qty, `${L(product, "name")} (${v.label})`);
            setBusy(false);
            if (ok) onClose();
          }}>
            {v?.inStock ? `Add item · ${formatINR(v.pricePaise * qty)}` : t("common.outOfStock")}
          </Button>
        </div>
      }
    >
      <div className="p-5">
        <div className="flex gap-4">
          <ProductImage src={product.image} alt={product.name} className="h-20 w-20 shrink-0 rounded-xl" sizes={160} />
          <div className="min-w-0">
            <div className="flex items-center gap-2"><VegMark type={product.foodType} /><h3 className="truncate text-[18px] font-bold text-ink">{L(product, "name")}</h3></div>
            <p className="mt-1 line-clamp-2 text-sm text-muted">{L(product, "shortDescription")}</p>
          </div>
        </div>
        <p className="mb-3 mt-6 text-[13px] font-semibold text-muted">{t("product.selectWeight")}</p>
        <div role="radiogroup" className="space-y-2.5">
          {product.variants.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={x.id === variantId} disabled={!x.inStock} onClick={() => setVariantId(x.id)}
              className={cn("flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-50", x.id === variantId ? "border-maroon-700 bg-maroon-50/60 dark:bg-maroon-500/15" : "border-line hover:bg-surface-2")}>
              <span className="flex items-center gap-3">
                <span className={cn("grid h-5 w-5 place-items-center rounded-full border-2", x.id === variantId ? "border-maroon-700" : "border-line")}>{x.id === variantId && <span className="h-2.5 w-2.5 rounded-full bg-maroon-700" />}</span>
                <span className="font-semibold text-ink">{x.label}</span>
                {!x.inStock && <span className="text-xs font-semibold text-maroon-600">{t("common.outOfStock")}</span>}
                {x.inStock && x.lowStock && <span className="text-xs font-semibold text-maroon-700">{t("common.onlyLeft", { n: x.available })}</span>}
              </span>
              <Price pricePaise={x.pricePaise} mrpPaise={x.mrpPaise} size="sm" />
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
