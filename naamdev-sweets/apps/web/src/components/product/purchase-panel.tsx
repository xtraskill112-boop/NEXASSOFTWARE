"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Clock, Leaf, MapPin, ShieldCheck, Truck, Zap } from "lucide-react";
import type { ProductDetail } from "@naamdev/api-client";
import { formatINR } from "@naamdev/shared";
import { Button, Input, Price, QuantityStepper, RatingPill, VegMark, cn } from "@naamdev/ui";
import { errorMessage } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { useLocation } from "@/lib/location";
import { recentlyViewed } from "@/lib/storage";
import { WishlistButton } from "./wishlist-button";

export function PurchasePanel({ product }: { product: ProductDetail }) {
  const { t, L } = useI18n();
  const router = useRouter();
  const { add } = useCart();
  const [variantId, setVariantId] = useState(product.defaultVariantId ?? product.variants[0]?.id);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState<"add" | "buy" | null>(null);
  const v = product.variants.find((x) => x.id === variantId) ?? product.variants[0];

  useEffect(() => recentlyViewed.push(product.id), [product.id]);
  useEffect(() => setQty((q) => Math.max(1, Math.min(q, v?.available || 1))), [variantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = async (mode: "add" | "buy") => {
    if (!v) return;
    setBusy(mode);
    const ok = await add(v.id, qty, mode === "add" ? `${L(product, "name")} (${v.label})` : undefined);
    setBusy(null);
    if (ok && mode === "buy") router.push("/checkout");
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <VegMark type={product.foodType} />
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{L(product.category, "name")}</span>
        {product.isBestseller && <span className="rounded-full bg-maroon-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-saffron-100">Bestseller</span>}
      </div>
      <div className="mt-2 flex items-start justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-[40px]">{L(product, "name")}</h1>
        <WishlistButton productId={product.id} name={product.name} className="shrink-0 border border-line" />
      </div>
      <p className="mt-2 text-[15px] text-ink-soft">{L(product, "shortDescription")}</p>
      <div className="mt-3 flex items-center gap-3">
        {product.reviewCount > 0 ? <a href="#reviews"><RatingPill rating={product.avgRating} count={product.reviewCount} /></a> : <span className="text-xs text-muted">No ratings yet</span>}
        <span className="h-1 w-1 rounded-full bg-line" />
        <span className="flex items-center gap-1 text-xs font-medium text-muted"><Clock className="h-3.5 w-3.5" />{t("product.days", { n: product.shelfLifeDays })} shelf life</span>
      </div>

      <div className="mt-6 rounded-3xl border border-line-soft bg-surface p-5 shadow-card">
        {v && (
          <motion.div key={v.id} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }}>
            <Price pricePaise={v.pricePaise} mrpPaise={v.mrpPaise} size="xl" />
            <p className="mt-1 text-xs text-muted">{t("product.inclusiveTaxes")} · {v.label}</p>
          </motion.div>
        )}
        <p className="mb-2.5 mt-5 text-xs font-bold uppercase tracking-[0.18em] text-muted">{t("product.selectWeight")}</p>
        <div role="radiogroup" aria-label={t("product.selectWeight")} className="flex flex-wrap gap-2">
          {product.variants.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={x.id === variantId} disabled={!x.inStock} onClick={() => setVariantId(x.id)}
              className={cn("relative min-w-[92px] rounded-2xl border-2 px-4 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-45",
                x.id === variantId ? "border-saffron-500 bg-saffron-50 shadow-[0_0_0_4px_rgba(245,127,14,0.12)] dark:bg-saffron-500/10" : "border-line bg-surface hover:border-saffron-200")}>
              <span className="block text-sm font-bold text-ink">{x.label}</span>
              <span className="block text-xs font-semibold text-ink-soft">{formatINR(x.pricePaise)}</span>
              {x.discountPct > 0 && <span className="absolute -right-2 -top-2 rounded-md bg-pista-600 px-1.5 py-0.5 text-[9px] font-bold text-white">{x.discountPct}%</span>}
              {!x.inStock && <span className="block text-[10px] font-bold uppercase text-maroon-600">Sold out</span>}
            </button>
          ))}
        </div>
        {v?.inStock && v.lowStock && <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-saffron-700"><Zap className="h-4 w-4" />{t("common.onlyLeft", { n: v.available })} — order soon!</p>}
        <div className="mt-5 flex items-center gap-3">
          <QuantityStepper value={qty} onChange={setQty} min={1} max={Math.max(1, Math.min(20, v?.available ?? 1))} size="lg" disabled={!v?.inStock} />
          <span className="text-sm text-muted">Total <b className="text-ink">{formatINR((v?.pricePaise ?? 0) * qty)}</b></span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="outline" size="lg" disabled={!v?.inStock} loading={busy === "add"} onClick={() => go("add")}>{v?.inStock ? "Add to cart" : t("common.outOfStock")}</Button>
          <Button size="lg" disabled={!v?.inStock} loading={busy === "buy"} onClick={() => go("buy")}>{t("common.buyNow")}</Button>
        </div>
      </div>

      <PincodeChecker />

      <ul className="mt-5 grid grid-cols-3 gap-2 text-center text-[11px] font-semibold text-ink-soft">
        <li className="rounded-2xl bg-surface-2 px-2 py-3"><Leaf className="mx-auto mb-1 h-5 w-5 text-pista-600" />100% vegetarian</li>
        <li className="rounded-2xl bg-surface-2 px-2 py-3"><ShieldCheck className="mx-auto mb-1 h-5 w-5 text-saffron-600" />Batch-tracked freshness</li>
        <li className="rounded-2xl bg-surface-2 px-2 py-3"><Truck className="mx-auto mb-1 h-5 w-5 text-maroon-600" />Sealed delivery</li>
      </ul>

      {/* Sticky mobile purchase bar */}
      <div className="nd-glass fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-40 flex items-center gap-3 border-t border-line-soft px-4 py-3 md:hidden">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted">{v?.label}</p>
          <p className="text-lg font-bold text-ink">{formatINR((v?.pricePaise ?? 0) * qty)}</p>
        </div>
        <Button size="lg" disabled={!v?.inStock} loading={busy === "add"} onClick={() => go("add")}>{v?.inStock ? "Add to cart" : t("common.outOfStock")}</Button>
      </div>
    </div>
  );
}

