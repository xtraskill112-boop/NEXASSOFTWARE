"use client";
import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import type { Order, PublicSettings } from "@naamdev/api-client";
import { formatINR, PAYMENT_METHOD_LABELS } from "@naamdev/shared";
import { BrandLoader, Button, Logo } from "@naamdev/ui";
import { api } from "@/lib/api";
import { useRouteParam } from "@/lib/route-param";

/** Printable tax invoice (use the browser's "Save as PDF"). */
export default function InvoicePage() {
  const id = useRouteParam("id");
  const [order, setOrder] = useState<Order | null>(null);
  const [s, setS] = useState<PublicSettings | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    api.get<{ order: Order }>(`/orders/${id}`).then((r) => setOrder(r.order)).catch(() => setErr(true));
    api.get<PublicSettings>("/public/settings").then(setS).catch(() => undefined);
  }, [id]);
  if (err) return <p className="p-10 text-center">Invoice not available. Please log in with the account that placed this order.</p>;
  if (!order) return <BrandLoader className="min-h-dvh" />;
  const T = order.totals;
  return (
    <div className="mx-auto max-w-3xl bg-white p-6 text-[13px] text-neutral-800 print:p-0 sm:p-10">
      <div className="no-print mb-6 flex justify-end"><Button onClick={() => window.print()}><Printer className="h-4 w-4" />Print / Save as PDF</Button></div>
      <div className="flex items-start justify-between border-b-2 border-maroon-800 pb-5">
        <div>
          <Logo size="md" tone="dark" />
          <p className="mt-3 font-semibold">{s?.storeProfile.legalName}</p>
          <p className="max-w-xs text-neutral-600">{s?.storeProfile.address}</p>
          {s?.storeProfile.gstin && <p>GSTIN: {s.storeProfile.gstin}</p>}
          {s?.storeProfile.fssaiLicense && <p>FSSAI: {s.storeProfile.fssaiLicense}</p>}
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-bold text-maroon-800">{T.taxPaise > 0 ? "TAX INVOICE" : "INVOICE"}</p>
          <p className="mt-2">Invoice no: <b>{order.invoiceNumber ?? "—"}</b></p>
          <p>Order no: <b>{order.orderNumber}</b></p>
          <p>Date: {new Date(order.confirmedAt ?? order.placedAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}</p>
          <p>Payment: {PAYMENT_METHOD_LABELS[order.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] ?? order.paymentMethod}</p>
        </div>
      </div>
      <div className="mt-5">
        <p className="text-[13px] font-semibold text-neutral-500">Bill to / Ship to</p>
        <p className="font-semibold">{order.address.fullName} · {order.address.phone}</p>
        <p className="text-neutral-600">{[order.address.line1, order.address.line2, order.address.landmark, `${order.address.city}, ${order.address.state} ${order.address.pincode}`].filter(Boolean).join(", ")}</p>
      </div>
      <table className="mt-6 w-full border-collapse">
        <thead><tr className="bg-neutral-100 text-left text-[13px] text-neutral-600"><th className="p-2">Item</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Rate</th><th className="p-2 text-right">Discount</th><th className="p-2 text-right">GST</th><th className="p-2 text-right">Amount</th></tr></thead>
        <tbody>
          {order.items.map((i) => (
            <tr key={i.id} className="border-b border-neutral-200">
              <td className="p-2"><b>{i.name}</b><br /><span className="text-neutral-500">{i.variantLabel} · {i.sku}</span></td>
              <td className="p-2 text-right">{i.quantity}</td>
              <td className="p-2 text-right">{formatINR(i.unitPricePaise)}</td>
              <td className="p-2 text-right">{i.discountPaise ? `−${formatINR(i.discountPaise)}` : "—"}</td>
              <td className="p-2 text-right">{i.gstRate}%<br /><span className="text-neutral-500">{formatINR(i.taxPaise)}</span></td>
              <td className="p-2 text-right font-semibold">{formatINR(i.lineTotalPaise - i.discountPaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto mt-4 w-72 space-y-1">
        <div className="flex justify-between"><span>Subtotal</span><span>{formatINR(T.subtotalPaise)}</span></div>
        {T.couponDiscountPaise > 0 && <div className="flex justify-between"><span>Coupon {order.couponCode}</span><span>−{formatINR(T.couponDiscountPaise)}</span></div>}
        {T.loyaltyDiscountPaise > 0 && <div className="flex justify-between"><span>Mithaas points</span><span>−{formatINR(T.loyaltyDiscountPaise)}</span></div>}
        <div className="flex justify-between"><span>Delivery</span><span>{T.deliveryFeePaise ? formatINR(T.deliveryFeePaise) : "Free"}</span></div>
        {T.taxPaise > 0 && <div className="flex justify-between text-neutral-500"><span>CGST</span><span>{formatINR(Math.floor(T.taxPaise / 2))}</span></div>}
        {T.taxPaise > 0 && <div className="flex justify-between text-neutral-500"><span>SGST</span><span>{formatINR(T.taxPaise - Math.floor(T.taxPaise / 2))}</span></div>}
        <div className="flex justify-between border-t-2 border-maroon-800 pt-2 text-base font-bold"><span>Total</span><span>{formatINR(T.totalPaise)}</span></div>
        {T.taxPaise > 0 && s?.checkout.pricesIncludeTax && <p className="text-right text-[11px] text-neutral-500">Prices are inclusive of GST.</p>}
      </div>
      <p className="mt-12 text-center text-[11px] text-neutral-500">This is a computer-generated invoice. Thank you for choosing NAAMDEV SWEETS — mithaas that feels like home.</p>
    </div>
  );
}
