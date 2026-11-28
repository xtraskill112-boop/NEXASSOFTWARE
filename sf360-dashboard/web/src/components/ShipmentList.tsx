import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import type { Shipment } from "../types";
import { money, relative } from "../lib/format";
import { StatusBadge } from "./ui";

/** Cards on phones, a table on wider screens. */
export function ShipmentList({ items }: { items: Shipment[] }) {
  return (
    <>
      <ul className="divide-y divide-line overflow-hidden rounded-xl bg-surface ring-1 ring-line md:hidden">
        {items.map((s) => (
          <li key={s.awb}>
            <Link to={`/orders/${encodeURIComponent(s.awb)}`} className="flex items-center gap-3 px-4 py-3 hover:bg-subtle">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium text-ink">{s.customer?.name || s.clientOrderId || s.awb}</span>
                  <StatusBadge group={s.statusGroup} kind={s.kind} />
                </div>
                <p className="mt-0.5 truncate text-xs text-ink-3">
                  {s.awb} · {s.clientOrderId ?? "—"} · {s.customer?.city ?? ""} {s.customer?.pincode ?? ""}
                </p>
                <p className="mt-0.5 text-xs text-ink-3">
                  {s.statusDisplay} · {relative(s.lastEventAt ?? s.updatedAt)}
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="tabular font-medium text-ink">{s.paymentMode === "cod" ? money(s.codAmount) : money(s.productValue)}</p>
                <p className="text-xs text-ink-3">{s.kind === "reverse" ? "Return" : s.paymentMode === "cod" ? "COD" : "Prepaid"}</p>
              </div>
              <ChevronRight className="size-4 text-ink-3" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl bg-surface ring-1 ring-line md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs text-ink-3 uppercase">
            <tr>
              <th className="px-4 py-2 font-medium">Customer</th>
              <th className="px-4 py-2 font-medium">AWB / Order</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">Amount</th>
              <th className="px-4 py-2 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((s) => (
              <tr key={s.awb} className="hover:bg-subtle">
                <td className="px-4 py-2">
                  <Link to={`/orders/${encodeURIComponent(s.awb)}`} className="font-medium text-ink hover:text-brand">
                    {s.customer?.name || "—"}
                  </Link>
                  <p className="text-xs text-ink-3">
                    {s.customer?.city ?? ""} {s.customer?.pincode ?? ""}
                  </p>
                </td>
                <td className="px-4 py-2">
                  <Link to={`/orders/${encodeURIComponent(s.awb)}`} className="font-mono text-xs text-ink hover:text-brand">
                    {s.awb}
                  </Link>
                  <p className="text-xs text-ink-3">{s.clientOrderId ?? "—"}</p>
                </td>
                <td className="px-4 py-2">
                  <StatusBadge group={s.statusGroup} kind={s.kind} />
                  <p className="mt-0.5 text-xs text-ink-3">{s.statusDisplay}</p>
                </td>
                <td className="tabular px-4 py-2 text-right">
                  {s.paymentMode === "cod" ? money(s.codAmount) : money(s.productValue)}
                  <p className="text-xs text-ink-3">{s.kind === "reverse" ? "Return" : s.paymentMode === "cod" ? "COD" : "Prepaid"}</p>
                </td>
                <td className="px-4 py-2 text-xs text-ink-3">{relative(s.lastEventAt ?? s.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
