"use client";
import { useRef, useState, type ReactNode } from "react";
import { Search, Upload, X } from "lucide-react";
import { toast } from "sonner";
import type { PermissionKey } from "@naamdev/shared";
import { Button, Card, EmptyState, ErrorState, Input, Skeleton, Spinner, cn } from "@naamdev/ui";
import { api, errorMessage } from "@/lib/api";
import { useAdmin } from "@/lib/auth";

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back}
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Can({ any, all, children, fallback = null }: { any?: PermissionKey[]; all?: PermissionKey[]; children: ReactNode; fallback?: ReactNode }) {
  const { can, canAny } = useAdmin();
  const ok = (all ? can(...all) : true) && (any ? canAny(...any) : true);
  return <>{ok ? children : fallback}</>;
}

export function Guard({ any, children }: { any: PermissionKey[]; children: ReactNode }) {
  return <Can any={any} fallback={<ErrorState title="Access restricted" description="Your role doesn't include permission for this section. Ask a store owner to update your role." />}>{children}</Can>;
}

export function SearchInput({ value, onChange, placeholder = "Search…", className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const [v, setV] = useState(value);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  return (
    <div className={cn("w-full sm:w-72", className)}>
      <Input value={v} placeholder={placeholder} aria-label={placeholder} leading={<Search className="h-4 w-4" />} className="h-10"
        onChange={(e) => { setV(e.target.value); clearTimeout(t.current); const nv = e.target.value; t.current = setTimeout(() => onChange(nv), 300); }} />
    </div>
  );
}

export interface Column<T> { key: string; header: ReactNode; cell: (row: T) => ReactNode; className?: string; align?: "left" | "right" | "center" }

export function DataTable<T extends object>({ columns, rows, loading, error, onRowClick, empty, rowKey }: { columns: Column<T>[]; rows: T[] | undefined | null; loading?: boolean; error?: string | null; onRowClick?: (r: T) => void; empty?: ReactNode; rowKey?: (r: T) => string }) {
  if (error) return <ErrorState description={error} />;
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-2/70 text-left text-[12.5px] font-semibold text-muted">
            <tr>{columns.map((c) => <th key={c.key} scope="col" className={cn("whitespace-nowrap px-4 py-3", c.align === "right" && "text-right", c.align === "center" && "text-center", c.className)}>{c.header}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {loading && !rows?.length
              ? Array.from({ length: 6 }, (_, i) => <tr key={i}>{columns.map((c) => <td key={c.key} className="px-4 py-3.5"><Skeleton className="h-4 w-full" rounded="rounded-md" /></td>)}</tr>)
              : rows?.map((r, i) => (
                  <tr key={rowKey ? rowKey(r) : (r as { id?: string }).id ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn("transition", onRowClick && "cursor-pointer hover:bg-surface-2 ")}>
                    {columns.map((c) => <td key={c.key} className={cn("px-4 py-3 align-middle text-ink-soft", c.align === "right" && "text-right tabular-nums", c.align === "center" && "text-center", c.className)}>{c.cell(r)}</td>)}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {!loading && rows && rows.length === 0 && (empty ?? <EmptyState title="Nothing here yet" className="py-10" />)}
    </Card>
  );
}

/** Image uploader that sends files to the API (Cloudinary or local storage, server-validated). */
export function ImageUploader({ value, onChange, folder = "products", multiple = true, max = 8 }: { value: string[]; onChange: (urls: string[]) => void; folder?: string; multiple?: boolean; max?: number }) {
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const upload = async (files: FileList) => {
    setBusy(true);
    const urls = [...value];
    for (const f of [...files].slice(0, max - urls.length)) {
      try { urls.push((await api.upload<{ file: { url: string } }>("/admin/uploads/image", f, { folder })).file.url); }
      catch (e) { toast.error(`${f.name}: ${errorMessage(e)}`); }
    }
    onChange(multiple ? urls : urls.slice(-1));
    setBusy(false);
  };
  return (
    <div className="flex flex-wrap gap-3">
      {value.map((u, i) => (
        <div key={u + i} className="group relative h-24 w-24 overflow-hidden rounded-2xl border border-line bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u} alt="" className="h-full w-full object-cover" />
          {i === 0 && multiple && <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[12px] font-semibold text-white">Cover</span>}
          <button type="button" aria-label="Remove image" onClick={() => onChange(value.filter((_, k) => k !== i))} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
          {multiple && i > 0 && <button type="button" onClick={() => onChange([u, ...value.filter((_, k) => k !== i)])} className="absolute inset-x-1 bottom-1 rounded bg-black/60 py-0.5 text-[9px] font-bold text-white opacity-0 group-hover:opacity-100">Make cover</button>}
        </div>
      ))}
      {value.length < (multiple ? max : 1) || !multiple ? (
        <button type="button" onClick={() => ref.current?.click()} className="grid h-24 w-24 place-items-center rounded-2xl border-2 border-dashed border-line text-muted transition hover:border-ink-soft/40 hover:text-maroon-700">
          {busy ? <Spinner /> : <span className="flex flex-col items-center gap-1 text-[11px] font-semibold"><Upload className="h-5 w-5" />Upload</span>}
        </button>
      ) : null}
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple={multiple} className="hidden" onChange={(e) => e.target.files && void upload(e.target.files)} />
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>;
}

export function confirmAction(message: string) {
  return typeof window !== "undefined" && window.confirm(message);
}

export function KeyValue({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {items.map(([k, v], i) => (
        <div key={i}><dt className="text-[13px] font-semibold text-muted">{k}</dt><dd className="mt-0.5 text-ink">{v ?? "—"}</dd></div>
      ))}
    </dl>
  );
}

export { Button };
