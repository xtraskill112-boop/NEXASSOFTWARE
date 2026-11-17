"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BANNER_THEMES } from "@naamdev/shared";
import { Badge, Button, Checkbox, Field, Input, Modal, Select, Textarea } from "@naamdev/ui";
import { DataTable, Guard, ImageUploader, PageHeader, confirmAction } from "@/components/kit";
import { api, dt, errorMessage } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

interface B { id: string; title: string; titleHi: string | null; subtitle: string | null; eyebrow: string | null; imageUrl: string | null; ctaLabel: string | null; ctaLink: string | null; theme: string; placement: string; sortOrder: number; startsAt: string | null; endsAt: string | null; isActive: boolean }
const PLACEMENTS = [["HERO", "Hero carousel"], ["OFFER_STRIP", "Offer strip"], ["PROMO_GRID", "Promo grid"]] as const;

export default function BannersPage() {
  const { data, loading, reload } = useResource<{ banners: B[] }>("/admin/marketing/banners");
  const [e, setE] = useState<Partial<B> | null>(null);
  const save = async () => {
    if (!e) return;
    const body = { title: e.title, titleHi: e.titleHi || null, subtitle: e.subtitle || null, eyebrow: e.eyebrow || null, imageUrl: e.imageUrl || null, ctaLabel: e.ctaLabel || null, ctaLink: e.ctaLink || null, theme: e.theme ?? "saffron", placement: e.placement ?? "HERO", sortOrder: Number(e.sortOrder ?? 0), startsAt: e.startsAt ? new Date(e.startsAt).toISOString() : null, endsAt: e.endsAt ? new Date(e.endsAt).toISOString() : null, isActive: e.isActive ?? true };
    try { if (e.id) await api.put(`/admin/marketing/banners/${e.id}`, body); else await api.post("/admin/marketing/banners", body); toast.success("Banner saved"); setE(null); void reload(); } catch (x) { toast.error(errorMessage(x)); }
  };
  return (
    <Guard any={["content.manage"]}>
      <PageHeader title="Banners" subtitle="Hero carousel, offer strip and promo cards on the home page" actions={<Button onClick={() => setE({ isActive: true, theme: "saffron", placement: "HERO", sortOrder: 0 })}><Plus className="h-4 w-4" />New banner</Button>} />
      <DataTable<B> loading={loading} rows={data?.banners} onRowClick={(b) => setE({ ...b, startsAt: b.startsAt?.slice(0, 16) ?? null, endsAt: b.endsAt?.slice(0, 16) ?? null })} columns={[
        { key: "i", header: "", cell: (b) => <div className={`nd-gradient-${b.theme === "maroon" || b.theme === "royal" ? "maroon" : "saffron"} h-10 w-16 overflow-hidden rounded-lg`}>{b.imageUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={b.imageUrl} alt="" className="h-full w-full object-cover opacity-90" />}</div> },
        { key: "t", header: "Banner", cell: (b) => <div><p className="font-semibold text-ink">{b.title}</p><p className="text-xs text-muted">{b.ctaLink}</p></div> },
        { key: "p", header: "Placement", cell: (b) => PLACEMENTS.find((p) => p[0] === b.placement)?.[1] },
        { key: "o", header: "Order", align: "right", cell: (b) => b.sortOrder },
        { key: "s", header: "Schedule", cell: (b) => <span className="text-xs">{b.startsAt || b.endsAt ? `${dt(b.startsAt, false)} – ${dt(b.endsAt, false)}` : "Always"}</span> },
        { key: "a", header: "Status", cell: (b) => <Badge tone={b.isActive ? "success" : "neutral"}>{b.isActive ? "Live" : "Hidden"}</Badge> },
        { key: "d", header: "", align: "right", cell: (b) => <button type="button" aria-label="Delete" className="p-2 text-muted hover:text-maroon-600" onClick={async (x) => { x.stopPropagation(); if (confirmAction("Delete banner?")) { await api.del(`/admin/marketing/banners/${b.id}`); void reload(); } }}><Trash2 className="h-4 w-4" /></button> },
      ]} />
      <Modal open={!!e} onClose={() => setE(null)} title={e?.id ? "Edit banner" : "New banner"} size="lg" footer={<div className="flex justify-end"><Button onClick={save}>Save</Button></div>}>
        {e && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" required>{(p) => <Input {...p} value={e.title ?? ""} onChange={(x) => setE({ ...e, title: x.target.value })} />}</Field>
          <Field label="Title (Hindi)">{(p) => <Input {...p} value={e.titleHi ?? ""} onChange={(x) => setE({ ...e, titleHi: x.target.value })} />}</Field>
          <Field label="Eyebrow">{(p) => <Input {...p} value={e.eyebrow ?? ""} onChange={(x) => setE({ ...e, eyebrow: x.target.value })} placeholder="e.g. Diwali special" />}</Field>
          <Field label="Placement">{(p) => <Select {...p} value={e.placement} onChange={(x) => setE({ ...e, placement: x.target.value })}>{PLACEMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
          <div className="sm:col-span-2"><Field label="Subtitle">{(p) => <Textarea {...p} rows={2} value={e.subtitle ?? ""} onChange={(x) => setE({ ...e, subtitle: x.target.value })} />}</Field></div>
          <Field label="Button label">{(p) => <Input {...p} value={e.ctaLabel ?? ""} onChange={(x) => setE({ ...e, ctaLabel: x.target.value })} />}</Field>
          <Field label="Link" hint="e.g. /collections/winter-specials">{(p) => <Input {...p} value={e.ctaLink ?? ""} onChange={(x) => setE({ ...e, ctaLink: x.target.value })} />}</Field>
          <Field label="Theme">{(p) => <Select {...p} value={e.theme} onChange={(x) => setE({ ...e, theme: x.target.value })}>{BANNER_THEMES.map((t) => <option key={t}>{t}</option>)}</Select>}</Field>
          <Field label="Sort order">{(p) => <Input {...p} type="number" value={e.sortOrder ?? 0} onChange={(x) => setE({ ...e, sortOrder: Number(x.target.value) })} />}</Field>
          <Field label="Show from">{(p) => <Input {...p} type="datetime-local" value={e.startsAt ?? ""} onChange={(x) => setE({ ...e, startsAt: x.target.value })} />}</Field>
          <Field label="Show until">{(p) => <Input {...p} type="datetime-local" value={e.endsAt ?? ""} onChange={(x) => setE({ ...e, endsAt: x.target.value })} />}</Field>
          <div className="sm:col-span-2"><p className="mb-2 text-[13px] font-semibold text-ink-soft">Image</p><ImageUploader multiple={false} folder="content" value={e.imageUrl ? [e.imageUrl] : []} onChange={(u) => setE({ ...e, imageUrl: u[0] ?? null })} /></div>
          <Checkbox checked={e.isActive ?? true} onChange={(v) => setE({ ...e, isActive: v })} label="Live" />
        </div>}
      </Modal>
    </Guard>
  );
}
