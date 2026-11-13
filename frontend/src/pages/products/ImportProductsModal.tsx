import { useMemo, useRef, useState, type DragEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, RefreshCw, Upload, XCircle } from 'lucide-react';
import { ApiError, apiRequest, errorMessage } from '@/lib/api';
import { qk, stockKeys, useWarehouses } from '@/lib/queries';
import type { Paginated, Product } from '@/lib/types';
import { downloadImportReport, downloadTemplate, MAX_IMPORT_ROWS, parseProductFile, planImport, type ImportRow, type ParsedImport } from '@/lib/excel';
import { formatCurrency, formatNumber } from '@/lib/format';
import { useToast } from '@/context/ToastContext';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';

type Step = 'select' | 'preview' | 'importing' | 'done';
interface RowResult {
  row: ImportRow;
  status: 'Created' | 'Updated' | 'Skipped' | 'Failed' | 'Invalid';
  message: string;
}

async function fetchAllProducts(): Promise<Product[]> {
  const all: Product[] = [];
  for (let page = 1; page < 200; page++) {
    const res = await apiRequest<Paginated<Product>>('/products', { query: { page, pageSize: 100, status: 'all', sortBy: 'sku' } });
    all.push(...res.data);
    if (page >= res.pagination.totalPages) break;
  }
  return all;
}

