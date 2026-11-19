"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronDown, PenLine } from "lucide-react";
import type { ProductCard as Product, ProductDetail } from "@naamdev/api-client";
import { formatINR } from "@naamdev/shared";
import { Button, Card, SectionHeading, Stars, cn } from "@naamdev/ui";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { ProductImage } from "../common/product-image";

function Accordion({ title, children, defaultOpen }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="border-b border-line-soft last:border-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center justify-between py-4 text-left font-display text-lg font-semibold text-ink">
        {title}
        <ChevronDown className={cn("h-5 w-5 text-muted transition", open && "rotate-180")} />
      </button>
      <div className={cn("grid transition-all duration-300", open ? "grid-rows-[1fr] pb-5" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden text-[15px] leading-relaxed text-ink-soft">{children}</div>
      </div>
    </div>
  );
}

export function ProductInfo({ product }: { product: ProductDetail }) {
  const { t, L } = useI18n();
  return (
    <Card className="px-5 sm:px-6">
      <Accordion title={t("product.description")} defaultOpen>
        <p className="whitespace-pre-line">{L(product, "description")}</p>
      </Accordion>
      <Accordion title={t("product.ingredients")}>
        <p>{product.ingredients}</p>
        {product.allergens.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-maroon-700 dark:text-maroon-300">{t("product.allergens")}</p>
            <div className="flex flex-wrap gap-2">{product.allergens.map((a) => <span key={a} className="rounded-full bg-maroon-50 px-3 py-1 text-xs font-semibold text-maroon-700 dark:bg-maroon-500/10 dark:text-maroon-200">{a}</span>)}</div>
          </div>
        )}
      </Accordion>
      {product.nutrition && Object.keys(product.nutrition).length > 0 && (
        <Accordion title={`${t("product.nutrition")} (per 100 g)`}>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(product.nutrition).map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-surface-2 px-4 py-3"><dt className="text-xs text-muted">{k}</dt><dd className="font-bold text-ink">{v}</dd></div>
            ))}
          </dl>
        </Accordion>
      )}
      <Accordion title={`${t("product.storage")} & ${t("product.shelfLife")}`}>
        <p>{product.storageInstructions}</p>
        <p className="mt-2"><b className="text-ink">{t("product.shelfLife")}:</b> {t("product.days", { n: product.shelfLifeDays })} from manufacture.</p>
      </Accordion>
      {product.manufacturingInfo && (
        <Accordion title={t("product.manufacturing")}>
          <p>{product.manufacturingInfo}</p>
          <p className="mt-2 text-xs text-muted">SKU: {product.sku}</p>
        </Accordion>
      )}
    </Card>
  );
}

export function Reviews({ product }: { product: ProductDetail }) {
  const { t } = useI18n();
  const total = product.ratingCounts.reduce((s, r) => s + r.count, 0);
  return (
    <section id="reviews" className="scroll-mt-28">
      <SectionHeading title={t("product.reviews")} action={<Link href="/account/orders" className="inline-flex items-center gap-1.5 text-sm font-bold text-saffron-700 dark:text-saffron-300"><PenLine className="h-4 w-4" />Write a review</Link>} />
      {total === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">{t("product.noReviews")}<p className="mt-1 text-xs">Reviews are accepted from verified buyers after delivery.</p></Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <Card className="p-6">
            <p className="font-display text-5xl font-semibold text-ink">{product.avgRating.toFixed(1)}</p>
            <Stars value={product.avgRating} className="mt-2" />
            <p className="mt-1 text-sm text-muted">{product.reviewCount} verified review{product.reviewCount > 1 ? "s" : ""}</p>
            <div className="mt-5 space-y-2">
              {product.ratingCounts.map((r) => (
                <div key={r.rating} className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
                  <span className="w-3">{r.rating}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-gold-400" style={{ width: `${total ? (r.count / total) * 100 : 0}%` }} /></div>
                  <span className="w-6 text-right text-muted">{r.count}</span>
                </div>
              ))}
            </div>
          </Card>
          <div className="space-y-3">
            {product.reviews.map((r) => (
              <Card key={r.id} className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <Stars value={r.rating} size={14} />
                  <span className="text-xs text-muted">{new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                </div>
                {r.title && <p className="mt-2 font-semibold text-ink">{r.title}</p>}
                {r.body && <p className="mt-1 text-sm leading-relaxed text-ink-soft">{r.body}</p>}
                <p className="mt-3 text-xs font-semibold text-muted">— {r.author} · Verified buyer</p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function BoughtTogether({ product, items }: { product: ProductDetail; items: Product[] }) {
  const { add } = useCart();
  const { t, L } = useI18n();
  const [busy, setBusy] = useState(false);
  if (!items.length) return null;
  const all = [product as Product, ...items];
  const pick = (p: Product) => p.variants.find((v) => v.id === p.defaultVariantId && v.inStock) ?? p.variants.find((v) => v.inStock);
  const total = all.reduce((s, p) => s + (pick(p)?.pricePaise ?? 0), 0);
  return (
    <section>
      <SectionHeading title={t("product.boughtTogether")} />
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          {all.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3">
              {i > 0 && <span className="text-xl font-bold text-muted">+</span>}
              <Link href={`/product/${p.slug}`} className="w-24 text-center">
                <ProductImage src={p.image} alt={p.name} className="mx-auto h-20 w-20 rounded-2xl" sizes={160} />
                <p className="mt-1.5 line-clamp-2 text-xs font-semibold text-ink">{L(p, "name")}</p>
                <p className="text-xs text-muted">{pick(p)?.label} · {formatINR(pick(p)?.pricePaise ?? 0)}</p>
              </Link>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4">
          <p className="text-sm text-muted">Total for {all.length} items: <b className="text-lg text-ink">{formatINR(total)}</b></p>
          <Button loading={busy} onClick={async () => {
            setBusy(true);
            for (const p of all) { const v = pick(p); if (v) await add(v.id, 1); }
            setBusy(false);
          }}>Add all to cart</Button>
        </div>
      </Card>
    </section>
  );
}
