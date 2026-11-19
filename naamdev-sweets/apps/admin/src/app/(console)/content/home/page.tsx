"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { HOME_SECTION_TYPES } from "@naamdev/shared";
import { Badge, Button, Card, Checkbox, Field, Input, Modal, Select, Skeleton, Switch } from "@naamdev/ui";
import { Guard, PageHeader, confirmAction } from "@/components/kit";
import { api, errorMessage } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

interface S { id: string; type: string; title: string; titleHi: string | null; subtitle: string | null; sortOrder: number; isActive: boolean; limit: number; collectionId: string | null; categoryId: string | null; collection: { name: string } | null; category: { name: string } | null }
const label = (t: string) => t.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export default function HomeSectionsPage() {
  const { data, reload } = useResource<{ sections: S[] }>("/admin/marketing/home-sections");
  const cols = useResource<{ collections: { id: string; name: string }[] }>("/admin/catalog/collections");
  const cats = useResource<{ categories: { id: string; name: string }[] }>("/admin/catalog/categories");
  const [e, setE] = useState<Partial<S> | null>(null);
  const body = (s: Partial<S>) => ({ type: s.type, title: s.title, titleHi: s.titleHi || null, subtitle: s.subtitle || null, sortOrder: s.sortOrder ?? 0, isActive: s.isActive ?? true, limit: Number(s.limit ?? 10), collectionId: s.collectionId || null, categoryId: s.categoryId || null });
  const save = async () => {
    if (!e) return;
    try { if (e.id) await api.put(`/admin/marketing/home-sections/${e.id}`, body(e)); else await api.post("/admin/marketing/home-sections", body({ ...e, sortOrder: data?.sections.length ?? 0 })); toast.success("Section saved"); setE(null); void reload(); } catch (x) { toast.error(errorMessage(x)); }
  };
  const move = async (i: number, d: number) => {
    if (!data) return;
    const ids = data.sections.map((s) => s.id);
    [ids[i], ids[i + d]] = [ids[i + d]!, ids[i]!];
    await api.post("/admin/marketing/home-sections/reorder", { ids });
    void reload();
  };
  return (
    <Guard any={["content.manage"]}>
      <PageHeader title="Home page sections" subtitle="Choose which rails appear on the storefront home page, and in what order." actions={<Button onClick={() => setE({ type: "BESTSELLERS", isActive: true, limit: 10 })}><Plus className="h-4 w-4" />Add section</Button>} />
      {!data ? <Skeleton className="h-96" /> : (
        <div className="space-y-2">
          {data.sections.map((s, i) => (
            <Card key={s.id} className="flex items-center gap-3 p-3">
              <div className="flex flex-col"><button type="button" aria-label="Move up" disabled={i === 0} onClick={() => void move(i, -1)} className="p-1 text-muted disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button><button type="button" aria-label="Move down" disabled={i === data.sections.length - 1} onClick={() => void move(i, 1)} className="p-1 text-muted disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button></div>
              <button type="button" onClick={() => setE(s)} className="min-w-0 flex-1 text-left"><p className="font-semibold text-ink">{s.title}</p><p className="text-xs text-muted">{label(s.type)}{s.collection ? ` · ${s.collection.name}` : ""}{s.category ? ` · ${s.category.name}` : ""} · up to {s.limit}</p></button>
              <Badge tone={s.isActive ? "success" : "neutral"}>{s.isActive ? "Visible" : "Hidden"}</Badge>
              <Switch checked={s.isActive} onChange={async (v) => { await api.put(`/admin/marketing/home-sections/${s.id}`, body({ ...s, isActive: v })); void reload(); }} label="Visible" />
              <button type="button" aria-label="Delete section" className="p-2 text-muted hover:text-maroon-600" onClick={async () => { if (confirmAction("Remove this section?")) { await api.del(`/admin/marketing/home-sections/${s.id}`); void reload(); } }}><Trash2 className="h-4 w-4" /></button>
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!e} onClose={() => setE(null)} title={e?.id ? "Edit section" : "Add section"} footer={<div className="flex justify-end"><Button onClick={save}>Save</Button></div>}>
        {e && <div className="space-y-4">
          <Field label="Section type">{(p) => <Select {...p} value={e.type} onChange={(x) => setE({ ...e, type: x.target.value })}>{HOME_SECTION_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>}</Field>
          <Field label="Title">{(p) => <Input {...p} value={e.title ?? ""} onChange={(x) => setE({ ...e, title: x.target.value })} />}</Field>
          <Field label="Title (Hindi)">{(p) => <Input {...p} value={e.titleHi ?? ""} onChange={(x) => setE({ ...e, titleHi: x.target.value })} />}</Field>
          <Field label="Subtitle">{(p) => <Input {...p} value={e.subtitle ?? ""} onChange={(x) => setE({ ...e, subtitle: x.target.value })} />}</Field>
          {e.type === "FESTIVAL_COLLECTION" && <Field label="Collection">{(p) => <Select {...p} value={e.collectionId ?? ""} onChange={(x) => setE({ ...e, collectionId: x.target.value })}><option value="">Choose…</option>{cols.data?.collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>}
          {e.type === "GIFT_HAMPERS" && <Field label="Category">{(p) => <Select {...p} value={e.categoryId ?? ""} onChange={(x) => setE({ ...e, categoryId: x.target.value })}><option value="">Gift hampers (default)</option>{cats.data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>}
          <Field label="Max items">{(p) => <Input {...p} type="number" value={e.limit ?? 10} onChange={(x) => setE({ ...e, limit: Number(x.target.value) })} />}</Field>
          <Checkbox checked={e.isActive ?? true} onChange={(v) => setE({ ...e, isActive: v })} label="Visible" />
        </div>}
      </Modal>
    </Guard>
  );
}
