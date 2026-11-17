"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Checkbox, Field, Input, Modal, Textarea } from "@naamdev/ui";
import { Can, DataTable, Guard, PageHeader } from "@/components/kit";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

interface S { id: string; name: string; contactPerson: string | null; phone: string | null; email: string | null; gstin: string | null; address: string | null; notes: string | null; isActive: boolean; _count: { purchases: number; batches: number } }

export default function SuppliersPage() {
  const { data, loading, reload } = useResource<{ suppliers: S[] }>("/admin/inventory/suppliers");
  const [e, setE] = useState<Partial<S> | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const save = async () => {
    if (!e) return;
    setFe({});
    const body = { name: e.name, contactPerson: e.contactPerson || null, phone: e.phone || null, email: e.email || null, gstin: e.gstin || null, address: e.address || null, notes: e.notes || null, isActive: e.isActive ?? true };
    try { if (e.id) await api.put(`/admin/inventory/suppliers/${e.id}`, body); else await api.post("/admin/inventory/suppliers", body); toast.success("Supplier saved"); setE(null); void reload(); }
    catch (x) { if (x instanceof ApiError) setFe(x.fieldErrors); toast.error(errorMessage(x)); }
  };
  return (
    <Guard any={["inventory.view"]}>
      <PageHeader title="Suppliers" actions={<Can any={["suppliers.manage"]}><Button onClick={() => setE({ isActive: true })}><Plus className="h-4 w-4" />Add supplier</Button></Can>} />
      <DataTable<S> loading={loading} rows={data?.suppliers} onRowClick={(r) => setE(r)} columns={[
        { key: "n", header: "Supplier", cell: (s) => <div><p className="font-semibold text-ink">{s.name}</p><p className="text-xs text-muted">{s.contactPerson ?? ""} {s.phone ?? ""}</p></div> },
        { key: "g", header: "GSTIN", cell: (s) => s.gstin ?? "—" },
        { key: "p", header: "Purchases", align: "right", cell: (s) => s._count.purchases },
        { key: "b", header: "Batches", align: "right", cell: (s) => s._count.batches },
        { key: "a", header: "Status", cell: (s) => <Badge tone={s.isActive ? "success" : "neutral"}>{s.isActive ? "Active" : "Inactive"}</Badge> },
      ]} />
      <Modal open={!!e} onClose={() => setE(null)} title={e?.id ? "Edit supplier" : "Add supplier"} footer={<div className="flex justify-end"><Button onClick={save}>Save</Button></div>}>
        {e && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required error={fe.name}>{(p) => <Input {...p} value={e.name ?? ""} onChange={(x) => setE({ ...e, name: x.target.value })} />}</Field>
          <Field label="Contact person">{(p) => <Input {...p} value={e.contactPerson ?? ""} onChange={(x) => setE({ ...e, contactPerson: x.target.value })} />}</Field>
          <Field label="Phone">{(p) => <Input {...p} value={e.phone ?? ""} onChange={(x) => setE({ ...e, phone: x.target.value })} />}</Field>
          <Field label="Email" error={fe.email}>{(p) => <Input {...p} value={e.email ?? ""} onChange={(x) => setE({ ...e, email: x.target.value })} />}</Field>
          <Field label="GSTIN" error={fe.gstin}>{(p) => <Input {...p} value={e.gstin ?? ""} onChange={(x) => setE({ ...e, gstin: x.target.value.toUpperCase() })} />}</Field>
          <Field label="Address">{(p) => <Input {...p} value={e.address ?? ""} onChange={(x) => setE({ ...e, address: x.target.value })} />}</Field>
          <div className="sm:col-span-2"><Textarea placeholder="Notes" value={e.notes ?? ""} onChange={(x) => setE({ ...e, notes: x.target.value })} /></div>
          <Checkbox checked={e.isActive ?? true} onChange={(v) => setE({ ...e, isActive: v })} label="Active" />
        </div>}
      </Modal>
    </Guard>
  );
}
