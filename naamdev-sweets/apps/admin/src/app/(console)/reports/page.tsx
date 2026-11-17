"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, Field, Input, Select } from "@naamdev/ui";
import { Can, DataTable, Guard, PageHeader } from "@/components/kit";
import { useResource } from "@/lib/use-resource";

const REPORTS = [
  ["sales", "Daily sales summary"], ["orders", "Order register"], ["products", "Product performance"], ["inventory", "Inventory valuation"],
  ["customers", "Customer lifetime value"], ["coupons", "Coupon usage"], ["delivery", "Delivery partner performance"], ["gst", "GST summary"],
] as const;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function ReportsPage() {
  const [type, setType] = useState<string>("sales");
  const [from, setFrom] = useState(iso(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(iso(new Date()));
  const q = { from: new Date(from).toISOString(), to: new Date(to + "T23:59:59").toISOString() };
  const { data, loading, error } = useResource<{ rows: Record<string, unknown>[] }>(`/admin/reports/${type}`, q);
  const download = async () => {
    const r = await fetch(`/api/v1/admin/reports/${type}?format=csv&from=${encodeURIComponent(q.from)}&to=${encodeURIComponent(q.to)}`, { credentials: "include", headers: { "x-nds-app": "admin" } });
    if (!r.ok) return toast.error("Export failed");
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url; a.download = `naamdev-${type}-${from}-to-${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  const cols = data?.rows[0] ? Object.keys(data.rows[0]) : [];
  return (
    <Guard any={["analytics.view", "reports.export"]}>
      <PageHeader title="Reports" subtitle="Monetary values in ₹. Dates use Indian Standard Time." actions={<Can any={["reports.export"]}><Button onClick={download} disabled={!data?.rows.length}><Download className="h-4 w-4" />Export CSV</Button></Can>} />
      <Card className="mb-4 grid gap-4 p-4 sm:grid-cols-3">
        <Field label="Report">{(p) => <Select {...p} value={type} onChange={(e) => setType(e.target.value)}>{REPORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
        <Field label="From">{(p) => <Input {...p} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label="To">{(p) => <Input {...p} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
      </Card>
      <DataTable<Record<string, unknown>> loading={loading} error={error} rows={data?.rows} rowKey={(r) => JSON.stringify(r).slice(0, 80)} columns={cols.map((c) => ({ key: c, header: c.replace(/_/g, " "), cell: (r: Record<string, unknown>) => { const v = r[c]; return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v).toLocaleString("en-IN") : String(v ?? ""); } }))} />
    </Guard>
  );
}
