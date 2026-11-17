"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Banknote, CheckCircle2, Clock, CreditCard, Lock, MapPin, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { Address, Order, PaymentSession, Quote } from "@naamdev/api-client";
import { formatINR } from "@naamdev/shared";
import { BrandLoader, Button, Card, InlineAlert, Modal, Switch, Textarea, VegMark, cn } from "@naamdev/ui";
import { BillSummary } from "@/components/cart/bill-summary";
import { CouponBox } from "@/components/cart/coupon-box";
import { AddressForm } from "@/components/checkout/address-form";
import { payWithRazorpay } from "@/components/checkout/razorpay";
import { ProductImage } from "@/components/common/product-image";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";

export default function CheckoutPage() {
  const { user } = useAuth();
  const { cart, refresh } = useCart();
  const { t, L } = useI18n();
  const router = useRouter();
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [usePoints, setUsePoints] = useState(false);
  const [method, setMethod] = useState<"ONLINE" | "COD" | null>(null);
  const [note, setNote] = useState("");
  const [placing, setPlacing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef<string>("");

  useEffect(() => {
    idempotencyKey.current = crypto.randomUUID();
  }, []);

  useEffect(() => {
    if (user === null) router.replace("/login?next=/checkout");
  }, [user, router]);

  useEffect(() => {
    if (!user) return;
    api.get<{ addresses: Address[] }>("/account/addresses").then((r) => {
      setAddresses(r.addresses);
      const def = r.addresses.find((a) => a.isDefault && a.serviceable !== false) ?? r.addresses.find((a) => a.serviceable !== false) ?? r.addresses[0];
      if (def) setAddressId(def.id);
      if (!r.addresses.length) setAddOpen(true);
    });
  }, [user]);

  const loadQuote = useCallback(async () => {
    if (!user) return;
    try {
      const r = await api.post<{ quote: Quote }>("/checkout/quote", { addressId: addressId ?? undefined, redeemPoints: usePoints ? user.loyaltyPoints : 0 });
      setQuote(r.quote);
      setMethod((m) => m ?? (r.quote.paymentOptions.online.available ? "ONLINE" : r.quote.paymentOptions.cod.available ? "COD" : null));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [user, addressId, usePoints]);

  useEffect(() => { void loadQuote(); }, [loadQuote, cart?.couponCode, cart?.items.length]);

  const finish = (orderId: string) => {
    void refresh();
    router.replace(`/orders/${orderId}/placed`);
  };

  const pay = async (session: PaymentSession) => {
    try {
      const r = await payWithRazorpay(session);
      const v = await api.post<{ order: Order }>("/payments/razorpay/verify", { orderId: session.orderId, ...r });
      toast.success("Payment successful! 🎉");
      finish(v.order.id);
    } catch (e) {
      const dismissed = (e as Error).message === "DISMISSED";
      toast.error(dismissed ? "Payment was not completed. You can retry from your order within the payment window." : errorMessage(e));
      router.replace(`/account/orders/${session.orderId}`);
    }
  };

  const place = async () => {
    if (!addressId || !method || !quote) return;
    setPlacing(true);
    setError(null);
    try {
      const r = await api.post<{ order: Order; payment: PaymentSession | null }>("/checkout/place-order", {
        addressId, paymentMethod: method, idempotencyKey: idempotencyKey.current, redeemPoints: usePoints ? user?.loyaltyPoints ?? 0 : 0, customerNote: note || null,
      });
      if (r.payment) await pay(r.payment);
      else finish(r.order.id);
    } catch (e) {
      setError(errorMessage(e));
      idempotencyKey.current = crypto.randomUUID();
      void loadQuote();
    } finally {
      setPlacing(false);
    }
  };

  if (!user || !addresses) return <BrandLoader className="min-h-[70dvh]" label="Preparing checkout" />;
  if (cart && cart.items.length === 0 && !placing)
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="font-display text-2xl text-ink">Your cart is empty</p>
        <Link href="/" className="mt-4 inline-block font-semibold text-saffron-700">Continue shopping</Link>
      </div>
    );

  const selected = addresses.find((a) => a.id === addressId);
  const pricing = quote?.pricing;
  const loyaltyMax = pricing?.maxRedeemablePoints ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-36 pt-6 sm:px-6 md:pb-12">
      <div className="flex items-center gap-3">
        <Link href="/cart" aria-label="Back to cart" className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-2"><ArrowLeft className="h-5 w-5" /></Link>
        <h1 className="font-display text-3xl font-semibold text-ink">{t("checkout.title")}</h1>
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-muted"><Lock className="h-3.5 w-3.5" />Secure checkout</span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          {/* Address */}
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink"><span className="grid h-7 w-7 place-items-center rounded-full bg-saffron-500 text-xs font-bold text-white">1</span>{t("checkout.deliveryAddress")}</h2>
              <Button variant="ghost" size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" />{t("checkout.addAddress")}</Button>
            </div>
            <div role="radiogroup" className="grid gap-3 sm:grid-cols-2">
              {addresses.map((a) => (
                <button key={a.id} type="button" role="radio" aria-checked={a.id === addressId} onClick={() => setAddressId(a.id)}
                  className={cn("relative rounded-2xl border-2 p-4 text-left transition", a.id === addressId ? "border-saffron-500 bg-saffron-50/60 dark:bg-saffron-500/10" : "border-line hover:border-saffron-200")}>
                  <span className="flex items-center gap-2 text-sm font-bold text-ink"><MapPin className="h-4 w-4 text-saffron-600" />{a.type === "OTHER" ? a.label ?? "Other" : a.type === "HOME" ? "Home" : "Office"}{a.isDefault && <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase text-muted">Default</span>}</span>
                  <span className="mt-1.5 block text-sm text-ink-soft">{a.fullName} · {a.phone}</span>
                  <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{[a.line1, a.line2, a.landmark, a.city, a.pincode].filter(Boolean).join(", ")}</span>
                  {a.serviceable === false && <span className="mt-2 block text-xs font-semibold text-maroon-600">Not deliverable yet</span>}
                  {a.id === addressId && <CheckCircle2 className="absolute right-3 top-3 h-5 w-5 text-saffron-600" />}
                </button>
              ))}
            </div>
            {quote && selected && quote.serviceable && (
              <p className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200"><Clock className="h-4 w-4" />Estimated delivery in ~{quote.etaMinutes} minutes{quote.zone ? ` to ${quote.zone.area}` : ""}</p>
            )}
          </Card>

          {/* Items */}
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-semibold text-ink"><span className="grid h-7 w-7 place-items-center rounded-full bg-saffron-500 text-xs font-bold text-white">2</span>{t("checkout.orderSummary")}</h2>
            <ul className="divide-y divide-line-soft">
              {cart?.items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-3">
                  <ProductImage src={i.product.image} alt={i.product.name} className="h-12 w-12 rounded-xl" sizes={96} />
                  <div className="min-w-0 flex-1"><p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink"><VegMark type={i.product.foodType} />{L(i.product, "name")}</p><p className="text-xs text-muted">{i.variant.label} × {i.quantity}</p></div>
                  <span className="text-sm font-bold tabular-nums">{formatINR(i.lineTotalPaise)}</span>
                </li>
              ))}
            </ul>
            <Textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} rows={2} placeholder={t("checkout.notes")} className="mt-3" aria-label={t("checkout.notes")} />
          </Card>

          {/* Payment */}
          <Card className="p-5">
            <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-semibold text-ink"><span className="grid h-7 w-7 place-items-center rounded-full bg-saffron-500 text-xs font-bold text-white">3</span>{t("checkout.payment")}</h2>
            <div role="radiogroup" className="space-y-3">
              {([
                ["ONLINE", t("checkout.payOnline"), t("checkout.payOnlineHint"), CreditCard, quote?.paymentOptions.online],
                ["COD", t("checkout.cod"), t("checkout.codHint"), Banknote, quote?.paymentOptions.cod],
              ] as const).map(([value, label, hint, Icon, opt]) => (
                <button key={value} type="button" role="radio" aria-checked={method === value} disabled={!opt?.available} onClick={() => setMethod(value)}
                  className={cn("flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-55", method === value ? "border-saffron-500 bg-saffron-50/60 dark:bg-saffron-500/10" : "border-line hover:border-saffron-200")}>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-maroon-700 dark:text-saffron-300"><Icon className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1"><span className="block font-semibold text-ink">{label}</span><span className="block text-xs text-muted">{opt && !opt.available ? opt.reason : hint}</span></span>
                  <span className={cn("grid h-5 w-5 place-items-center rounded-full border-2", method === value ? "border-saffron-500" : "border-line")}>{method === value && <span className="h-2.5 w-2.5 rounded-full bg-saffron-500" />}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <CouponBox />
          {user.loyaltyPoints > 0 && (
            <Card className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-gold-300/30 text-gold-600"><Sparkles className="h-5 w-5" /></span>
                <div>
                  <p className="text-sm font-semibold text-ink">{t("checkout.redeemPoints")}</p>
                  <p className="text-xs text-muted">{user.loyaltyPoints} pts available{loyaltyMax > 0 ? ` · up to ${loyaltyMax} usable` : " · not enough to redeem yet"}</p>
                </div>
              </div>
              <Switch checked={usePoints} onChange={setUsePoints} disabled={loyaltyMax <= 0} label="Use Mithaas points" />
            </Card>
          )}
          {pricing ? <BillSummary pricing={pricing} couponCode={quote?.couponCode} /> : <Card className="h-64 nd-shimmer" />}
          {quote?.blockers.map((b) => <InlineAlert key={b} tone="warning">{b}</InlineAlert>)}
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <Button size="xl" block className="hidden lg:inline-flex" loading={placing} disabled={!quote?.canCheckout || !method || !addressId} onClick={place}>
            {method === "ONLINE" ? t("checkout.pay", { amount: formatINR(pricing?.totalPaise ?? 0) }) : `${t("checkout.placeOrder")} · ${formatINR(pricing?.totalPaise ?? 0)}`}
          </Button>
          <p className="text-center text-[11px] leading-relaxed text-muted">By placing this order you agree to our <Link href="/pages/terms" className="underline">terms</Link> and <Link href="/pages/refund-policy" className="underline">refund policy</Link>. Card details are handled by Razorpay and never stored by NAAMDEV.</p>
        </aside>
      </div>

      <div className="nd-glass fixed inset-x-0 bottom-0 z-50 border-t border-line-soft p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <Button size="xl" block loading={placing} disabled={!quote?.canCheckout || !method || !addressId} onClick={place}>
          {method === "ONLINE" ? t("checkout.pay", { amount: formatINR(pricing?.totalPaise ?? 0) }) : `${t("checkout.placeOrder")} · ${formatINR(pricing?.totalPaise ?? 0)}`}
        </Button>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={t("checkout.addAddress")} size="lg">
        <AddressForm defaultName={user.name} defaultPhone={user.phone} onCancel={addresses.length ? () => setAddOpen(false) : undefined} onSaved={(a) => {
          setAddresses((x) => [a, ...(x ?? []).map((y) => (a.isDefault ? { ...y, isDefault: false } : y))]);
          setAddressId(a.id);
          setAddOpen(false);
          api.get<{ addresses: Address[] }>("/account/addresses").then((r) => setAddresses(r.addresses));
        }} />
      </Modal>
    </div>
  );
}
