"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, Segmented } from "@naamdev/ui";
import { DataTable, Guard, PageHeader, type Column } from "@/components/kit";
import { dt } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

interface B { id: string; batchNumber: string; expiresAt: string; remaining: number; status: string; variantId: string; variant: { label: string; product: { name: string } }; supplier?: { name: string } | null }

export default function ExpiryPage() {
  const [days, setDays] = useState<"1" | "3" | "7" | "14">("3");
  const { data, loading } = useResource<{ expiring: B[]; recentlyExpired: B[]; saleCutoffHours: number }>("/admin/inventory/batches/expiring", { days });
  const cols: Column<B>[] = [
    { key: "p", header: "Product", cell: (b: B) => <Link href={`/inventory/${b.variantId}`} className="font-semibold text-ink hover:underline">{b.variant.product.name} · {b.variant.label}</Link> },
    { key: "n", header: "Batch", cell: (b: B) => <span className="font-mono">{b.batchNumber}</span> },
    { key: "r", header: "Units", align: "right", cell: (b: B) => b.remaining },
    { key: "e", header: "Expires", cell: (b: B) => { const h = (new Date(b.expiresAt).getTime() - Date.now()) / 3600000; return <span className="flex items-center gap-2">{dt(b.expiresAt)}<Badge tone={h < 24 ? "danger" : h < 72 ? "warning" : "info"}>{h < 0 ? "expired" : h < 24 ? `${Math.round(h)}h left` : `${Math.round(h / 24)}d left`}</Badge></span>; } },
  ];
  return (
    <Guard any={["inventory.view"]}>
      <PageHeader title="Expiry management" subtitle={data ? `Batches are automatically withdrawn from sale ${data.saleCutoffHours} hours before expiry. Use offers or staff sales to clear stock that's close to expiring.` : undefined} />
      <Segmented value={days} onChange={setDays} size="sm" className="mb-4" options={[{ value: "1", label: "24 hours" }, { value: "3", label: "3 days" }, { value: "7", label: "7 days" }, { value: "14", label: "14 days" }]} />
      <DataTable<B> loading={loading} rows={data?.expiring} columns={cols} />
      <h2 className="mb-3 mt-8 font-display text-xl font-semibold text-ink">Expired in the last 7 days (written off)</h2>
      <DataTable<B> loading={loading} rows={data?.recentlyExpired} columns={cols.slice(0, 2).concat([{ key: "e", header: "Expired", cell: (b: B) => dt(b.expiresAt) }])} />
    </Guard>
  );
}
