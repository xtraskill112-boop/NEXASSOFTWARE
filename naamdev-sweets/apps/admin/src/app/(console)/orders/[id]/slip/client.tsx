"use client";
import { Logo } from "@naamdev/ui";
import { dt } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { useRouteParam } from "@/lib/route-param";

interface R { order: { orderNumber: string; placedAt: string; customerName: string; customerPhone: string; address: Record<string, string | null>; customerNote: string | null; deliveryInstructions: string | null; paymentMethod: string; totals: { totalPaise: number }; items: { id: string; name: string; variantLabel: string; quantity: number; sku: string }[]; allocations: { itemId: string; batches: { batchNumber: string; expiresAt: string; quantity: number; released: boolean }[] }[] } }

/** Printable packing slip with FEFO batch numbers for traceability. */
export default function PackingSlip() {
  const id = useRouteParam("id", 1);
  const { data } = useResource<R>(`/admin/orders/${id}`);
  if (!data) return null;
  const o = data.order;
  return (
    <div className="mx-auto max-w-xl bg-white p-6 text-sm text-black">
      <button type="button" onClick={() => window.print()} className="no-print mb-4 rounded-lg bg-black px-4 py-2 text-white">Print</button>
      <div className="flex items-center justify-between border-b-2 border-black pb-3"><Logo size="sm" tone="dark" /><div className="text-right"><p className="font-mono text-xl font-bold">{o.orderNumber}</p><p>{dt(o.placedAt)}</p></div></div>
      <p className="mt-3 text-lg font-bold">{o.customerName} · {o.customerPhone}</p>
      <p>{[o.address.line1, o.address.line2, o.address.landmark, o.address.city, o.address.pincode].filter(Boolean).join(", ")}</p>
      {o.deliveryInstructions && <p className="italic">Delivery: {o.deliveryInstructions}</p>}
      {o.customerNote && <p className="mt-2 border border-black p-2 font-bold">Kitchen note: {o.customerNote}</p>}
      <table className="mt-4 w-full border-collapse"><thead><tr className="border-b border-black text-left"><th className="py-1">✓</th><th>Item</th><th>Qty</th><th>Batch</th></tr></thead>
        <tbody>{o.items.map((i) => <tr key={i.id} className="border-b border-gray-300"><td className="py-2">☐</td><td><b>{i.name}</b> · {i.variantLabel}<br /><span className="text-xs">{i.sku}</span></td><td className="text-lg font-bold">{i.quantity}</td><td className="text-xs">{o.allocations.find((a) => a.itemId === i.id)?.batches.filter((b) => !b.released).map((b) => `${b.batchNumber} (exp ${new Date(b.expiresAt).toLocaleDateString("en-IN")})`).join(", ")}</td></tr>)}</tbody></table>
      <p className="mt-4 text-lg font-bold">{o.paymentMethod === "COD" ? `COLLECT CASH ₹${(o.totals.totalPaise / 100).toFixed(2)}` : "PREPAID — do not collect cash"}</p>
    </div>
  );
}
