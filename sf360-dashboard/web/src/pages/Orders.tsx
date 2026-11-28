import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { collection, getDocs, query } from "firebase/firestore";
import { Download, RefreshCw, Search } from "lucide-react";
import { db } from "../firebase";
import { useAppInfo } from "../auth";
import { matchesFilter, shipmentConstraints, useShipments, type ShipmentFilter } from "../hooks/data";
import { api, errorMessage } from "../api";
import { downloadText, shipmentsCsv } from "../lib/csv";
import { DASHBOARD_GROUPS, groupLabel } from "../lib/status";
import { todayIST } from "../lib/format";
import { ShipmentList } from "../components/ShipmentList";
import { Alert, Button, Empty, PageHeader, Select, Spinner, TextInput } from "../components/ui";
import { useToast } from "../components/Toast";
import type { Kind, Shipment, StatusGroup } from "../types";

export function OrdersPage({ kind = "forward" }: { kind?: Kind }) {
  const { env } = useAppInfo();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(params.get("q") ?? "");
  const [max, setMax] = useState(50);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const status = (params.get("status") as StatusGroup | null) ?? "";
  const filter: ShipmentFilter = {
    kind,
    groups: status ? [status] : undefined,
    search: params.get("q") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  };
  const list = useShipments(filter, max);

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
    setMax(50);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const snap = await getDocs(query(collection(db, "shipments"), ...shipmentConstraints(env, filter, 5000)));
      const items = snap.docs.map((d) => d.data() as Shipment).filter((s) => (filter.search ? matchesFilter(s, filter) : true));
      downloadText(`${kind === "reverse" ? "returns" : "orders"}-${todayIST()}.csv`, shipmentsCsv(items));
      toast("good", `Exported ${items.length} rows`);
    } catch (err) {
      toast("critical", errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  /** Looks up an AWB booked outside this app (e.g. in the Shadowfax panel) and adds it. */
  const importAwb = async () => {
    const awb = searchInput.trim();
    setImporting(true);
    try {
      const r = await api.refreshShipment({ awb });
      if (r.ok) navigate(`/orders/${encodeURIComponent(awb)}`);
      else toast("critical", r.message ?? "Not found");
    } catch (err) {
      toast("critical", errorMessage(err));
    } finally {
      setImporting(false);
    }
  };

  const looksLikeAwb = /^[A-Za-z0-9]{8,40}$/.test(searchInput.trim()) && /\d/.test(searchInput);

  return (
    <div className="space-y-4">
      <PageHeader
        title={kind === "reverse" ? "Returns" : "Orders"}
        subtitle="Live list. Search by customer name, phone, order ID or AWB."
        actions={
          <>
            {kind === "reverse" && (
              <Link to="/returns/new" className="inline-flex min-h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-on-brand hover:bg-brand-strong">
                New return pickup
              </Link>
            )}
            <Button icon={<Download className="size-4" />} loading={exporting} onClick={() => void exportCsv()}>
              Export CSV
            </Button>
          </>
        }
      />

      <form
        className="grid grid-cols-1 gap-3 rounded-xl bg-surface p-3 ring-1 ring-line sm:grid-cols-[2fr_1fr_1fr_1fr]"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: searchInput.trim() });
        }}
      >
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <TextInput label="Search" type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Name, phone, order ID or AWB" />
          </div>
          <Button type="submit" aria-label="Search" icon={<Search className="size-4" />} />
        </div>
        <Select label="Status" value={status} onChange={(e) => update({ status: e.target.value })}>
          <option value="">All</option>
          {[...DASHBOARD_GROUPS, "lost" as const, "other" as const].map((g) => (
            <option key={g} value={g}>
              {groupLabel(g, kind)}
            </option>
          ))}
        </Select>
        <TextInput label="Booked from" type="date" value={params.get("from") ?? ""} max={todayIST()} onChange={(e) => update({ from: e.target.value })} />
        <TextInput label="Booked to" type="date" value={params.get("to") ?? ""} max={todayIST()} onChange={(e) => update({ to: e.target.value })} />
      </form>

      {list.error && <Alert tone="critical">{list.error}</Alert>}
      {list.loading ? (
        <Spinner />
      ) : list.items.length ? (
        <>
          <ShipmentList items={list.items} />
          {list.items.length >= max && !filter.search && (
            <div className="text-center">
              <Button onClick={() => setMax((m) => m + 50)}>Load more</Button>
            </div>
          )}
        </>
      ) : (
        <Empty title="Nothing found">
          {filter.search && looksLikeAwb ? (
            <div className="space-y-2">
              <p>Booked this AWB in the Shadowfax panel? Fetch it from Shadowfax:</p>
              <Button icon={<RefreshCw className="size-4" />} loading={importing} onClick={() => void importAwb()}>
                Fetch {searchInput.trim()}
              </Button>
            </div>
          ) : (
            "Try another search or clear the filters."
          )}
        </Empty>
      )}
    </div>
  );
}
