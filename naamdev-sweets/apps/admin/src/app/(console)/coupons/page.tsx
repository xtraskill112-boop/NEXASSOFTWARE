"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { COUPON_SCOPES, COUPON_TYPES, describeCoupon, formatINR } from "@naamdev/shared";
import { Badge, Button, Checkbox, Field, Input, Modal, Select, Switch, Textarea } from "@naamdev/ui";
import { DataTable, Guard, PageHeader } from "@/components/kit";
import { ApiError, api, dt, errorMessage, rupees, toPaise } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

interface Cp { id: string; code: string; title: string; description: string | null; type: "PERCENTAGE" | "FIXED" | "FREE_DELIVERY"; scope: string; value: number; maxDiscountPaise: number | null; minOrderPaise: number; startsAt: string; endsAt: string; usageLimit: number | null; perUserLimit: number; usedCount: number; firstOrderOnly: boolean; isFestival: boolean; isPublic: boolean; isActive: boolean; products: { id: string; name: string }[]; categories: { id: string; name: string }[]; totalDiscountPaise: number }
type Form = { id?: string; code: string; title: string; description: string; type: string; scope: string; value: string; maxDiscount: string; minOrder: string; startsAt: string; endsAt: string; usageLimit: string; perUserLimit: string; firstOrderOnly: boolean; isFestival: boolean; isPublic: boolean; isActive: boolean; productIds: string[]; categoryIds: string[] };
const today = () => new Date().toISOString().slice(0, 16);

