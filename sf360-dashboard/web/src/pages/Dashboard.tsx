import { Link } from "react-router";
import { ArrowRight, PackagePlus, Upload, Undo2 } from "lucide-react";
import { useAppInfo } from "../auth";
import { useShipments, useStats } from "../hooks/data";
import { count, money, todayIST } from "../lib/format";
import { DASHBOARD_GROUPS, GROUPS, groupLabel } from "../lib/status";
import { Card, Empty, PageHeader, PanelLink, Spinner, StatusBadge, cx } from "../components/ui";
import { ShipmentList } from "../components/ShipmentList";

const TONE_TEXT: Record<string, string> = {
  neutral: "text-ink",
  info: "text-info",
  warn: "text-warn",
  good: "text-good",
  serious: "text-serious",
  critical: "text-critical",
};

/** COD vs prepaid as one segmented bar with labels beside it (identity never by colour alone). */
function PaymentSplit({ cod, prepaid }: { cod: number; prepaid: number }) {
  const total = cod + prepaid;
  if (!total) return <p className="text-sm text-ink-3">No orders yet.</p>;
  const codPct = Math.round((cod / total) * 100);
  return (
    <div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded" role="img" aria-label={`COD ${codPct}%, prepaid ${100 - codPct}%`}>
        {cod > 0 && <div className="h-full rounded-l bg-series-1" style={{ width: `${(cod / total) * 100}%` }} title={`COD: ${count(cod)} orders (${codPct}%)`} />}
        {prepaid > 0 && (
          <div className="h-full rounded-r bg-series-2" style={{ width: `${(prepaid / total) * 100}%` }} title={`Prepaid: ${count(prepaid)} orders (${100 - codPct}%)`} />
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-series-1" aria-hidden /> COD {codPct}%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-series-2" aria-hidden /> Prepaid {100 - codPct}%
        </span>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const info = useAppInfo();
  const { stats, loading } = useStats();
  const today = todayIST();
  const todays = useShipments({ kind: "forward", pickupDate: today }, 20);
  const recent = useShipments({ kind: "forward" }, 6);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        subtitle="Live — updates the moment Shadowfax sends a status."
        actions={
          <>
            <Link to="/new" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-on-brand shadow-sm hover:bg-brand-strong">
              <PackagePlus className="size-4" aria-hidden /> New shipment
            </Link>
            <Link to="/bulk" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-surface px-4 text-sm font-medium text-ink ring-1 ring-line hover:bg-subtle">
              <Upload className="size-4" aria-hidden /> Bulk upload
            </Link>
          </>
        }
      />

      {loading ? (
        <Spinner />
      ) : (
        <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {DASHBOARD_GROUPS.map((g) => (
            <Link
              key={g}
              to={`/orders?status=${g}`}
              className="rounded-xl bg-surface p-4 ring-1 ring-line transition hover:ring-brand"
              title={GROUPS[g].hint}
            >
              <p className="text-xs font-medium text-ink-3">{groupLabel(g, "forward")}</p>
              <p className={cx("tabular mt-1 text-2xl font-semibold", TONE_TEXT[GROUPS[g].tone])}>{count(stats[`forward_${g}`])}</p>
            </Link>
          ))}
        </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="COD vs prepaid" className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-ink-3">COD orders</p>
              <p className="tabular text-xl font-semibold">{count(stats.cod_count)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-3">COD value</p>
              <p className="tabular text-xl font-semibold">{money(stats.cod_amount)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-3">Prepaid orders</p>
              <p className="tabular text-xl font-semibold">{count(stats.prepaid_count)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-3">Prepaid value</p>
              <p className="tabular text-xl font-semibold">{money(stats.prepaid_value)}</p>
            </div>
          </div>
          <div className="mt-4">
            <PaymentSplit cod={stats.cod_count ?? 0} prepaid={stats.prepaid_count ?? 0} />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-subtle px-3 py-2 text-sm">
            <span>
              COD collected on delivered orders: <b className="tabular">{money(stats.cod_delivered_amount)}</b>
            </span>
            <span className="text-xs text-ink-3">Remittance status is not in the API →</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <PanelLink url={info.panelUrl}>COD remittance</PanelLink>
            <PanelLink url={info.panelUrl}>Wallet & billing</PanelLink>
          </div>
        </Card>

        <Card title="Returns" actions={<Link to="/returns" className="text-sm text-brand">View all</Link>}>
          <dl className="space-y-2 text-sm">
            {(["booked", "pickup_pending", "in_transit", "delivered", "ndr", "cancelled"] as const).map((g) => (
              <div key={g} className="flex justify-between">
                <dt className="text-ink-2">{groupLabel(g, "reverse")}</dt>
                <dd className="tabular font-medium">{count(stats[`reverse_${g}`])}</dd>
              </div>
            ))}
          </dl>
          <Link to="/returns/new" className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-brand">
            <Undo2 className="size-4" aria-hidden /> Create return pickup
          </Link>
        </Card>
      </div>
        </>
      )}

      <Card
        title={`Today's pickups (${today})`}
        actions={
          <Link to="/pickups" className="inline-flex items-center gap-1 text-sm text-brand">
            All pending pickups <ArrowRight className="size-4" aria-hidden />
          </Link>
        }
      >
        <p className="mb-3 text-sm text-ink-3">
          Waiting for pickup right now: <b className="text-ink">{count((stats.forward_booked ?? 0) + (stats.forward_pickup_pending ?? 0))}</b>
        </p>
        {todays.loading ? (
          <Spinner />
        ) : todays.items.length ? (
          <ul className="divide-y divide-line text-sm">
            {todays.items.map((s) => (
              <li key={s.awb} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link to={`/orders/${encodeURIComponent(s.awb)}`} className="font-medium text-ink hover:text-brand">
                  {s.customer?.name ?? s.awb} <span className="font-mono text-xs text-ink-3">{s.awb}</span>
                </Link>
                <span className="flex items-center gap-2">
                  {s.pickupSlot && <span className="text-xs text-ink-3">{s.pickupSlot}</span>}
                  <StatusBadge group={s.statusGroup} kind={s.kind} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-3">No orders with today's pickup date.</p>
        )}
      </Card>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold">Recent shipments</h2>
          <Link to="/orders" className="text-sm text-brand">
            All orders
          </Link>
        </div>
        {recent.loading ? <Spinner /> : recent.items.length ? <ShipmentList items={recent.items} /> : <Empty title="No shipments yet">Book your first one from “New shipment”.</Empty>}
      </div>
    </div>
  );
}
