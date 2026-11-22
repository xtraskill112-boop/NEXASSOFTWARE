"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Bookmark, ShoppingCart, Trash2 } from "lucide-react";
import type { CartItem } from "@naamdev/api-client";
import { formatINR } from "@naamdev/shared";
import { Price, QuantityStepper, VegMark } from "@naamdev/ui";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { ProductImage } from "../common/product-image";

export function CartLine({ item, saved }: { item: CartItem; saved?: boolean }) {
  const { update, remove } = useCart();
  const { t, L } = useI18n();
  const issue = item.issues[0];
  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -40 }} className="flex gap-4 py-4">
      <Link href={`/product/${item.product.slug}`} className="shrink-0"><ProductImage src={item.product.image} alt={item.product.name} className="h-20 w-20 rounded-2xl sm:h-24 sm:w-24" sizes={200} /></Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5"><VegMark type={item.product.foodType} /><Link href={`/product/${item.product.slug}`} className="truncate font-semibold text-ink hover:underline">{L(item.product, "name")}</Link></div>
            {item.product.variants.length > 1 ? (
              <select aria-label="Weight" value={item.variant.id} onChange={(e) => void update(item.id, { variantId: e.target.value })} className="mt-1.5 rounded-lg border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink-soft">
                {item.product.variants.map((v) => <option key={v.id} value={v.id} disabled={!v.inStock}>{v.label}, {formatINR(v.pricePaise)}{v.inStock ? "" : " (sold out)"}</option>)}
              </select>
            ) : <p className="mt-1 text-xs font-semibold text-muted">{item.variant.label}</p>}
          </div>
          {!saved && <span className="shrink-0 text-right font-bold tabular-nums text-ink">{formatINR(item.lineTotalPaise)}</span>}
        </div>
        {issue && (
          <p className="mt-2 text-xs font-semibold text-maroon-600">
            {issue === "OUT_OF_STOCK" ? "Out of stock — save it for later or remove." : issue === "INSUFFICIENT_STOCK" ? `Only ${item.variant.available} available — reduce quantity.` : "No longer available."}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {saved ? <Price pricePaise={item.variant.pricePaise} mrpPaise={item.variant.mrpPaise} size="sm" /> : (
            <QuantityStepper size="sm" value={item.quantity} min={0} max={Math.max(item.quantity, Math.min(20, item.variant.available))} onChange={(q) => void (q === 0 ? remove(item.id) : update(item.id, { quantity: q }))} />
          )}
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => void update(item.id, { savedForLater: !saved })} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-ink-soft hover:bg-surface-2">
              {saved ? <><ShoppingCart className="h-3.5 w-3.5" />{t("cart.moveToCart")}</> : <><Bookmark className="h-3.5 w-3.5" />{t("cart.saveForLater")}</>}
            </button>
            <button type="button" aria-label={`Remove ${item.product.name}`} onClick={() => void remove(item.id)} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-maroon-50 hover:text-maroon-700 dark:hover:bg-maroon-500/10"><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    </motion.li>
  );
}
