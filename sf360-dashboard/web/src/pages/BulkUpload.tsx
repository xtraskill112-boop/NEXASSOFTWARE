import { useMemo, useState } from "react";
import { Link } from "react-router";
import { collection, doc } from "firebase/firestore";
import Papa from "papaparse";
import { readSheet } from "read-excel-file/browser";
import { Download, FileUp, Play } from "lucide-react";
import { db } from "../firebase";
import { api, errorMessage } from "../api";
import { useAddresses, useBulkJob, useSettings } from "../hooks/data";
import { BULK_COLUMNS, buildBulkOrders, downloadText, missingColumns, rowsFromTable, templateCsv, toCsv, type BulkOrder, type RawRow } from "../lib/csv";
import { Alert, Button, Card, Empty, PageHeader, Segmented, Select } from "../components/ui";
import { todayIST } from "../lib/format";

async function parseFile(file: File): Promise<RawRow[]> {
  if (/\.xlsx$/i.test(file.name)) {
    const data = await readSheet(file);
    return rowsFromTable(data as unknown[][]);
  }
  const text = await file.text();
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
  if (parsed.errors.length && !parsed.data.length) throw new Error(parsed.errors[0].message);
  return rowsFromTable(parsed.data);
}

export function BulkUploadPage() {
  const { settings } = useSettings();
  const addresses = useAddresses();
  const [orderType, setOrderType] = useState<"marketplace" | "warehouse" | null>(null);
  const [returnType, setReturnType] = useState<"seller" | "origin" | null>(null);
  const [pickupId, setPickupId] = useState("");
  const [returnId, setReturnId] = useState("");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<RawRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [sentOrders, setSentOrders] = useState<BulkOrder[]>([]);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const job = useBulkJob(jobId);

  const type = orderType ?? settings.defaultOrderType;
  const rtype = returnType ?? settings.defaultReturnType;
  const pickup = addresses.items.find((a) => a.id === (pickupId || settings.defaultPickupId));
  const ret = addresses.items.find((a) => a.id === (returnId || settings.defaultReturnId || pickup?.id));
  const missing = missingColumns(rows);
  const orders = useMemo(
    () => (pickup && ret && rows.length ? buildBulkOrders(rows, { orderType: type, returnType: rtype, pickup, returnAddress: ret, sellerGstin: settings.sellerGstin }) : []),
    [rows, pickup, ret, type, rtype, settings.sellerGstin],
  );

  const onFile = async (file: File | undefined) => {
    setParseError(null);
    setRows([]);
    setJobId(null);
    if (!file) return;
    setFileName(file.name);
    try {
      const r = await parseFile(file);
      if (r.length > 1000) throw new Error("Please upload at most 500 orders at a time.");
      setRows(r);
    } catch (err) {
      setParseError(errorMessage(err));
    }
  };

  const start = async () => {
    if (!orders.length) return;
    const id = doc(collection(db, "bulkJobs")).id;
    setSentOrders(orders);
    setJobId(id);
    setRunning(true);
    setRunError(null);
    try {
      await api.bulkCreateShipments({ jobId: id, fileName, orders: orders.map((o) => o.payload) });
    } catch (err) {
      setRunError(errorMessage(err));
    } finally {
      setRunning(false);
    }
  };

  const report = () => {
    if (!job) return;
    const lines = [["Order #", "File lines", "Order ID", "Result", "AWB", "Message"]];
    for (const r of job.rows) {
      lines.push([String(r.row), sentOrders[r.row - 1]?.lines.join(" ") ?? "", r.clientOrderId ?? "", r.ok ? "Booked" : "Failed", r.awb ?? "", r.message]);
    }
    downloadText(`bulk-report-${todayIST()}.csv`, toCsv(lines));
  };

  const failedRowsCsv = () => {
    if (!job) return;
    const failedLines = new Set(job.rows.filter((r) => !r.ok).flatMap((r) => sentOrders[r.row - 1]?.lines ?? []));
    const keys = BULK_COLUMNS.map((c) => c.key);
    const out = [keys, ...rows.filter((_, i) => failedLines.has(i + 2)).map((r) => keys.map((k) => r[k] ?? ""))];
    downloadText(`failed-rows-${todayIST()}.csv`, toCsv(out));
  };

  const pct = job && job.total ? Math.round((job.done / job.total) * 100) : 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bulk upload"
        subtitle="Book many orders from a CSV or Excel (.xlsx) file. Each row gets its own result."
        actions={
          <Button icon={<Download className="size-4" />} onClick={() => downloadText("sf360-bulk-template.csv", templateCsv())}>
            Download template
          </Button>
        }
      />

      <Card title="1. Pickup and return for this file">
        {addresses.items.length === 0 ? (
          <Alert tone="warn">
            Save your pickup address first in <Link to="/settings">Settings</Link>.
          </Alert>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-sm font-medium text-ink-2">Order type</p>
              <Segmented label="Order type" value={type} onChange={setOrderType} options={[{ value: "marketplace", label: "Seller pickup" }, { value: "warehouse", label: "Warehouse" }]} />
            </div>
            {type === "marketplace" && (
              <div>
                <p className="mb-1 text-sm font-medium text-ink-2">Failed deliveries go back to</p>
                <Segmented label="Return type" value={rtype} onChange={setReturnType} options={[{ value: "seller", label: "Seller (RTS)" }, { value: "origin", label: "Warehouse (RTO)" }]} />
              </div>
            )}
            <Select label="Pickup address" value={pickup?.id ?? ""} onChange={(e) => setPickupId(e.target.value)} required>
              <option value="">Choose…</option>
              {addresses.items.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} — {a.city} {a.pincode}
                </option>
              ))}
            </Select>
            <Select label="Return address" value={ret?.id ?? ""} onChange={(e) => setReturnId(e.target.value)} required>
              <option value="">Choose…</option>
              {addresses.items.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} — {a.city} {a.pincode}
                </option>
              ))}
            </Select>
          </div>
        )}
      </Card>

      <Card title="2. Choose the file">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line px-4 py-8 text-center hover:border-brand">
          <FileUp className="size-6 text-ink-3" aria-hidden />
          <span className="text-sm font-medium">{fileName || "Tap to choose a .csv or .xlsx file"}</span>
          <span className="text-xs text-ink-3">Up to 500 orders. Same order ID on several rows = several products in one order.</span>
          <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        {parseError && (
          <div className="mt-3">
            <Alert tone="critical">{parseError}</Alert>
          </div>
        )}
        {rows.length > 0 && (
          <div className="mt-3 space-y-2 text-sm">
            <p>
              {rows.length} rows → <b>{orders.length || "?"}</b> orders.
            </p>
            {missing.length > 0 && <Alert tone="critical">Missing columns: {missing.join(", ")}. Use the template.</Alert>}
            {orders.length > 500 && <Alert tone="critical">That is {orders.length} orders — split the file (max 500).</Alert>}
          </div>
        )}
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-brand">Column guide</summary>
          <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {BULK_COLUMNS.map((c) => (
              <li key={c.key}>
                <code className="text-xs">{c.key}</code>
                {c.required && <span className="text-critical">*</span>} — <span className="text-ink-3">{c.help}</span>
              </li>
            ))}
          </ul>
        </details>
      </Card>

      <Card title="3. Book">
        <Button
          variant="primary"
          icon={<Play className="size-4" />}
          loading={running}
          disabled={!orders.length || missing.length > 0 || orders.length > 500 || !pickup || !ret || running}
          onClick={() => void start()}
        >
          Book {orders.length || ""} orders
        </Button>
        {runError && (
          <div className="mt-3">
            <Alert tone="critical">{runError}</Alert>
          </div>
        )}
        {job && (
          <div className="mt-4 space-y-3">
            <div>
              <div className="mb-1 flex justify-between text-sm">
                <span>
                  {job.done} / {job.total} processed · <span className="text-good">{job.succeeded} booked</span> · <span className="text-critical">{job.failed} failed</span>
                </span>
                <span className="tabular">{pct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded bg-subtle" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded bg-brand transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
            {job.stopReason && <Alert tone="warn">Stopped early: {job.stopReason}</Alert>}
            <div className="flex flex-wrap gap-2">
              <Button icon={<Download className="size-4" />} onClick={report} disabled={!job.rows.length}>
                Download report
              </Button>
              {job.failed > 0 && job.status === "done" && (
                <Button icon={<Download className="size-4" />} onClick={failedRowsCsv}>
                  Download failed rows
                </Button>
              )}
            </div>
            {job.rows.length ? (
              <div className="max-h-[28rem] overflow-auto rounded-lg ring-1 ring-line">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-subtle text-xs text-ink-3">
                    <tr>
                      <th className="px-3 py-2">Line</th>
                      <th className="px-3 py-2">Order ID</th>
                      <th className="px-3 py-2">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {job.rows.map((r) => (
                      <tr key={r.row}>
                        <td className="px-3 py-2 text-xs text-ink-3">{sentOrders[r.row - 1]?.lines.join(", ") ?? r.row}</td>
                        <td className="px-3 py-2">{r.clientOrderId ?? "—"}</td>
                        <td className="px-3 py-2">
                          {r.ok ? (
                            <Link to={`/orders/${encodeURIComponent(r.awb ?? "")}`} className="text-good">
                              Booked · {r.awb}
                            </Link>
                          ) : (
                            <span className="text-critical">{r.message}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="Starting…" />
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
