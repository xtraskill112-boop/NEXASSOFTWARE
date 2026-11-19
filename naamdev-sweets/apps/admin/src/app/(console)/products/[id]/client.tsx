"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Archive, ArrowLeft, ExternalLink, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { FOOD_TYPES, slugify } from "@naamdev/shared";
import { Badge, Button, Card, Checkbox, Field, InlineAlert, Input, Select, Skeleton, Spinner, Switch, Textarea } from "@naamdev/ui";
import { Guard, ImageUploader, PageHeader, confirmAction } from "@/components/kit";
import { ApiError, STOREFRONT_URL, api, errorMessage, rupees, toPaise } from "@/lib/api";
import { useAdmin } from "@/lib/auth";
import { useResource } from "@/lib/use-resource";
import { useRouteParam } from "@/lib/route-param";

interface V { id?: string; label: string; weightGrams: string; sku: string; barcode: string; mrp: string; sale: string; isActive: boolean; isDefault: boolean; lowStockThreshold: string; available?: number }
interface F {
  name: string; nameHi: string; slug: string; shortDescription: string; shortDescriptionHi: string; description: string; categoryId: string; subcategoryId: string; sku: string; barcode: string; hsnCode: string;
  ingredients: string; allergens: string; nutrition: { k: string; v: string }[]; manufacturingInfo: string; shelfLifeDays: string; storageInstructions: string; foodType: string;
  isFeatured: boolean; isBestseller: boolean; isNewArrival: boolean; isActive: boolean; tags: string; videoUrl: string; gstRate: string; seoTitle: string; seoDescription: string; images: string[]; variants: V[];
}
const blankVariant = (sku: string, n: number): V => ({ label: "", weightGrams: "", sku: sku ? `${sku}-${n}` : "", barcode: "", mrp: "", sale: "", isActive: true, isDefault: n === 1, lowStockThreshold: "10" });
const EMPTY: F = { name: "", nameHi: "", slug: "", shortDescription: "", shortDescriptionHi: "", description: "", categoryId: "", subcategoryId: "", sku: "", barcode: "", hsnCode: "", ingredients: "", allergens: "", nutrition: [], manufacturingInfo: "", shelfLifeDays: "7", storageInstructions: "", foodType: "VEG", isFeatured: false, isBestseller: false, isNewArrival: true, isActive: true, tags: "", videoUrl: "", gstRate: "", seoTitle: "", seoDescription: "", images: [], variants: [blankVariant("", 1)] };