function PincodeChecker() {
  const { t } = useI18n();
  const { location, checkPincode, setLocation } = useLocation();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ serviceable: boolean; area: string | null; etaMinutes?: number; pincode: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (location && !res) setRes(location); }, [location]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mt-5 rounded-3xl border border-dashed border-line p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-ink"><MapPin className="h-4 w-4 text-saffron-600" />{t("product.deliveryEstimate")}</p>
      <form className="mt-3 flex gap-2" onSubmit={async (e) => {
        e.preventDefault();
        if (!/^[1-9]\d{5}$/.test(pin)) return setErr("Enter a valid 6-digit PIN code");
        setBusy(true); setErr(null);
        try { const r = await checkPincode(pin); setRes(r); if (r.serviceable) setLocation(r); } catch (x) { setErr(errorMessage(x)); } finally { setBusy(false); }
      }}>
        <Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder={location?.pincode ?? "PIN code"} aria-label="PIN code" className="h-11" />
        <Button type="submit" variant="soft" loading={busy}>{t("product.checkPincode")}</Button>
      </form>
      {err && <p className="mt-2 text-sm text-maroon-600">{err}</p>}
      {res && (
        <p className={cn("mt-3 text-sm font-medium", res.serviceable ? "text-emerald-700 dark:text-emerald-300" : "text-maroon-600")}>
          {res.serviceable ? `✓ Delivers to ${res.area ?? res.pincode} in about ${res.etaMinutes ?? 60} minutes` : `✗ We don't deliver to ${res.pincode} yet`}
        </p>
      )}
    </div>
  );
}

