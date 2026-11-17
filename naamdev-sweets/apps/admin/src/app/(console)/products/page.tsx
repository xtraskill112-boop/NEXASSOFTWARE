"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { formatINR } from "@naamdev/shared";
import { Badge, Pagination, Segmented, Select, Switch, buttonStyles } from "@naamdev/ui";
import { Can, DataTable, Guard, PageHeader, SearchInput, Toolbar } from "@/components/kit";
import { api, errorMessage } from "@/lib/api";
import { useAdmin } from "@/lib/auth";
import { useResource } from "@/lib/use-resource";

interface Row { id: string; name: string; slug: string; sku: string; image: string | null; category: { name: string }; isActive: boolean; deletedAt: string | null; isFeatured: boolean; isBestseller: boolean; isNewArrival: boolean; avgRating: number; reviewCount: number; soldCount: number; variants: { id: string; label: string; pricePaise: number; available: number }[]; totalStock: number; lowStock: boolean }

export default function ProductsPage() {
  const router = useRouter();
  const { can } = useAdmin();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive" | "archived">("all");
  const [stock, setStock] = useState("all");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const cats = useResource<{ categories: { id: string; name: string }[] }>("/admin/catalog/categories");
  const { data, loading, error, reload } = useResource<{ items: Row[]; meta: { totalPages: number; total: number } }>("/admin/catalog/products", { q: q || undefined, status, stock, categoryId: categoryId || undefined, page, pageSize: 25 });
  const flag = async (id: string, patch: Record<string, boolean>) => {
    try { await api.patch(`/admin/catalog/products/${id}/flags`, patch); void reload(); } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <Guard any={["products.view"]}>
      <PageHeader title="Products" subtitle={data ? `${data.meta.total} products` : undefined} actions={<Can any={["products.manage"]}><Link href="/products/new" className={buttonStyles()}><Plus className="h-4 w-4" />New product</Link></Can>} />
      <Toolbar>
        <Segmented size="sm" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "all", label: "All" }, { value: "active", label: "Live" }, { value: "inactive", label: "Hidden" }, { value: "archived", label: "Archived" }]} />
        <Select className="h-10 w-48" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category"><option value="">All categories</option>{cats.data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select className="h-10 w-40" value={stock} onChange={(e) => setStock(e.target.value)} aria-label="Stock"><option value="all">Any stock</option><option value="low">Low stock</option><option value="out">Out of stock</option></Select>
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Name or SKU" className="sm:ml-auto" />
      </Toolbar>
      <DataTable<Row> loading={loading} error={error} rows={data?.items} onRowClick={(r) => router.push(`/products/${r.id}`)} columns={[
        { key: "p", header: "Product", cell: (r) => <div className="flex items-center gap-3">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={r.image ?? "/emblem.svg"} alt="" className="h-11 w-11 rounded-xl object-cover" /><div><p className="font-semibold text-ink">{r.name}</p><p className="text-xs text-muted">{r.sku} · {r.category.name}</p></div></div> },
        { key: "v", header: "Variants", cell: (r) => <p className="text-xs">{r.variants.map((v) => `${v.label} ${formatINR(v.pricePaise)}`).join(" · ")}</p> },
        { key: "s", header: "Stock", align: "right", cell: (r) => <span className="inline-flex items-center gap-2">{r.totalStock}{r.lowStock && <Badge tone="warning">Low</Badge>}</span> },
        { key: "sold", header: "Sold", align: "right", cell: (r) => r.soldCount },
        { key: "f", header: "Bestseller", align: "center", cell: (r) => <span onClick={(e) => e.stopPropagation()}><Switch checked={r.isBestseller} disabled={!can("products.manage")} onChange={(v) => void flag(r.id, { isBestseller: v })} label="Bestseller" /></span> },
        { key: "a", header: "Live", align: "center", cell: (r) => r.deletedAt ? <Badge>Archived</Badge> : <span onClick={(e) => e.stopPropagation()}><Switch checked={r.isActive} disabled={!can("products.manage")} onChange={(v) => void flag(r.id, { isActive: v })} label="Visible on store" /></span> },
      ]} />
      <Pagination page={page} totalPages={data?.meta.totalPages ?? 1} onChange={setPage} className="mt-4" />
    </Guard>
  );
}