export default function ProductEditor() {
  const id = useRouteParam("id");
  const isNew = id === "new";
  const router = useRouter();
  const { can } = useAdmin();
  const editable = can("products.manage");
  const cats = useResource<{ categories: { id: string; name: string; parentId: string | null }[] }>("/admin/catalog/categories");
  const [f, setF] = useState<F | null>(isNew ? EMPTY : null);
  const [meta, setMeta] = useState<{ deletedAt: string | null; slug: string } | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);

  useEffect(() => {
    if (isNew) return;
    api.get<{ product: Record<string, never> & { variants: { id: string; label: string; weightGrams: number | null; sku: string; barcode: string | null; mrpPaise: number; salePricePaise: number | null; isActive: boolean; isDefault: boolean; inventory: { lowStockThreshold: number; available: number } | null }[]; images: { url: string }[]; allergens: string[]; tags: string[]; nutrition: Record<string, string> | null; deletedAt: string | null } }>(`/admin/catalog/products/${id}`).then(({ product: p }) => {
      const s = (k: string) => (p[k] as string | null) ?? "";
      setMeta({ deletedAt: p.deletedAt, slug: s("slug") });
      setF({
        name: s("name"), nameHi: s("nameHi"), slug: s("slug"), shortDescription: s("shortDescription"), shortDescriptionHi: s("shortDescriptionHi"), description: s("description"), categoryId: s("categoryId"), subcategoryId: s("subcategoryId"),
        sku: s("sku"), barcode: s("barcode"), hsnCode: s("hsnCode"), ingredients: s("ingredients"), allergens: p.allergens.join(", "), nutrition: Object.entries(p.nutrition ?? {}).map(([k, v]) => ({ k, v })),
        manufacturingInfo: s("manufacturingInfo"), shelfLifeDays: String(p["shelfLifeDays"]), storageInstructions: s("storageInstructions"), foodType: s("foodType"),
        isFeatured: !!p["isFeatured"], isBestseller: !!p["isBestseller"], isNewArrival: !!p["isNewArrival"], isActive: !!p["isActive"], tags: p.tags.join(", "), videoUrl: s("videoUrl"),
        gstRate: p["gstRate"] == null ? "" : String(p["gstRate"]), seoTitle: s("seoTitle"), seoDescription: s("seoDescription"), images: p.images.map((i) => i.url),
        variants: p.variants.map((v) => ({ id: v.id, label: v.label, weightGrams: v.weightGrams ? String(v.weightGrams) : "", sku: v.sku, barcode: v.barcode ?? "", mrp: rupees(v.mrpPaise), sale: rupees(v.salePricePaise), isActive: v.isActive, isDefault: v.isDefault, lowStockThreshold: String(v.inventory?.lowStockThreshold ?? 10), available: v.inventory?.available })),
      });
    }).catch((e) => toast.error(errorMessage(e)));
  }, [id, isNew]);

  if (!f) return <Skeleton className="h-[80vh]" />;
  const set = <K extends keyof F>(k: K, v: F[K]) => setF((x) => (x ? { ...x, [k]: v } : x));
  const setV = (i: number, patch: Partial<V>) => setF((x) => (x ? { ...x, variants: x.variants.map((v, k) => (k === i ? { ...v, ...patch } : patch.isDefault ? { ...v, isDefault: false } : v)) } : x));
  const err = (k: string) => fe[k];

  const save = async () => {
    setBusy(true); setFe({});
    const body = {
      name: f.name, nameHi: f.nameHi || null, slug: f.slug || undefined, shortDescription: f.shortDescription, shortDescriptionHi: f.shortDescriptionHi || null, description: f.description,
      categoryId: f.categoryId, subcategoryId: f.subcategoryId || null, sku: f.sku, barcode: f.barcode || null, hsnCode: f.hsnCode || null, ingredients: f.ingredients,
      allergens: f.allergens.split(",").map((s) => s.trim()).filter(Boolean), nutrition: f.nutrition.length ? Object.fromEntries(f.nutrition.filter((n) => n.k.trim()).map((n) => [n.k.trim(), n.v.trim()])) : null,
      manufacturingInfo: f.manufacturingInfo || null, shelfLifeDays: Number(f.shelfLifeDays), storageInstructions: f.storageInstructions, foodType: f.foodType,
      isFeatured: f.isFeatured, isBestseller: f.isBestseller, isNewArrival: f.isNewArrival, isActive: f.isActive, tags: f.tags.split(",").map((s) => s.trim()).filter(Boolean),
      videoUrl: f.videoUrl || null, gstRate: f.gstRate === "" ? null : Number(f.gstRate), seoTitle: f.seoTitle || null, seoDescription: f.seoDescription || null,
      images: f.images.map((url) => ({ url, alt: f.name })),
      variants: f.variants.map((v) => ({ id: v.id, label: v.label, weightGrams: v.weightGrams ? Number(v.weightGrams) : null, sku: v.sku, barcode: v.barcode || null, mrpPaise: toPaise(v.mrp), salePricePaise: v.sale ? toPaise(v.sale) : null, isActive: v.isActive, isDefault: v.isDefault, lowStockThreshold: Number(v.lowStockThreshold || 0) })),
    };
    try {
      const r = isNew ? await api.post<{ product: { id: string } }>("/admin/catalog/products", body) : await api.put<{ product: { id: string } }>(`/admin/catalog/products/${id}`, body);
      toast.success("Product saved");
      if (isNew) router.replace(`/products/${r.product.id}`);
    } catch (e) {
      if (e instanceof ApiError) setFe(e.fieldErrors);
      toast.error(errorMessage(e));
    } finally { setBusy(false); }
  };

  const uploadVideo = async (file: File) => {
    setVideoBusy(true);
    try { const r = await api.upload<{ file: { url: string } }>("/admin/uploads/video", file); set("videoUrl", r.file.url.startsWith("http") ? r.file.url : `${window.location.origin}${r.file.url}`); toast.success("Video uploaded"); }
    catch (e) { toast.error(errorMessage(e)); } finally { setVideoBusy(false); }
  };

  const topCats = cats.data?.categories.filter((c) => !c.parentId) ?? [];
  const subCats = cats.data?.categories.filter((c) => c.parentId === f.categoryId) ?? [];

  return (
    <Guard any={["products.view"]}>
      <PageHeader
        back={<Link href="/products" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />Products</Link>}
        title={isNew ? "New product" : f.name || "Product"}
        subtitle={meta?.deletedAt ? <Badge tone="danger">Archived</Badge> : !isNew ? <a href={`${STOREFRONT_URL}/product/${meta?.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-saffron-700">View on store <ExternalLink className="h-3 w-3" /></a> : undefined}
        actions={editable && <>
          {!isNew && (meta?.deletedAt
            ? <Button variant="outline" onClick={async () => { await api.post(`/admin/catalog/products/${id}/restore`); toast.success("Restored"); location.reload(); }}><RotateCcw className="h-4 w-4" />Restore</Button>
            : <Button variant="outline" onClick={async () => { if (confirmAction("Archive this product? It disappears from the store and carts.")) { await api.post(`/admin/catalog/products/${id}/archive`); toast.success("Archived"); router.push("/products"); } }}><Archive className="h-4 w-4" />Archive</Button>)}
          <Button loading={busy} onClick={save}>Save product</Button>
        </>}
      />
      {Object.keys(fe).length > 0 && <InlineAlert tone="danger" className="mb-4">Please fix the highlighted fields: {Object.entries(fe).slice(0, 3).map(([k, v]) => `${k} — ${v}`).join("; ")}</InlineAlert>}
      <fieldset disabled={!editable} className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="space-y-4 p-6">
            <h2 className="font-display text-lg font-semibold">Basics</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" required error={err("name")}>{(p) => <Input {...p} value={f.name} onChange={(e) => { set("name", e.target.value); if (isNew) set("slug", slugify(e.target.value)); }} />}</Field>
              <Field label="Name (Hindi)">{(p) => <Input {...p} value={f.nameHi} onChange={(e) => set("nameHi", e.target.value)} lang="hi" />}</Field>
              <Field label="URL slug" error={err("slug")}>{(p) => <Input {...p} value={f.slug} onChange={(e) => set("slug", slugify(e.target.value))} />}</Field>
              <Field label="Product SKU" required error={err("sku")}>{(p) => <Input {...p} value={f.sku} onChange={(e) => set("sku", e.target.value.toUpperCase())} />}</Field>
            </div>
            <Field label="Short description" required error={err("shortDescription")}>{(p) => <Input {...p} value={f.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} maxLength={240} />}</Field>
            <Field label="Short description (Hindi)">{(p) => <Input {...p} value={f.shortDescriptionHi} onChange={(e) => set("shortDescriptionHi", e.target.value)} lang="hi" />}</Field>
            <Field label="Full description" required error={err("description")}>{(p) => <Textarea {...p} rows={5} value={f.description} onChange={(e) => set("description", e.target.value)} />}</Field>
          </Card>

          <Card className="space-y-4 p-6">
            <div className="flex items-center justify-between"><h2 className="font-display text-lg font-semibold">Weight & price variants</h2><Button size="sm" variant="soft" onClick={() => set("variants", [...f.variants, blankVariant(f.sku, f.variants.length + 1)])}><Plus className="h-4 w-4" />Add variant</Button></div>
            {err("variants") && <p className="text-sm text-maroon-600">{err("variants")}</p>}
            <div className="space-y-3">
              {f.variants.map((v, i) => (
                <div key={v.id ?? i} className="rounded-2xl border border-line p-4">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Field label="Label" error={err(`variants.${i}.label`)}>{(p) => <Input {...p} value={v.label} onChange={(e) => setV(i, { label: e.target.value })} placeholder="500 g" className="h-10" />}</Field>
                    <Field label="Weight (g)">{(p) => <Input {...p} type="number" value={v.weightGrams} onChange={(e) => setV(i, { weightGrams: e.target.value })} className="h-10" />}</Field>
                    <Field label="MRP (₹)" error={err(`variants.${i}.mrpPaise`)}>{(p) => <Input {...p} type="number" step="0.01" value={v.mrp} onChange={(e) => setV(i, { mrp: e.target.value })} className="h-10" />}</Field>
                    <Field label="Sale price (₹)" error={err(`variants.${i}.salePricePaise`)}>{(p) => <Input {...p} type="number" step="0.01" value={v.sale} onChange={(e) => setV(i, { sale: e.target.value })} placeholder="optional" className="h-10" />}</Field>
                    <Field label="Variant SKU" error={err(`variants.${i}.sku`)}>{(p) => <Input {...p} value={v.sku} onChange={(e) => setV(i, { sku: e.target.value.toUpperCase() })} className="h-10" />}</Field>
                    <Field label="Barcode">{(p) => <Input {...p} value={v.barcode} onChange={(e) => setV(i, { barcode: e.target.value })} className="h-10" />}</Field>
                    <Field label="Low-stock alert at">{(p) => <Input {...p} type="number" value={v.lowStockThreshold} onChange={(e) => setV(i, { lowStockThreshold: e.target.value })} className="h-10" />}</Field>
                    <div className="flex flex-col justify-end gap-2 pb-1">
                      <Checkbox checked={v.isDefault} onChange={(c) => setV(i, { isDefault: c })} label="Default" />
                      <Checkbox checked={v.isActive} onChange={(c) => setV(i, { isActive: c })} label="Available" />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted">
                    <span>{v.id ? <>In stock: <b className="text-ink">{v.available ?? 0}</b> · <Link href={`/inventory/${v.id}`} className="font-semibold text-saffron-700">Manage stock & batches</Link></> : "Add stock from Inventory after saving."}</span>
                    {f.variants.length > 1 && <button type="button" onClick={() => set("variants", f.variants.filter((_, k) => k !== i))} className="inline-flex items-center gap-1 font-semibold text-maroon-600"><Trash2 className="h-3.5 w-3.5" />Remove</button>}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-4 p-6">
            <h2 className="font-display text-lg font-semibold">Ingredients, nutrition & storage</h2>
            <Field label="Ingredients" required error={err("ingredients")}>{(p) => <Textarea {...p} rows={2} value={f.ingredients} onChange={(e) => set("ingredients", e.target.value)} />}</Field>
            <Field label="Allergens" hint="Comma separated, e.g. Milk, Cashew, Gluten">{(p) => <Input {...p} value={f.allergens} onChange={(e) => set("allergens", e.target.value)} />}</Field>
            <div>
              <p className="mb-2 text-[13px] font-semibold text-ink-soft">Nutrition (per 100 g)</p>
              <div className="space-y-2">{f.nutrition.map((n, i) => (
                <div key={i} className="flex gap-2"><Input className="h-10" placeholder="Energy" value={n.k} onChange={(e) => set("nutrition", f.nutrition.map((x, k) => (k === i ? { ...x, k: e.target.value } : x)))} /><Input className="h-10" placeholder="520 kcal" value={n.v} onChange={(e) => set("nutrition", f.nutrition.map((x, k) => (k === i ? { ...x, v: e.target.value } : x)))} /><Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => set("nutrition", f.nutrition.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button></div>
              ))}</div>
              <Button size="xs" variant="ghost" className="mt-2" onClick={() => set("nutrition", [...f.nutrition, { k: "", v: "" }])}><Plus className="h-3 w-3" />Add nutrient</Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Shelf life (days)" required error={err("shelfLifeDays")}>{(p) => <Input {...p} type="number" value={f.shelfLifeDays} onChange={(e) => set("shelfLifeDays", e.target.value)} />}</Field>
              <Field label="Food type">{(p) => <Select {...p} value={f.foodType} onChange={(e) => set("foodType", e.target.value)}>{FOOD_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", "-").toLowerCase()}</option>)}</Select>}</Field>
              <Field label="GST rate % (blank = category)">{(p) => <Input {...p} type="number" value={f.gstRate} onChange={(e) => set("gstRate", e.target.value)} />}</Field>
            </div>
            <Field label="Storage instructions" required error={err("storageInstructions")}>{(p) => <Textarea {...p} rows={2} value={f.storageInstructions} onChange={(e) => set("storageInstructions", e.target.value)} />}</Field>
            <Field label="Manufacturing information">{(p) => <Textarea {...p} rows={2} value={f.manufacturingInfo} onChange={(e) => set("manufacturingInfo", e.target.value)} />}</Field>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="space-y-4 p-6">
            <h2 className="font-display text-lg font-semibold">Visibility</h2>
            {([["isActive", "Visible on store"], ["isBestseller", "Bestseller"], ["isFeatured", "Featured"], ["isNewArrival", "New arrival"]] as const).map(([k, l]) => (
              <div key={k} className="flex items-center justify-between"><span className="text-sm font-semibold text-ink-soft">{l}</span><Switch checked={f[k]} onChange={(v) => set(k, v)} label={l} /></div>
            ))}
          </Card>
          <Card className="space-y-4 p-6">
            <h2 className="font-display text-lg font-semibold">Organisation</h2>
            <Field label="Category" required error={err("categoryId")}>{(p) => <Select {...p} value={f.categoryId} onChange={(e) => { set("categoryId", e.target.value); set("subcategoryId", ""); }}><option value="">Choose…</option>{topCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>
            {subCats.length > 0 && <Field label="Subcategory">{(p) => <Select {...p} value={f.subcategoryId} onChange={(e) => set("subcategoryId", e.target.value)}><option value="">None</option>{subCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>}
            <Field label="Tags" hint="Comma separated; used by search">{(p) => <Input {...p} value={f.tags} onChange={(e) => set("tags", e.target.value)} />}</Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="HSN code">{(p) => <Input {...p} value={f.hsnCode} onChange={(e) => set("hsnCode", e.target.value)} />}</Field>
              <Field label="Barcode">{(p) => <Input {...p} value={f.barcode} onChange={(e) => set("barcode", e.target.value)} />}</Field>
            </div>
          </Card>
          <Card className="space-y-4 p-6">
            <h2 className="font-display text-lg font-semibold">Media</h2>
            <ImageUploader value={f.images} onChange={(u) => set("images", u)} />
            <Field label="Product video URL" hint="Upload an MP4/WebM or paste a hosted video link">{(p) => <Input {...p} value={f.videoUrl} onChange={(e) => set("videoUrl", e.target.value)} placeholder="https://…" />}</Field>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-saffron-700">{videoBusy ? <Spinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />}Upload video<input type="file" accept="video/mp4,video/webm" className="hidden" onChange={(e) => e.target.files?.[0] && void uploadVideo(e.target.files[0])} /></label>
          </Card>
          <Card className="space-y-4 p-6">
            <h2 className="font-display text-lg font-semibold">SEO</h2>
            <Field label="SEO title" hint={`${f.seoTitle.length}/70`}>{(p) => <Input {...p} value={f.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} maxLength={70} />}</Field>
            <Field label="Meta description" hint={`${f.seoDescription.length}/170`}>{(p) => <Textarea {...p} rows={3} value={f.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} maxLength={170} />}</Field>
          </Card>
        </div>
      </fieldset>
    </Guard>
  );
}
