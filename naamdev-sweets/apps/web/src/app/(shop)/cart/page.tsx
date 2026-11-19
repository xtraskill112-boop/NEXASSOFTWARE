"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { ShoppingBag, ShieldCheck } from "lucide-react";
import { formatINR } from "@naamdev/shared";
import { BrandLoader, Button, Card, EmptyState, InlineAlert, buttonStyles } from "@naamdev/ui";
import { BillSummary, FreeDeliveryProgress } from "@/components/cart/bill-summary";
import { CartLine } from "@/components/cart/cart-line";
import { CouponBox } from "@/components/cart/coupon-box";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";

export default function CartPage() {
  const { cart, loading } = useCart();
  const { user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  if (loading && !cart) return <BrandLoader className="min-h-[60dvh]" />;
  const items = cart?.items ?? [];
  const saved = cart?.savedItems ?? [];
  const checkout = () => router.push(user ? "/checkout" : "/login?next=/checkout");

  if (!items.length && !saved.length)
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <EmptyState icon={<ShoppingBag className="h-8 w-8" />} title={t("cart.empty")} description={t("cart.emptyHint")} action={<Link href="/" className={buttonStyles({ size: "lg" })}>{t("cart.startShopping")}</Link>} />
      </div>
    );

  return (
    <div className="mx-auto max-w-6xl px-4 pb-40 pt-6 sm:px-6 md:pb-12">
      <h1 className="font-display text-3xl font-semibold text-ink">{t("cart.title")}</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          {items.length > 0 && cart && <FreeDeliveryProgress pricing={cart.pricing} />}
          {items.length > 0 ? (
            <Card className="px-5">
              <ul className="divide-y divide-line-soft"><AnimatePresence initial={false}>{items.map((i) => <CartLine key={i.id} item={i} />)}</AnimatePresence></ul>
            </Card>
          ) : (
            <Card className="p-6 text-center text-sm text-muted">Your cart is empty — move something from “Saved for later” or keep browsing.</Card>
          )}
          {saved.length > 0 && (
            <div>
              <h2 className="mb-2 font-display text-xl font-semibold text-ink">{t("cart.savedForLater")} ({saved.length})</h2>
              <Card className="px-5"><ul className="divide-y divide-line-soft">{saved.map((i) => <CartLine key={i.id} item={i} saved />)}</ul></Card>
            </div>
          )}
        </div>
        {items.length > 0 && cart && (
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <CouponBox />
            <BillSummary pricing={cart.pricing} couponCode={cart.couponCode} />
            {cart.blockers.map((b) => <InlineAlert key={b} tone="warning">{b}</InlineAlert>)}
            <Button size="xl" block disabled={!cart.canCheckout} onClick={checkout} className="hidden lg:inline-flex">{user ? t("cart.checkout") : "Log in to checkout"} · {formatINR(cart.pricing.totalPaise)}</Button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted"><ShieldCheck className="h-3.5 w-3.5" />Prices & stock re-verified securely at checkout</p>
          </aside>
        )}
      </div>
      {items.length > 0 && cart && (
        <div className="nd-glass fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-40 border-t border-line-soft p-3 lg:hidden">
          <Button size="xl" block disabled={!cart.canCheckout} onClick={checkout}>{user ? t("cart.checkout") : "Log in to checkout"} · {formatINR(cart.pricing.totalPaise)}</Button>
        </div>
      )}
    </div>
  );
}
