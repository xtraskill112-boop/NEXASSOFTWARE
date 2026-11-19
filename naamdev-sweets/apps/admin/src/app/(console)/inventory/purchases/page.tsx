"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatINR } from "@naamdev/shared";
import { Button, Field, Input, Modal, Pagination, Select, Textarea } from "@naamdev/ui";
import { Can, DataTable, Guard, PageHeader } from "@/components/kit";
import { api, dt, errorMessage, toPaise } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

interface P { id: string; purchaseNumber: string; invoiceNumber: string | null; purchasedAt: string; totalPaise: number; supplier: { name: string } | null; createdBy: { name: string } | null; items: { id: string; quantity: number; variant: { label: string; product: { name: string } } }[] }
interface Line { variantId: string; quantity: string; cost: string; batchNumber: string; manufacturedAt: string; expiresAt: string }

export default function PurchasesPage() {
  const [page, setPage] = useState(1);
  const { data, loading, reload } = useResource<{ items: P[]; meta: { totalPages: number } }>("/admin/inventory/purchases", { page });
  const suppliers = useResource<{ suppliers: { id: string; name: string }[] }>("/admin/inventory/suppliers");
  const variants = useResource<{ items: { variantId: string; productName: string; label: string }[] }>("/admin/inventory/stock", { pageSize: 100 });
  const [open, setOpen] = useState(false);
  const [head, setHead] = useState({ supplierId: "", invoiceNumber: "", notes: "" });
  const today = new Date().toISOString().slice(0, 10);
  const blank = (): Line => ({ variantId: "", quantity: "", cost: "", batchNumber: `P${Date.now().toString().slice(-6)}`, manufacturedAt: today, expiresAt: "" });
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [busy, setBusy] = useState(false);
  const total = lines.reduce((s, l) => s + toPaise(l.cost) * Number(l.quantity || 0), 0);
  const submit = async () => {
    setBusy(true);
    try {
      await api.post("/admin/inventory/purchases", { supplierId: head.supplierId || null, invoiceNumber: head.invoiceNumber || null, notes: head.notes || null, items: lines.map((l) => ({ variantId: l.variantId, quantity: Number(l.quantity), costPricePaise: toPaise(l.cost), batchNumber: l.batchNumber, manufacturedAt: new Date(l.manufacturedAt).toISOString(), expiresAt: new Date(l.expiresAt + "T23:59:00").toISOString() })) });
      toast.success("Purchase recorded — stock added as new batches");
      setOpen(false); setLines([blank()]); void reload();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Guard any={["inventory.view"]}>
      <PageHeader title="Purchases" subtitle="Inward stock from suppliers. Each line creates a traceable batch." actions={<Can any={["inventory.manage"]}><Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Record purchase</Button></Can>} />
      <DataTable<P> loading={loading} rows={data?.items} columns={[
        { key: "n", header: "Purchase", cell: (p) => <div><p className="font-mono font-bold text-ink">{p.purchaseNumber}</p><p className="text-xs text-muted">{dt(p.purchasedAt, false)}{p.invoiceNumber ? ` · inv ${p.invoiceNumber}` : ""}</p></div> },
        { key: "s", header: "Supplier", cell: (p) => p.supplier?.name ?? "In-house" },
        { key: "i", header: "Items", cell: (p) => <p className="text-xs">{p.items.map((i) => `${i.quantity}× ${i.variant.product.name} ${i.variant.label}`).join(", ")}</p> },
        { key: "t", header: "Value", align: "right", cell: (p) => formatINR(p.totalPaise) },
        { key: "b", header: "By", cell: (p) => p.createdBy?.name ?? "—" },
      ]} />
      <Pagination page={page} totalPages={data?.meta.totalPages ?? 1} onChange={setPage} className="mt-4" />
      <Modal open={open} onClose={() => setOpen(false)} title="Record purchase" size="xl" footer={<div className="flex items-center justify-between"><span className="text-sm text-muted">Total {formatINR(total)}</span><Button loading={busy} disabled={lines.some((l) => !l.variantId || !l.quantity || !l.expiresAt)} onClick={submit}>Save purchase</Button></div>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Supplier">{(p) => <Select {...p} value={head.supplierId} onChange={(e) => setHead({ ...head, supplierId: e.target.value })}><option value="">In-house kitchen</option>{suppliers.data?.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field>
          <Field label="Supplier invoice no.">{(p) => <Input {...p} value={head.invoiceNumber} onChange={(e) => setHead({ ...head, invoiceNumber: e.target.value })} />}</Field>
        </div>
        <div className="mt-4 space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="grid gap-2 rounded-2xl border border-line p-3 sm:grid-cols-6">
              <div className="sm:col-span-2"><Select className="h-10" value={l.variantId} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, variantId: e.target.value } : x)))} aria-label="Variant"><option value="">Product & weight…</option>{variants.data?.items.map((v) => <option key={v.variantId} value={v.variantId}>{v.productName} · {v.label}</option>)}</Select></div>
              <Input className="h-10" type="number" placeholder="Qty" value={l.quantity} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, quantity: e.target.value } : x)))} aria-label="Quantity" />
              <Input className="h-10" type="number" placeholder="Cost ₹/unit" value={l.cost} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, cost: e.target.value } : x)))} aria-label="Cost" />
              <Input className="h-10" value={l.batchNumber} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, batchNumber: e.target.value } : x)))} aria-label="Batch number" />
              <div className="flex gap-1"><Input className="h-10" type="date" value={l.expiresAt} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, expiresAt: e.target.value } : x)))} aria-label="Expiry date" />{lines.length > 1 && <Button variant="ghost" size="icon-sm" aria-label="Remove line" onClick={() => setLines(lines.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button>}</div>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setLines([...lines, blank()])}><Plus className="h-4 w-4" />Add line</Button>
        </div>
        <Textarea className="mt-4" placeholder="Notes" value={head.notes} onChange={(e) => setHead({ ...head, notes: e.target.value })} />
      </Modal>
    </Guard>
  );
}
