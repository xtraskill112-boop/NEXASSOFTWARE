"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Pagination, Segmented, StatCard } from "@naamdev/ui";
import { DataTable, Guard, PageHeader, SearchInput, Toolbar } from "@/components/kit";
import { dt } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

interface Row { variantId: string; productName: string; image: string | null; category: string; label: string; sku: string; available: number; reserved: number; lowStockThreshold: number; activeBatches: number; nextExpiry: string | null; status: "OK" | "LOW" | "OUT" }

export default function StockPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "low" | "out">("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading, error } = useResource<{ items: Row[]; meta: { totalPages: number }; summary: { variants: number; low: number; out: number; units: number; reserved: number } }>("/admin/inventory/stock", { filter, q: q || undefined, page, pageSize: 30 });
  return (
    <Guard any={["inventory.view"]}>
      <PageHeader title="Stock" subtitle="Variant-level stock. Available = sellable now; reserved = in unshipped orders." />
      {data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Variants tracked" value={data.summary.variants} />
          <StatCard label="Units available" value={data.summary.units.toLocaleString("en-IN")} hint={`${data.summary.reserved} reserved in orders`} />
          <StatCard label="Low stock" value={data.summary.low} />
          <StatCard label="Out of stock" value={data.summary.out} />
        </div>
      )}
      <Toolbar>
        <Segmented size="sm" value={filter} onChange={(v) => { setFilter(v); setPage(1); }} options={[{ value: "all", label: "All" }, { value: "low", label: "Low", count: data?.summary.low }, { value: "out", label: "Out", count: data?.summary.out }]} />
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Product or SKU" className="sm:ml-auto" />
      </Toolbar>
      <DataTable<Row> rowKey={(r) => r.variantId} loading={loading} error={error} rows={data?.items} onRowClick={(r) => router.push(`/inventory/${r.variantId}`)} columns={[
        { key: "p", header: "Product", cell: (r) => <div className="flex items-center gap-3">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={r.image ?? "/emblem.svg"} alt="" className="h-10 w-10 rounded-xl object-cover" /><div><p className="font-semibold text-ink">{r.productName} <span className="font-normal text-muted">· {r.label}</span></p><p className="text-xs text-muted">{r.sku} · {r.category}</p></div></div> },
        { key: "a", header: "Available", align: "right", cell: (r) => <b className="text-ink">{r.available}</b> },
        { key: "r", header: "Reserved", align: "right", cell: (r) => r.reserved },
        { key: "t", header: "Alert at", align: "right", cell: (r) => r.lowStockThreshold },
        { key: "b", header: "Batches", align: "right", cell: (r) => r.activeBatches },
        { key: "e", header: "Next expiry", cell: (r) => <span className="text-xs">{dt(r.nextExpiry)}</span> },
        { key: "s", header: "Status", cell: (r) => <Badge tone={r.status === "OK" ? "success" : r.status === "LOW" ? "warning" : "danger"}>{r.status === "OK" ? "In stock" : r.status === "LOW" ? "Low" : "Out"}</Badge> },
      ]} />
      <Pagination page={page} totalPages={data?.meta.totalPages ?? 1} onChange={setPage} className="mt-4" />
    </Guard>
  );
}
