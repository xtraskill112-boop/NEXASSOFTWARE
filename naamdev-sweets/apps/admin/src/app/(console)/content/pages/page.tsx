"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, Checkbox, Field, Input, Modal, Segmented, Textarea } from "@naamdev/ui";
import { DataTable, Guard, PageHeader, confirmAction } from "@/components/kit";
import { STOREFRONT_URL, api, dt, errorMessage } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

interface Pg { id: string; slug: string; title: string; titleHi: string | null; body: string; bodyHi: string | null; seoDescription: string | null; updatedAt: string }
interface Fq { id: string; question: string; answer: string; questionHi: string | null; answerHi: string | null; category: string; sortOrder: number; isActive: boolean }

export default function PagesAndFaqs() {
  const [tab, setTab] = useState<"pages" | "faqs">("pages");
  const pages = useResource<{ pages: Pg[] }>("/admin/marketing/pages");
  const faqs = useResource<{ faqs: Fq[] }>("/admin/marketing/faqs");
  const [pg, setPg] = useState<Partial<Pg> | null>(null);
  const [fq, setFq] = useState<Partial<Fq> | null>(null);
  const savePage = async () => {
    if (!pg?.slug) return;
    try { await api.put(`/admin/marketing/pages/${pg.slug}`, { title: pg.title, titleHi: pg.titleHi || null, body: pg.body ?? "", bodyHi: pg.bodyHi || null, seoDescription: pg.seoDescription || null }); toast.success("Page published"); setPg(null); void pages.reload(); } catch (e) { toast.error(errorMessage(e)); }
  };
  const saveFaq = async () => {
    if (!fq) return;
    const body = { question: fq.question, answer: fq.answer, questionHi: fq.questionHi || null, answerHi: fq.answerHi || null, category: fq.category || "General", sortOrder: Number(fq.sortOrder ?? 0), isActive: fq.isActive ?? true };
    try { if (fq.id) await api.put(`/admin/marketing/faqs/${fq.id}`, body); else await api.post("/admin/marketing/faqs", body); toast.success("FAQ saved"); setFq(null); void faqs.reload(); } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <Guard any={["content.manage"]}>
      <PageHeader title="Pages & FAQs" subtitle="Content is written in Markdown; raw HTML is never rendered on the storefront." actions={tab === "pages" ? <Button onClick={() => setPg({ slug: "", title: "", body: "" })}><Plus className="h-4 w-4" />New page</Button> : <Button onClick={() => setFq({ isActive: true, category: "General" })}><Plus className="h-4 w-4" />New FAQ</Button>} />
      <Segmented value={tab} onChange={setTab} className="mb-4" options={[{ value: "pages", label: "Pages" }, { value: "faqs", label: "FAQs" }]} />
      {tab === "pages" ? (
        <DataTable<Pg> loading={pages.loading} rows={pages.data?.pages} onRowClick={(p) => setPg(p)} columns={[
          { key: "t", header: "Page", cell: (p) => <div><p className="font-semibold text-ink">{p.title}</p><a href={`${STOREFRONT_URL}${p.slug === "contact" ? "/contact" : `/pages/${p.slug}`}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-maroon-700">/{p.slug} ↗</a></div> },
          { key: "h", header: "Hindi", cell: (p) => <Badge tone={p.bodyHi ? "success" : "neutral"}>{p.bodyHi ? "Translated" : "English only"}</Badge> },
          { key: "u", header: "Updated", cell: (p) => dt(p.updatedAt) },
        ]} />
      ) : (
        <DataTable<Fq> loading={faqs.loading} rows={faqs.data?.faqs} onRowClick={(f) => setFq(f)} columns={[
          { key: "q", header: "Question", cell: (f) => <p className="font-semibold text-ink">{f.question}</p> },
          { key: "c", header: "Category", cell: (f) => f.category },
          { key: "a", header: "Status", cell: (f) => <Badge tone={f.isActive ? "success" : "neutral"}>{f.isActive ? "Live" : "Hidden"}</Badge> },
          { key: "d", header: "", align: "right", cell: (f) => <button type="button" aria-label="Delete" className="p-2 text-muted hover:text-maroon-600" onClick={async (e) => { e.stopPropagation(); if (confirmAction("Delete FAQ?")) { await api.del(`/admin/marketing/faqs/${f.id}`); void faqs.reload(); } }}><Trash2 className="h-4 w-4" /></button> },
        ]} />
      )}
      <Modal open={!!pg} onClose={() => setPg(null)} title={pg?.id ? `Edit “${pg.title}”` : "New page"} size="xl" footer={<div className="flex justify-end"><Button onClick={savePage}>Publish</Button></div>}>
        {pg && <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Slug" hint="e.g. about, privacy-policy">{(p) => <Input {...p} value={pg.slug ?? ""} disabled={!!pg.id} onChange={(e) => setPg({ ...pg, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} />}</Field>
            <Field label="Title">{(p) => <Input {...p} value={pg.title ?? ""} onChange={(e) => setPg({ ...pg, title: e.target.value })} />}</Field>
          </div>
          <Field label="Meta description">{(p) => <Input {...p} value={pg.seoDescription ?? ""} onChange={(e) => setPg({ ...pg, seoDescription: e.target.value })} />}</Field>
          <Field label="Content (Markdown)">{(p) => <Textarea {...p} rows={14} className="font-mono text-sm" value={pg.body ?? ""} onChange={(e) => setPg({ ...pg, body: e.target.value })} />}</Field>
          <Card className="space-y-3 bg-surface-2 p-4"><p className="text-sm font-semibold">Hindi translation (optional)</p>
            <Input value={pg.titleHi ?? ""} onChange={(e) => setPg({ ...pg, titleHi: e.target.value })} placeholder="शीर्षक" aria-label="Hindi title" />
            <Textarea rows={6} value={pg.bodyHi ?? ""} onChange={(e) => setPg({ ...pg, bodyHi: e.target.value })} placeholder="सामग्री" aria-label="Hindi content" /></Card>
        </div>}
      </Modal>
      <Modal open={!!fq} onClose={() => setFq(null)} title={fq?.id ? "Edit FAQ" : "New FAQ"} size="lg" footer={<div className="flex justify-end"><Button onClick={saveFaq}>Save</Button></div>}>
        {fq && <div className="space-y-4">
          <Field label="Question">{(p) => <Input {...p} value={fq.question ?? ""} onChange={(e) => setFq({ ...fq, question: e.target.value })} />}</Field>
          <Field label="Answer">{(p) => <Textarea {...p} rows={4} value={fq.answer ?? ""} onChange={(e) => setFq({ ...fq, answer: e.target.value })} />}</Field>
          <div className="grid grid-cols-2 gap-4"><Field label="Category">{(p) => <Input {...p} value={fq.category ?? ""} onChange={(e) => setFq({ ...fq, category: e.target.value })} />}</Field><Field label="Sort order">{(p) => <Input {...p} type="number" value={fq.sortOrder ?? 0} onChange={(e) => setFq({ ...fq, sortOrder: Number(e.target.value) })} />}</Field></div>
          <Field label="Question (Hindi)">{(p) => <Input {...p} value={fq.questionHi ?? ""} onChange={(e) => setFq({ ...fq, questionHi: e.target.value })} />}</Field>
          <Field label="Answer (Hindi)">{(p) => <Textarea {...p} value={fq.answerHi ?? ""} onChange={(e) => setFq({ ...fq, answerHi: e.target.value })} />}</Field>
          <Checkbox checked={fq.isActive ?? true} onChange={(v) => setFq({ ...fq, isActive: v })} label="Live" />
        </div>}
      </Modal>
    </Guard>
  );
}
