"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BANNER_THEMES, slugify } from "@naamdev/shared";
import { Badge, Button, Checkbox, Field, Input, Modal, Select, Textarea } from "@naamdev/ui";
import { DataTable, Guard, ImageUploader, PageHeader, confirmAction } from "@/components/kit";
import { api, errorMessage } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

interface Col { id: string; name: string; nameHi: string | null; slug: string; description: string | null; bannerImageUrl: string | null; theme: string; isFestival: boolean; isActive: boolean; startsAt: string | null; endsAt: string | null; productIds: string[] }

export default function CollectionsPage() {
  const { data, loading, error, reload } = useResource<{ collections: Col[] }>("/admin/catalog/collections");
  const products = useResource<{ items: { id: string; name: string }[] }>("/admin/catalog/products", { pageSize: 100, status: "active" });
  const [edit, setEdit] = useState<Partial<Col> | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!edit) return;
    setBusy(true);
    const body = { name: edit.name, nameHi: edit.nameHi || null, slug: edit.slug || undefined, description: edit.description || null, bannerImageUrl: edit.bannerImageUrl || null, theme: edit.theme ?? "saffron", isFestival: !!edit.isFestival, isActive: edit.isActive ?? true, startsAt: edit.startsAt || null, endsAt: edit.endsAt || null, productIds: edit.productIds ?? [] };
    try { if (edit.id) await api.put(`/admin/catalog/collections/${edit.id}`, body); else await api.post("/admin/catalog/collections", body); toast.success("Collection saved"); setEdit(null); void reload(); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const toggle = (pid: string) => edit && setEdit({ ...edit, productIds: edit.productIds?.includes(pid) ? edit.productIds.filter((x) => x !== pid) : [...(edit.productIds ?? []), pid] });
  return (
    <Guard any={["categories.manage", "content.manage"]}>
      <PageHeader title="Collections" subtitle="Festival and curated collections shown on the home page" actions={<Button onClick={() => setEdit({ isActive: true, theme: "saffron", productIds: [] })}><Plus className="h-4 w-4" />New collection</Button>} />
      <DataTable<Col> loading={loading} error={error} rows={data?.collections} onRowClick={(r) => setEdit({ ...r, startsAt: r.startsAt?.slice(0, 10) ?? null, endsAt: r.endsAt?.slice(0, 10) ?? null })} columns={[
        { key: "n", header: "Collection", cell: (r) => <div><p className="font-semibold text-ink">{r.name}</p><p className="text-xs text-muted">/collections/{r.slug}</p></div> },
        { key: "p", header: "Products", align: "right", cell: (r) => r.productIds.length },
        { key: "t", header: "Type", cell: (r) => r.isFestival ? <Badge tone="brand">Festival</Badge> : <Badge>Curated</Badge> },
        { key: "a", header: "Status", cell: (r) => <Badge tone={r.isActive ? "success" : "neutral"}>{r.isActive ? "Live" : "Hidden"}</Badge> },
        { key: "d", header: "", align: "right", cell: (r) => <button type="button" aria-label="Delete" className="p-2 text-muted hover:text-maroon-600" onClick={async (e) => { e.stopPropagation(); if (confirmAction(`Delete ${r.name}?`)) { await api.del(`/admin/catalog/collections/${r.id}`); void reload(); } }}><Trash2 className="h-4 w-4" /></button> },
      ]} />
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit collection" : "New collection"} size="xl" footer={<div className="flex justify-end"><Button loading={busy} onClick={save}>Save</Button></div>}>
        {edit && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <Field label="Name" required>{(p) => <Input {...p} value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value, slug: edit.id ? edit.slug : slugify(e.target.value) })} />}</Field>
              <Field label="Name (Hindi)">{(p) => <Input {...p} value={edit.nameHi ?? ""} onChange={(e) => setEdit({ ...edit, nameHi: e.target.value })} />}</Field>
              <Field label="Slug">{(p) => <Input {...p} value={edit.slug ?? ""} onChange={(e) => setEdit({ ...edit, slug: slugify(e.target.value) })} />}</Field>
              <Field label="Description">{(p) => <Textarea {...p} value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />}</Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Theme">{(p) => <Select {...p} value={edit.theme} onChange={(e) => setEdit({ ...edit, theme: e.target.value })}>{BANNER_THEMES.map((t) => <option key={t}>{t}</option>)}</Select>}</Field>
                <Field label="Starts">{(p) => <Input {...p} type="date" value={edit.startsAt ?? ""} onChange={(e) => setEdit({ ...edit, startsAt: e.target.value })} />}</Field>
                <Field label="Ends">{(p) => <Input {...p} type="date" value={edit.endsAt ?? ""} onChange={(e) => setEdit({ ...edit, endsAt: e.target.value })} />}</Field>
              </div>
              <div><p className="mb-2 text-[13px] font-semibold text-ink-soft">Banner image</p><ImageUploader multiple={false} folder="content" value={edit.bannerImageUrl ? [edit.bannerImageUrl] : []} onChange={(u) => setEdit({ ...edit, bannerImageUrl: u[0] ?? null })} /></div>
              <Checkbox checked={!!edit.isFestival} onChange={(v) => setEdit({ ...edit, isFestival: v })} label="Festival collection" />
              <Checkbox checked={edit.isActive ?? true} onChange={(v) => setEdit({ ...edit, isActive: v })} label="Visible on store" />
            </div>
            <div>
              <p className="mb-2 text-[13px] font-semibold text-ink-soft">Products ({edit.productIds?.length ?? 0} selected, in order)</p>
              <div className="max-h-[420px] space-y-1 overflow-y-auto rounded-2xl border border-line p-2">
                {products.data?.items.map((p) => <Checkbox key={p.id} checked={!!edit.productIds?.includes(p.id)} onChange={() => toggle(p.id)} label={p.name} className="rounded-lg px-2 py-1.5 hover:bg-surface-2" />)}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </Guard>
  );
}
