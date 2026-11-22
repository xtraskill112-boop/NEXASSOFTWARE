"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, PackagePlus, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, Field, Input, Modal, Select, Skeleton, StatCard } from "@naamdev/ui";
import { Can, DataTable, Guard, PageHeader } from "@/components/kit";
import { api, dt, errorMessage, toPaise } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { useRouteParam } from "@/lib/route-param";

interface Batch { id: string; batchNumber: string; manufacturedAt: string; expiresAt: string; quantity: number; remaining: number; costPricePaise: number; status: string; supplier: { name: string } | null }
interface Txn { id: string; type: string; quantity: number; balanceAfter: number; reason: string | null; orderId: string | null; createdAt: string; batch: { batchNumber: string } | null; createdBy: { name: string } | null }
interface R { variant: { id: string; label: string; sku: string; product: { name: string; shelfLifeDays: number }; inventory: { available: number; reserved: number; lowStockThreshold: number } | null; batches: Batch[] }; history: Txn[]; saleCutoffHours: number }

export default function VariantStock() {
  const variantId = useRouteParam("variantId");
  const { data, reload } = useResource<R>(`/admin/inventory/variants/${variantId}`);
  const suppliers = useResource<{ suppliers: { id: string; name: string }[] }>("/admin/inventory/suppliers");
  const [batchOpen, setBatchOpen] = useState(false);
  const [adjOpen, setAdjOpen] = useState(false);
  const [b, setB] = useState({ batchNumber: "", quantity: "", manufacturedAt: new Date().toISOString().slice(0, 10), expiresAt: "", cost: "", supplierId: "" });
  const [a, setA] = useState({ type: "DAMAGED", quantity: "", batchId: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [threshold, setThreshold] = useState<string>("");
  if (!data) return <Skeleton className="h-[70vh]" />;
  const v = data.variant;
  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); toast.success(ok); await reload(); return true; } catch (e) { toast.error(errorMessage(e)); return false; } finally { setBusy(false); } };
  const defaultExpiry = (mfg: string) => new Date(new Date(mfg).getTime() + v.product.shelfLifeDays * 86400000).toISOString().slice(0, 10);
  return (
    <Guard any={["inventory.view"]}>
      <PageHeader back={<Link href="/inventory" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-muted"><ArrowLeft className="h-3.5 w-3.5" />Stock</Link>} title={`${v.product.name} · ${v.label}`} subtitle={`${v.sku} · shelf life ${v.product.shelfLifeDays} days · batches stop selling ${data.saleCutoffHours}h before expiry`}
        actions={<Can any={["inventory.manage"]}><Button variant="outline" onClick={() => setAdjOpen(true)}><SlidersHorizontal className="h-4 w-4" />Adjust stock</Button><Button onClick={() => { setB({ ...b, expiresAt: defaultExpiry(b.manufacturedAt), batchNumber: `B${Date.now().toString().slice(-6)}` }); setBatchOpen(true); }}><PackagePlus className="h-4 w-4" />Add batch</Button></Can>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Available" value={v.inventory?.available ?? 0} />
        <StatCard label="Reserved in orders" value={v.inventory?.reserved ?? 0} />
        <Card className="p-5"><p className="text-[12px] font-semibold text-muted">Low-stock alert at</p>
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void run(() => api.patch(`/admin/inventory/variants/${variantId}/threshold`, { lowStockThreshold: Number(threshold) }), "Threshold updated"); }}>
            <Input type="number" className="h-10" defaultValue={v.inventory?.lowStockThreshold ?? 10} onChange={(e) => setThreshold(e.target.value)} aria-label="Threshold" />
            <Can any={["inventory.manage"]}><Button size="sm" type="submit" disabled={!threshold}>Save</Button></Can>
          </form>
        </Card>
      </div>
      <h2 className="mb-3 font-display text-xl font-semibold text-ink">Batches (first-expiry-first-out)</h2>
      <DataTable<Batch> rows={v.batches} columns={[
        { key: "n", header: "Batch", cell: (x) => <b className="font-mono text-ink">{x.batchNumber}</b> },
        { key: "m", header: "Manufactured", cell: (x) => dt(x.manufacturedAt, false) },
        { key: "e", header: "Expires", cell: (x) => <span className={new Date(x.expiresAt).getTime() - Date.now() < 2 * 86400000 && x.status === "ACTIVE" ? "font-semibold text-maroon-600" : ""}>{dt(x.expiresAt)}</span> },
        { key: "q", header: "Remaining / qty", align: "right", cell: (x) => `${x.remaining} / ${x.quantity}` },
        { key: "c", header: "Cost/unit", align: "right", cell: (x) => `₹${(x.costPricePaise / 100).toFixed(2)}` },
        { key: "s", header: "Supplier", cell: (x) => x.supplier?.name ?? "—" },
        { key: "st", header: "Status", cell: (x) => <Badge tone={x.status === "ACTIVE" ? "success" : x.status === "EXPIRED" ? "danger" : "neutral"}>{x.status.toLowerCase()}</Badge> },
      ]} />
      <h2 className="mb-3 mt-8 font-display text-xl font-semibold text-ink">Stock history</h2>
      <DataTable<Txn> rows={data.history} columns={[
        { key: "d", header: "When", cell: (t) => <span className="text-xs">{dt(t.createdAt)}</span> },
        { key: "t", header: "Type", cell: (t) => <Badge tone={t.quantity > 0 ? "success" : t.type === "DAMAGED" || t.type === "EXPIRED" ? "danger" : "neutral"}>{t.type.replace("_", " ").toLowerCase()}</Badge> },
        { key: "q", header: "Change", align: "right", cell: (t) => <b className={t.quantity > 0 ? "text-pista-600" : t.quantity < 0 ? "text-maroon-600" : ""}>{t.quantity > 0 ? "+" : ""}{t.quantity}</b> },
        { key: "b", header: "Balance", align: "right", cell: (t) => t.balanceAfter },
        { key: "r", header: "Details", cell: (t) => <span className="text-xs">{t.batch ? `Batch ${t.batch.batchNumber} · ` : ""}{t.reason}{t.orderId ? <> · <Link className="text-maroon-700" href={`/orders/${t.orderId}`}>order</Link></> : ""}{t.createdBy ? ` · ${t.createdBy.name}` : ""}</span> },
      ]} />
      <Modal open={batchOpen} onClose={() => setBatchOpen(false)} title="Add stock batch" footer={<div className="flex justify-end"><Button loading={busy} onClick={async () => { if (await run(() => api.post("/admin/inventory/batches", { variantId, batchNumber: b.batchNumber, quantity: Number(b.quantity), manufacturedAt: new Date(b.manufacturedAt).toISOString(), expiresAt: new Date(b.expiresAt + "T23:59:00").toISOString(), costPricePaise: toPaise(b.cost), supplierId: b.supplierId || null }), "Batch added")) setBatchOpen(false); }}>Add batch</Button></div>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Batch number">{(p) => <Input {...p} value={b.batchNumber} onChange={(e) => setB({ ...b, batchNumber: e.target.value })} />}</Field>
          <Field label="Quantity (units)">{(p) => <Input {...p} type="number" value={b.quantity} onChange={(e) => setB({ ...b, quantity: e.target.value })} />}</Field>
          <Field label="Manufactured">{(p) => <Input {...p} type="date" value={b.manufacturedAt} onChange={(e) => setB({ ...b, manufacturedAt: e.target.value, expiresAt: defaultExpiry(e.target.value) })} />}</Field>
          <Field label="Expires">{(p) => <Input {...p} type="date" value={b.expiresAt} onChange={(e) => setB({ ...b, expiresAt: e.target.value })} />}</Field>
          <Field label="Cost per unit (₹)">{(p) => <Input {...p} type="number" value={b.cost} onChange={(e) => setB({ ...b, cost: e.target.value })} />}</Field>
          <Field label="Supplier">{(p) => <Select {...p} value={b.supplierId} onChange={(e) => setB({ ...b, supplierId: e.target.value })}><option value="">In-house kitchen</option>{suppliers.data?.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field>
        </div>
      </Modal>
      <Modal open={adjOpen} onClose={() => setAdjOpen(false)} title="Adjust stock" description="Removals consume the earliest-expiring batch unless you pick one." footer={<div className="flex justify-end"><Button loading={busy} onClick={async () => {
        const qty = Number(a.quantity);
        const signed = a.type === "RETURNED" ? Math.abs(qty) : a.type === "ADJUSTMENT" ? qty : -Math.abs(qty);
        if (await run(() => api.post("/admin/inventory/adjust", { variantId, type: a.type, quantity: signed, batchId: a.batchId || null, reason: a.reason }), "Stock adjusted")) setAdjOpen(false);
      }}>Apply</Button></div>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">{(p) => <Select {...p} value={a.type} onChange={(e) => setA({ ...a, type: e.target.value })}><option value="DAMAGED">Damaged (remove)</option><option value="EXPIRED">Expired (remove)</option><option value="ADJUSTMENT">Count correction (+/−)</option><option value="RETURNED">Returned to stock (add)</option></Select>}</Field>
          <Field label={a.type === "ADJUSTMENT" ? "Quantity (+ add / − remove)" : "Quantity"}>{(p) => <Input {...p} type="number" value={a.quantity} onChange={(e) => setA({ ...a, quantity: e.target.value })} />}</Field>
          <Field label="Batch">{(p) => <Select {...p} value={a.batchId} onChange={(e) => setA({ ...a, batchId: e.target.value })}><option value="">{a.type === "RETURNED" || (a.type === "ADJUSTMENT" && Number(a.quantity) > 0) ? "Choose batch…" : "Earliest expiring (FEFO)"}</option>{v.batches.filter((x) => x.status === "ACTIVE" || x.status === "DEPLETED").map((x) => <option key={x.id} value={x.id}>{x.batchNumber} · {x.remaining} left · exp {dt(x.expiresAt, false)}</option>)}</Select>}</Field>
          <Field label="Reason">{(p) => <Input {...p} value={a.reason} onChange={(e) => setA({ ...a, reason: e.target.value })} placeholder="e.g. crushed in transit" />}</Field>
        </div>
      </Modal>
    </Guard>
  );
}