export default function CouponsPage() {
  const { data, loading, error, reload } = useResource<{ coupons: Cp[] }>("/admin/marketing/coupons");
  const cats = useResource<{ categories: { id: string; name: string }[] }>("/admin/catalog/categories");
  const prods = useResource<{ items: { id: string; name: string }[] }>("/admin/catalog/products", { pageSize: 100, status: "active" });
  const [f, setF] = useState<Form | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const open = (c?: Cp) => setF(c ? {
    id: c.id, code: c.code, title: c.title, description: c.description ?? "", type: c.type, scope: c.scope, value: c.type === "FIXED" ? rupees(c.value) : String(c.value), maxDiscount: rupees(c.maxDiscountPaise), minOrder: rupees(c.minOrderPaise),
    startsAt: c.startsAt.slice(0, 16), endsAt: c.endsAt.slice(0, 16), usageLimit: c.usageLimit ? String(c.usageLimit) : "", perUserLimit: String(c.perUserLimit), firstOrderOnly: c.firstOrderOnly, isFestival: c.isFestival, isPublic: c.isPublic, isActive: c.isActive,
    productIds: c.products.map((p) => p.id), categoryIds: c.categories.map((x) => x.id),
  } : { code: "", title: "", description: "", type: "PERCENTAGE", scope: "ALL", value: "10", maxDiscount: "", minOrder: "0", startsAt: today(), endsAt: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16), usageLimit: "", perUserLimit: "1", firstOrderOnly: false, isFestival: false, isPublic: true, isActive: true, productIds: [], categoryIds: [] });
  const save = async () => {
    if (!f) return;
    setBusy(true); setFe({});
    const body = {
      code: f.code, title: f.title, description: f.description || null, type: f.type, scope: f.scope, value: f.type === "FIXED" ? toPaise(f.value) : f.type === "FREE_DELIVERY" ? 0 : Number(f.value),
      maxDiscountPaise: f.maxDiscount ? toPaise(f.maxDiscount) : null, minOrderPaise: toPaise(f.minOrder), startsAt: new Date(f.startsAt).toISOString(), endsAt: new Date(f.endsAt).toISOString(),
      usageLimit: f.usageLimit ? Number(f.usageLimit) : null, perUserLimit: Number(f.perUserLimit || 1), firstOrderOnly: f.firstOrderOnly, isFestival: f.isFestival, isPublic: f.isPublic, isActive: f.isActive, productIds: f.productIds, categoryIds: f.categoryIds,
    };
    try { if (f.id) await api.put(`/admin/marketing/coupons/${f.id}`, body); else await api.post("/admin/marketing/coupons", body); toast.success("Coupon saved"); setF(null); void reload(); }
    catch (e) { if (e instanceof ApiError) setFe(e.fieldErrors); toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const now = Date.now();
  return (
    <Guard any={["coupons.manage"]}>
      <PageHeader title="Coupons & offers" actions={<Button onClick={() => open()}><Plus className="h-4 w-4" />New coupon</Button>} />
      <DataTable<Cp> loading={loading} error={error} rows={data?.coupons} onRowClick={(c) => open(c)} columns={[
        { key: "c", header: "Code", cell: (c) => <div><p className="font-mono font-bold text-ink">{c.code}</p><p className="text-xs text-muted">{c.title}</p></div> },
        { key: "d", header: "Offer", cell: (c) => <p className="text-xs">{describeCoupon(c)}{c.scope !== "ALL" && ` · ${c.scope === "CATEGORY" ? c.categories.map((x) => x.name).join(", ") : `${c.products.length} products`}`}{c.firstOrderOnly && " · first order"}</p> },
        { key: "u", header: "Used", align: "right", cell: (c) => `${c.usedCount}${c.usageLimit ? ` / ${c.usageLimit}` : ""}` },
        { key: "s", header: "Discount given", align: "right", cell: (c) => formatINR(c.totalDiscountPaise) },
        { key: "v", header: "Validity", cell: (c) => <span className="text-xs">{dt(c.startsAt, false)} – {dt(c.endsAt, false)}</span> },
        { key: "st", header: "Status", cell: (c) => <Badge tone={!c.isActive ? "neutral" : new Date(c.endsAt).getTime() < now ? "danger" : new Date(c.startsAt).getTime() > now ? "info" : "success"}>{!c.isActive ? "Paused" : new Date(c.endsAt).getTime() < now ? "Expired" : new Date(c.startsAt).getTime() > now ? "Scheduled" : "Live"}</Badge> },
        { key: "a", header: "Active", align: "center", cell: (c) => <span onClick={(e) => e.stopPropagation()}><Switch checked={c.isActive} onChange={async (v) => { await api.patch(`/admin/marketing/coupons/${c.id}/active`, { isActive: v }); void reload(); }} label="Active" /></span> },
      ]} />
      <Modal open={!!f} onClose={() => setF(null)} title={f?.id ? `Edit ${f.code}` : "New coupon"} size="xl" footer={<div className="flex justify-end"><Button loading={busy} onClick={save}>Save coupon</Button></div>}>
        {f && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code" required error={fe.code}>{(p) => <Input {...p} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} className="font-mono uppercase" />}</Field>
            <Field label="Title" required error={fe.title}>{(p) => <Input {...p} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field>
            <Field label="Type">{(p) => <Select {...p} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{COUPON_TYPES.map((t) => <option key={t} value={t}>{t === "PERCENTAGE" ? "Percentage off" : t === "FIXED" ? "Flat amount off" : "Free delivery"}</option>)}</Select>}</Field>
            {f.type !== "FREE_DELIVERY" && <Field label={f.type === "PERCENTAGE" ? "Percent (%)" : "Amount (₹)"} error={fe.value}>{(p) => <Input {...p} type="number" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />}</Field>}
            {f.type === "PERCENTAGE" && <Field label="Max discount (₹, optional)">{(p) => <Input {...p} type="number" value={f.maxDiscount} onChange={(e) => setF({ ...f, maxDiscount: e.target.value })} />}</Field>}
            <Field label="Minimum order (₹)">{(p) => <Input {...p} type="number" value={f.minOrder} onChange={(e) => setF({ ...f, minOrder: e.target.value })} />}</Field>
            <Field label="Starts" error={fe.startsAt}>{(p) => <Input {...p} type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} />}</Field>
            <Field label="Expires" error={fe.endsAt}>{(p) => <Input {...p} type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} />}</Field>
            <Field label="Total usage limit (blank = unlimited)">{(p) => <Input {...p} type="number" value={f.usageLimit} onChange={(e) => setF({ ...f, usageLimit: e.target.value })} />}</Field>
            <Field label="Uses per customer">{(p) => <Input {...p} type="number" value={f.perUserLimit} onChange={(e) => setF({ ...f, perUserLimit: e.target.value })} />}</Field>
            <Field label="Applies to" error={fe.productIds ?? fe.categoryIds}>{(p) => <Select {...p} value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })}>{COUPON_SCOPES.map((s) => <option key={s} value={s}>{s === "ALL" ? "Entire order" : s === "CATEGORY" ? "Specific categories" : "Specific products"}</option>)}</Select>}</Field>
            <div className="sm:col-span-2"><Field label="Description">{(p) => <Textarea {...p} rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field></div>
            {f.scope !== "ALL" && (
              <div className="max-h-56 overflow-y-auto rounded-2xl border border-line p-2 sm:col-span-2">
                {(f.scope === "CATEGORY" ? cats.data?.categories ?? [] : prods.data?.items ?? []).map((x) => {
                  const key = f.scope === "CATEGORY" ? "categoryIds" : "productIds";
                  const on = f[key].includes(x.id);
                  return <Checkbox key={x.id} checked={on} label={x.name} className="px-2 py-1" onChange={() => setF({ ...f, [key]: on ? f[key].filter((y) => y !== x.id) : [...f[key], x.id] })} />;
                })}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 sm:col-span-2">
              <Checkbox checked={f.firstOrderOnly} onChange={(v) => setF({ ...f, firstOrderOnly: v })} label="First order only" />
              <Checkbox checked={f.isFestival} onChange={(v) => setF({ ...f, isFestival: v })} label="Festival offer" />
              <Checkbox checked={f.isPublic} onChange={(v) => setF({ ...f, isPublic: v })} label="Show in offers list" />
              <Checkbox checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label="Active" />
            </div>
          </div>
        )}
      </Modal>
    </Guard>
  );
}
