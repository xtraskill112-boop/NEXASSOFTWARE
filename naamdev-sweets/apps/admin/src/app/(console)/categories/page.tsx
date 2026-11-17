"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { slugify } from "@naamdev/shared";
import { Badge, Button, Checkbox, Field, Input, Modal, Select, Textarea } from "@naamdev/ui";
import { DataTable, Guard, ImageUploader, PageHeader, confirmAction } from "@/components/kit";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

interface C { id: string; name: string; nameHi: string | null; slug: string; description: string | null; imageUrl: string | null; accentColor: string | null; parentId: string | null; parent: { name: string } | null; sortOrder: number; isActive: boolean; gstRate: number | null; _count: { products: number } }

export default function CategoriesPage() {
  const { data, loading, error, reload } = useResource<{ categories: C[] }>("/admin/catalog/categories");
  const [edit, setEdit] = useState<Partial<C> | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!edit) return;
    setBusy(true); setFe({});
    const body = { name: edit.name, nameHi: edit.nameHi || null, slug: edit.slug || undefined, description: edit.description || null, imageUrl: edit.imageUrl || null, accentColor: edit.accentColor || null, parentId: edit.parentId || null, sortOrder: Number(edit.sortOrder ?? 0), isActive: edit.isActive ?? true, gstRate: edit.gstRate == null || (edit.gstRate as unknown) === "" ? null : Number(edit.gstRate) };
    try { if (edit.id) await api.put(`/admin/catalog/categories/${edit.id}`, body); else await api.post("/admin/catalog/categories", body); toast.success("Category saved"); setEdit(null); void reload(); }
    catch (e) { if (e instanceof ApiError) setFe(e.fieldErrors); toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Guard any={["categories.manage"]}>
      <PageHeader title="Categories" actions={<Button onClick={() => setEdit({ isActive: true, sortOrder: (data?.categories.length ?? 0) })}><Plus className="h-4 w-4" />New category</Button>} />
      <DataTable<C> loading={loading} error={error} rows={data?.categories} onRowClick={(r) => setEdit(r)} columns={[
        { key: "n", header: "Category", cell: (r) => <div className="flex items-center gap-3">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={r.imageUrl ?? "/emblem.svg"} alt="" className="h-10 w-10 rounded-full object-cover" style={{ background: r.accentColor ?? undefined }} /><div><p className="font-semibold text-ink">{r.name}</p><p className="text-xs text-muted">/{r.slug}{r.parent ? ` · in ${r.parent.name}` : ""}</p></div></div> },
        { key: "p", header: "Products", align: "right", cell: (r) => r._count.products },
        { key: "g", header: "GST", align: "right", cell: (r) => (r.gstRate != null ? `${r.gstRate}%` : "default") },
        { key: "o", header: "Order", align: "right", cell: (r) => r.sortOrder },
        { key: "a", header: "Status", cell: (r) => <Badge tone={r.isActive ? "success" : "neutral"}>{r.isActive ? "Live" : "Hidden"}</Badge> },
        { key: "d", header: "", align: "right", cell: (r) => <button type="button" aria-label="Delete" className="rounded-lg p-2 text-muted hover:text-maroon-600" onClick={async (e) => { e.stopPropagation(); if (!confirmAction(`Delete ${r.name}?`)) return; try { await api.del(`/admin/catalog/categories/${r.id}`); void reload(); } catch (x) { toast.error(errorMessage(x)); } }}><Trash2 className="h-4 w-4" /></button> },
      ]} />
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit category" : "New category"} size="lg" footer={<div className="flex justify-end"><Button loading={busy} onClick={save}>Save</Button></div>}>
        {edit && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" required error={fe.name}>{(p) => <Input {...p} value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value, slug: edit.id ? edit.slug : slugify(e.target.value) })} />}</Field>
              <Field label="Name (Hindi)">{(p) => <Input {...p} value={edit.nameHi ?? ""} onChange={(e) => setEdit({ ...edit, nameHi: e.target.value })} />}</Field>
              <Field label="Slug" error={fe.slug}>{(p) => <Input {...p} value={edit.slug ?? ""} onChange={(e) => setEdit({ ...edit, slug: slugify(e.target.value) })} />}</Field>
              <Field label="Parent category">{(p) => <Select {...p} value={edit.parentId ?? ""} onChange={(e) => setEdit({ ...edit, parentId: e.target.value || null })}><option value="">None (top level)</option>{data?.categories.filter((c) => c.id !== edit.id && !c.parentId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>
              <Field label="Accent colour" error={fe.accentColor}>{(p) => <Input {...p} type="color" value={edit.accentColor ?? "#F57F0E"} onChange={(e) => setEdit({ ...edit, accentColor: e.target.value.toUpperCase() })} className="h-12 p-1" />}</Field>
              <Field label="GST % (blank = default)">{(p) => <Input {...p} type="number" value={edit.gstRate ?? ""} onChange={(e) => setEdit({ ...edit, gstRate: e.target.value === "" ? null : Number(e.target.value) })} />}</Field>
              <Field label="Sort order">{(p) => <Input {...p} type="number" value={edit.sortOrder ?? 0} onChange={(e) => setEdit({ ...edit, sortOrder: Number(e.target.value) })} />}</Field>
            </div>
            <Field label="Description">{(p) => <Textarea {...p} value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />}</Field>
            <div><p className="mb-2 text-[13px] font-semibold text-ink-soft">Image</p><ImageUploader multiple={false} folder="categories" value={edit.imageUrl ? [edit.imageUrl] : []} onChange={(u) => setEdit({ ...edit, imageUrl: u[0] ?? null })} /></div>
            <Checkbox checked={edit.isActive ?? true} onChange={(v) => setEdit({ ...edit, isActive: v })} label="Visible on store" />
          </div>
        )}
      </Modal>
    </Guard>
  );
}
