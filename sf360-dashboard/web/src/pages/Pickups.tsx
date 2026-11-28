import { useMemo } from "react";
import { Link } from "react-router";
import { CalendarDays } from "lucide-react";
import { useAppInfo } from "../auth";
import { useShipments } from "../hooks/data";
import { fmtDate, todayIST } from "../lib/format";
import { Alert, Card, Empty, PageHeader, PanelLink, Spinner, StatusBadge } from "../components/ui";
import type { Shipment } from "../types";

/**
 * Shadowfax has no separate "schedule pickup" API: the pickup date/slot is sent with each
 * marketplace order (pickup_date / pickup_slot). This page groups orders that are still waiting for pickup.
 */
export function PickupsPage() {
  const info = useAppInfo();
  const pending = useShipments({ kind: "forward", groups: ["booked", "pickup_pending"] }, 300);
  const today = todayIST();

  const byDay = useMemo(() => {
    const m = new Map<string, Shipment[]>();
    for (const s of pending.items) {
      const key = s.pickupDate ?? "unscheduled";
      m.set(key, [...(m.get(key) ?? []), s]);
    }
    return [...m.entries()].sort(([a], [b]) => (a === "unscheduled" ? 1 : b === "unscheduled" ? -1 : a.localeCompare(b)));
  }, [pending.items]);

  const exceptions = pending.items.filter((s) => ["seller_not_contactable", "pickup_not_attempted", "pickup_on_hold", "seller_initiated_delay"].includes(s.status));

  return (
    <div className="space-y-4">
      <PageHeader title="Pickups" subtitle="Orders waiting to be picked up, grouped by requested pickup date." actions={<PanelLink url={info.panelUrl}>Pickup settings in panel</PanelLink>} />
      <Alert tone="info">
        Pickups are scheduled per order: choose a pickup date and slot when you book (seller-pickup orders). Shadowfax has no separate pickup-scheduling
        API, so manifests and pickup-time settings stay in the Shadowfax panel.
      </Alert>

      {exceptions.length > 0 && (
        <Card title={`Pickup problems (${exceptions.length})`}>
          <ul className="divide-y divide-line text-sm">
            {exceptions.map((s) => (
              <li key={s.awb} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link to={`/orders/${encodeURIComponent(s.awb)}`} className="font-medium hover:text-brand">
                  {s.awb} · {s.customer?.name}
                </Link>
                <span className="text-xs text-serious">{s.statusDisplay}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pending.loading ? (
        <Spinner />
      ) : byDay.length === 0 ? (
        <Empty title="No pending pickups">Everything booked has been picked up.</Empty>
      ) : (
        byDay.map(([day, list]) => (
          <Card
            key={day}
            title={
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="size-4 text-ink-3" aria-hidden />
                {day === "unscheduled" ? "No pickup date given" : day === today ? `Today (${fmtDate(day)})` : fmtDate(day)}
                <span className="text-sm font-normal text-ink-3">· {list.length}</span>
              </span>
            }
          >
            <ul className="divide-y divide-line text-sm">
              {list.map((s) => (
                <li key={s.awb} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link to={`/orders/${encodeURIComponent(s.awb)}`} className="min-w-0 hover:text-brand">
                    <span className="font-medium">{s.customer?.name ?? s.awb}</span> <span className="font-mono text-xs text-ink-3">{s.awb}</span>
                    <p className="text-xs text-ink-3">
                      From {s.pickup?.city ?? "—"} {s.pickup?.pincode ?? ""} {s.pickupSlot ? `· ${s.pickupSlot}` : ""}
                    </p>
                  </Link>
                  <StatusBadge group={s.statusGroup} kind={s.kind} text={s.statusDisplay} />
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
