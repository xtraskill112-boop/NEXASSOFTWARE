"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Banknote, CheckCircle2, Clock, CreditCard, Lock, MapPin, Plus, Smartphone, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { Address, Order, PaymentSession, Quote } from "@naamdev/api-client";
import { formatINR } from "@naamdev/shared";
import { BrandLoader, Button, Card, InlineAlert, Modal, Switch, Textarea, VegMark, cn } from "@naamdev/ui";
import { BillSummary } from "@/components/cart/bill-summary";
import { CouponBox } from "@/components/cart/coupon-box";
import { AddressForm } from "@/components/checkout/address-form";
import { PaySheet, type PayMethod, type PlaceResult } from "@/components/checkout/pay-sheet";
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
  const [note, setNote] = useState("");
  const [payOpen, setPayOpen] = useState(false);
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

  /** Places the order for the method chosen in the payment sheet; the server calculates every amount. */
  const placeOrder = async (paymentMethod: PayMethod): Promise<PlaceResult> => {
    if (!addressId || !quote) throw new Error("Choose a delivery address first");
    setError(null);
    try {
      return await api.post<PlaceResult>("/checkout/place-order", {
        addressId, paymentMethod, idempotencyKey: idempotencyKey.current, redeemPoints: usePoints ? user?.loyaltyPoints ?? 0 : 0, customerNote: note || null,
      });
    } catch (e) {
      idempotencyKey.current = crypto.randomUUID();
      void loadQuote();
      throw e;
    }
  };

  const closePay = (placedOrderId: string | null) => {
    setPayOpen(false);
    if (placedOrderId) {
      // A UPI order exists (stock reserved): its page keeps the payment and live status.
      void refresh();
      router.replace(`/account/orders/${placedOrderId}`);
    }
  };

  if (!user || !addresses) return <BrandLoader className="min-h-[70dvh]" label="Preparing checkout" />;
  if (cart && cart.items.length === 0 && !payOpen)
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="font-display text-2xl text-ink">Your cart is empty</p>
        <Link href="/" className="mt-4 inline-block font-semibold text-maroon-700">Continue shopping</Link>
      </div>
    );

  const selected = addresses.find((a) => a.id === addressId);
  const pricing = quote?.pricing;
  const loyaltyMax = pricing?.maxRedeemablePoints ?? 0;
  const options = quote?.paymentOptions;
  const anyMethod = !!options && (options.upi.available || options.cod.available || options.online.available);
  const canPay = !!quote?.canCheckout && !!addressId && anyMethod;
  const payLabel = t("checkout.proceedToPay", { amount: formatINR(pricing?.totalPaise ?? 0) });

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
              <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink"><span className="grid h-7 w-7 place-items-center rounded-full bg-maroon-700 text-xs font-bold text-white">1</span>{t("checkout.deliveryAddress")}</h2>
              <Button variant="ghost" size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" />{t("checkout.addAddress")}</Button>
            </div>
            <div role="radiogroup" className="grid gap-3 sm:grid-cols-2">
              {addresses.map((a) => (
                <button key={a.id} type="button" role="radio" aria-checked={a.id === addressId} onClick={() => setAddressId(a.id)}
                  className={cn("relative rounded-2xl border-2 p-4 text-left transition", a.id === addressId ? "border-maroon-700 bg-surface-2/60 " : "border-line hover:border-ink-soft/40")}>
                  <span className="flex items-center gap-2 text-sm font-bold text-ink"><MapPin className="h-4 w-4 text-maroon-700" />{a.type === "OTHER" ? a.label ?? "Other" : a.type === "HOME" ? "Home" : "Office"}{a.isDefault && <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[12px] text-muted">Default</span>}</span>
                  <span className="mt-1.5 block text-sm text-ink-soft">{a.fullName} · {a.phone}</span>
                  <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{[a.line1, a.line2, a.landmark, a.city, a.pincode].filter(Boolean).join(", ")}</span>
                  {a.serviceable === false && <span className="mt-2 block text-xs font-semibold text-maroon-600">Not deliverable yet</span>}
                  {a.id === addressId && <CheckCircle2 className="absolute right-3 top-3 h-5 w-5 text-maroon-700" />}
                </button>
              ))}
            </div>
            {quote && selected && quote.serviceable && (
              <p className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200"><Clock className="h-4 w-4" />Estimated delivery in ~{quote.etaMinutes} minutes{quote.zone ? ` to ${quote.zone.area}` : ""}</p>
            )}
          </Card>

          {/* Items */}
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-semibold text-ink"><span className="grid h-7 w-7 place-items-center rounded-full bg-maroon-700 text-xs font-bold text-white">2</span>{t("checkout.orderSummary")}</h2>
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
            <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-semibold text-ink"><span className="grid h-7 w-7 place-items-center rounded-full bg-maroon-700 text-xs font-bold text-white">3</span>{t("checkout.payment")}</h2>
            <div className="flex flex-wrap gap-2">
              {([
                ["UPI", t("checkout.payUpi"), Smartphone, options?.upi],
                ["COD", t("checkout.cod"), Banknote, options?.cod],
                ["ONLINE", t("checkout.payOnline"), CreditCard, options?.online],
              ] as const).filter(([, , , opt]) => opt?.available).map(([value, label, Icon]) => (
                <span key={value} className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 px-3 py-2 text-sm font-semibold text-ink-soft"><Icon className="h-4 w-4 text-maroon-700 dark:text-maroon-200" />{label}</span>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">{anyMethod || !options ? t("checkout.paymentNext") : options.upi.reason ?? options.cod.reason ?? "Payments are unavailable right now"}</p>
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
          <Button size="xl" block className="hidden lg:inline-flex" disabled={!canPay} onClick={() => setPayOpen(true)}><Lock className="h-4 w-4" />{payLabel}</Button>
          <p className="text-center text-[11px] leading-relaxed text-muted">By placing this order you agree to our <Link href="/pages/terms" className="underline">terms</Link> and <Link href="/pages/refund-policy" className="underline">refund policy</Link>. {options?.online.available ? "Card details are handled by Razorpay and never stored by NAAMDEV." : "UPI payments go directly to the shop's UPI ID and are confirmed by our team."}</p>
        </aside>
      </div>

      <div className="nd-glass fixed inset-x-0 bottom-0 z-50 border-t border-line-soft p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <Button size="xl" block disabled={!canPay} onClick={() => setPayOpen(true)}><Lock className="h-4 w-4" />{payLabel}</Button>
      </div>

      {options && pricing && (
        <PaySheet
          open={payOpen} amountPaise={pricing.totalPaise} options={options} contact={user.email ?? user.phone ?? ""}
          place={placeOrder} onCodPlaced={(id) => { setPayOpen(false); finish(id); }}
          onOnline={(session) => { setPayOpen(false); void pay(session); }} onClose={closePay}
        />
      )}

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