/** Retries politely when the server rate-limits the import. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ApiError && err.status === 429 && attempt < 6) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        continue;
      }
      throw err;
    }
  }
}

function describeError(err: unknown) {
  if (err instanceof ApiError) {
    const fields = Object.entries(err.fieldErrors).map(([k, v]) => `${k}: ${v}`);
    return fields.length ? `${err.message} (${fields.join('; ')})` : err.message;
  }
  return errorMessage(err);
}

export function ImportProductsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: warehouses = [] } = useWarehouses(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('select');
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [existing, setExisting] = useState<Product[]>([]);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [results, setResults] = useState<RowResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [filter, setFilter] = useState<'all' | 'problems'>('all');

  const plan = useMemo(() => (parsed ? planImport(parsed.rows, existing, updateExisting) : []), [parsed, existing, updateExisting]);
  const counts = useMemo(
    () => ({
      total: plan.length,
      create: plan.filter((r) => r.action === 'create').length,
      update: plan.filter((r) => r.action === 'update').length,
      skip: plan.filter((r) => r.action === 'skip').length,
      invalid: plan.filter((r) => r.errors.length).length,
    }),
    [plan],
  );
  const toImport = plan.filter((r) => r.action === 'create' || r.action === 'update');

  const reset = () => {
    setStep('select');
    setFileName('');
    setParsed(null);
    setError(null);
    setResults([]);
    setProgress(0);
    setFilter('all');
  };

  const close = () => {
    if (step === 'importing') return;
    reset();
    onClose();
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    setFileName(file.name);
    try {
      const [result, products] = await Promise.all([parseProductFile(file, warehouses), fetchAllProducts()]);
      setParsed(result);
      setExisting(products);
      setStep('preview');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void handleFile(e.dataTransfer.files?.[0]);
  };

  const runImport = async () => {
    setStep('importing');
    setProgress(0);
    const out: RowResult[] = plan
      .filter((r) => r.errors.length || r.action === 'skip')
      .map((r) => (r.errors.length ? { row: r, status: 'Invalid' as const, message: r.errors.join('; ') } : { row: r, status: 'Skipped' as const, message: 'SKU already exists' }));
    const byId = new Map(existing.map((p) => [p.id, p]));
    const queue = [...toImport];
    let done = 0;

    const work = async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        try {
          if (row.action === 'create') {
            const openingStock = Object.entries(row.opening).map(([warehouseId, quantity]) => ({ warehouseId, quantity }));
            await withRetry(() =>
              apiRequest('/products', {
                method: 'POST',
                query: { minimal: 1 },
                body: {
                  sku: row.sku,
                  name: row.name,
                  category: row.category,
                  unit: row.unit,
                  unitPrice: row.unitPrice,
                  reorderLevel: row.reorderLevel,
                  description: row.description,
                  isActive: row.isActive,
                  openingStock: openingStock.length ? openingStock : undefined,
                },
              }),
            );
            const units = openingStock.reduce((s, o) => s + o.quantity, 0);
            out.push({ row, status: 'Created', message: units ? `Created with ${formatNumber(units)} units opening stock` : 'Created' });
          } else {
            const current = byId.get(row.existingId!);
            await withRetry(() =>
              apiRequest(`/products/${row.existingId}`, {
                method: 'PUT',
                query: { minimal: 1 },
                body: { name: row.name, category: row.category, unit: row.unit, unitPrice: row.unitPrice, reorderLevel: row.reorderLevel, description: row.description },
              }),
            );
            if (current && current.isActive !== row.isActive) {
              await withRetry(() => apiRequest(`/products/${row.existingId}/status`, { method: 'PATCH', query: { minimal: 1 }, body: { isActive: row.isActive } }));
            }
            out.push({ row, status: 'Updated', message: 'Updated' });
          }
        } catch (err) {
          out.push({ row, status: 'Failed', message: describeError(err) });
        }
        done += 1;
        setProgress(done);
      }
    };
    await Promise.all(Array.from({ length: 3 }, work));

    out.sort((a, b) => a.row.rowNumber - b.row.rowNumber);
    setResults(out);
    setStep('done');
    [...stockKeys, qk.categories].forEach((k) => qc.invalidateQueries({ queryKey: k }));
    const created = out.filter((r) => r.status === 'Created').length;
    const updated = out.filter((r) => r.status === 'Updated').length;
    const failed = out.filter((r) => r.status === 'Failed').length;
    if (failed) toast.warning('Import finished with errors', `${created} created, ${updated} updated, ${failed} failed.`);
    else toast.success('Import complete', `${created} products created, ${updated} updated.`);
  };

  const visibleRows = filter === 'problems' ? plan.filter((r) => r.errors.length || r.warnings.length) : plan;
  const summary = {
    created: results.filter((r) => r.status === 'Created').length,
    updated: results.filter((r) => r.status === 'Updated').length,
    skipped: results.filter((r) => r.status === 'Skipped').length,
    failed: results.filter((r) => r.status === 'Failed' || r.status === 'Invalid').length,
  };

  return (
    <Modal
      open={open}
      onClose={close}
      locked={step === 'importing'}
      size="xl"
      title="Bulk import products from Excel"
      description="Upload an .xlsx or .csv file to add new products or update existing ones (matched by SKU)."
      footer={
        step === 'preview' ? (
          <>
            <Button variant="secondary" onClick={reset}>
              Choose another file
            </Button>
            <Button onClick={runImport} disabled={toImport.length === 0} icon={<Upload className="size-4" />}>
              Import {formatNumber(toImport.length)} product{toImport.length === 1 ? '' : 's'}
            </Button>
          </>
        ) : step === 'done' ? (
          <>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => downloadImportReport(results)}>
              Download results
            </Button>
            <Button variant="secondary" onClick={reset} icon={<RefreshCw className="size-4" />}>
              Import another file
            </Button>
            <Button onClick={close}>Done</Button>
          </>
        ) : step === 'select' ? (
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
        ) : undefined
      }
    >
      {step === 'select' && (
        <div className="space-y-5">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={clsx(
              'flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
              dragging ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10' : 'border-line-strong bg-surface-2',
            )}
          >
            {busy ? (
              <>
                <Spinner className="size-8 text-brand-500" />
                <p className="mt-3 text-sm text-ink-2">Reading {fileName}…</p>
              </>
            ) : (
              <>
                <FileSpreadsheet className="size-10 text-emerald-600" />
                <p className="mt-3 text-sm font-medium text-ink">Drag and drop your Excel file here</p>
                <p className="mt-1 text-xs text-ink-3">.xlsx or .csv · up to {formatNumber(MAX_IMPORT_ROWS)} products</p>
                <Button className="mt-4" icon={<Upload className="size-4" />} onClick={() => inputRef.current?.click()}>
                  Choose file
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  className="hidden"
                  data-testid="import-file-input"
                  onChange={(e) => void handleFile(e.target.files?.[0])}
                />
              </>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200" role="alert">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex flex-col gap-3 rounded-xl border border-line p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">Start from the template</p>
              <p className="mt-0.5 text-xs text-ink-3">
                Columns: SKU, Product name, Category, Unit, Unit price (INR), Reorder level, Description, Active, plus one opening-stock column per warehouse. Tip: use
                <strong> Export to Excel</strong> on the Products page to download your current catalogue, edit it and re-import to update prices in bulk.
              </p>
            </div>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => downloadTemplate(warehouses)}>
              Download template
            </Button>
          </div>
        </div>
      )}

      {step === 'preview' && parsed && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ['Rows', counts.total, 'text-ink'],
              ['New', counts.create, 'text-emerald-700 dark:text-emerald-400'],
              ['Update', counts.update, 'text-sky-700 dark:text-sky-400'],
              ['Skip', counts.skip, 'text-ink-2'],
              ['Errors', counts.invalid, counts.invalid ? 'text-red-700 dark:text-red-400' : 'text-ink'],
            ].map(([label, value, cls]) => (
              <div key={label as string} className="rounded-lg border border-line bg-surface-2 px-3 py-2">
                <p className="text-xs text-ink-3">{label}</p>
                <p className={clsx('text-lg font-semibold', cls as string)}>{formatNumber(value as number)}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} className="size-4 rounded accent-brand-600" />
              Update products whose SKU already exists (otherwise they are skipped)
            </label>
            <div className="inline-flex rounded-lg border border-line p-0.5 text-xs">
              {(['all', 'problems'] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)} className={clsx('rounded-md px-2.5 py-1 font-medium', filter === f ? 'bg-surface-3 text-ink' : 'text-ink-3')}>
                  {f === 'all' ? 'All rows' : 'Errors & warnings'}
                </button>
              ))}
            </div>
          </div>

          {parsed.ignored.length > 0 && <p className="text-xs text-ink-3">Ignored columns: {parsed.ignored.join(', ')}</p>}

          <div className="scrollbar-thin max-h-[46vh] overflow-auto rounded-lg border border-line">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="sticky top-0 bg-surface-2 text-[11px] tracking-wider text-ink-3 uppercase">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2 text-right">Price</th>
                  <th className="px-3 py-2 text-right">Opening</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={r.rowNumber} className={clsx('border-t border-line align-top', r.errors.length && 'bg-red-50/60 dark:bg-red-500/5')}>
                    <td className="px-3 py-2 text-xs text-ink-3 tabular">{r.rowNumber}</td>
                    <td className="px-3 py-2">
                      {r.errors.length ? (
                        <Badge tone="critical" icon={<XCircle className="size-3.5" />}>
                          Error
                        </Badge>
                      ) : r.action === 'create' ? (
                        <Badge tone="good">New</Badge>
                      ) : r.action === 'update' ? (
                        <Badge tone="info">Update</Badge>
                      ) : (
                        <Badge>Skip</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-ink">{r.sku || "—"}</td>
                    <td className="px-3 py-2 text-ink">{r.name || '—'}</td>
                    <td className="px-3 py-2 text-ink-2">{r.category || '—'}</td>
                    <td className="px-3 py-2 text-right text-ink-2 tabular">{r.unitPrice !== null && !Number.isNaN(r.unitPrice) ? formatCurrency(r.unitPrice) : '—'}</td>
                    <td className="px-3 py-2 text-right text-ink-2 tabular">{formatNumber(Object.values(r.opening).reduce((s, q) => s + q, 0)) || '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      {r.errors.map((e) => (
                        <p key={e} className="text-red-700 dark:text-red-400">
                          {e}
                        </p>
                      ))}
                      {r.warnings.map((w) => (
                        <p key={w} className="text-amber-700 dark:text-amber-300">
                          {w}
                        </p>
                      ))}
                    </td>
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-sm text-ink-3">
                      No rows with errors or warnings.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {counts.invalid > 0 && <p className="text-xs text-ink-3">Rows with errors are not imported. Fix them in the file and import it again, or continue with the valid rows.</p>}
        </div>
      )}

      {step === 'importing' && (
        <div className="py-10 text-center">
          <Spinner className="mx-auto size-8 text-brand-500" />
          <p className="mt-4 text-sm font-medium text-ink">
            Importing {formatNumber(progress)} of {formatNumber(toImport.length)} products…
          </p>
          <div className="mx-auto mt-4 h-2 max-w-md overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={toImport.length} aria-valuenow={progress}>
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${toImport.length ? (progress / toImport.length) * 100 : 100}%` }} />
          </div>
          <p className="mt-3 text-xs text-ink-3">Keep this window open until the import finishes.</p>
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Created', summary.created, 'text-emerald-700 dark:text-emerald-400'],
              ['Updated', summary.updated, 'text-sky-700 dark:text-sky-400'],
              ['Skipped', summary.skipped, 'text-ink-2'],
              ['Not imported', summary.failed, summary.failed ? 'text-red-700 dark:text-red-400' : 'text-ink'],
            ].map(([label, value, cls]) => (
              <div key={label as string} className="rounded-lg border border-line bg-surface-2 px-3 py-2">
                <p className="text-xs text-ink-3">{label}</p>
                <p className={clsx('text-lg font-semibold', cls as string)}>{formatNumber(value as number)}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm text-ink-2">
            {summary.failed ? <AlertTriangle className="size-4 text-[var(--status-warning)]" /> : <CheckCircle2 className="size-4 text-[var(--status-good)]" />}
            {summary.failed ? 'Some rows were not imported. Download the results to see why.' : 'All valid rows were imported. Every change is recorded in the audit log.'}
          </div>
          <div className="scrollbar-thin max-h-[40vh] overflow-auto rounded-lg border border-line">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface-2 text-[11px] tracking-wider text-ink-3 uppercase">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">Result</th>
                  <th className="px-3 py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.row.rowNumber} className="border-t border-line align-top">
                    <td className="px-3 py-1.5 text-xs text-ink-3 tabular">{r.row.rowNumber}</td>
                    <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap text-ink">{r.row.sku || "—"}</td>
                    <td className="px-3 py-1.5">
                      <Badge tone={r.status === 'Created' ? 'good' : r.status === 'Updated' ? 'info' : r.status === 'Skipped' ? 'neutral' : 'critical'}>{r.status}</Badge>
                    </td>
                    <td className="px-3 py-1.5 text-xs text-ink-2">{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
