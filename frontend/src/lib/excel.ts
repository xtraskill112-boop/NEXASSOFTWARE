/**
 * Excel (.xlsx) and CSV support for bulk product import / export.
 * Parsing happens entirely in the browser; nothing is uploaded except the validated rows.
 */
import { readSheet } from 'read-excel-file/browser';
import writeExcelFile from 'write-excel-file/browser';
import type { Product, Warehouse } from './types';

export const MAX_IMPORT_ROWS = 2000;

export interface ImportRow {
  /** Spreadsheet row number (1-based, including the header row) */
  rowNumber: number;
  sku: string;
  name: string;
  category: string;
  unit: string;
  unitPrice: number | null;
  reorderLevel: number;
  description: string | null;
  isActive: boolean;
  /** Opening quantities keyed by warehouse id (new products only) */
  opening: Record<string, number>;
  errors: string[];
  warnings: string[];
  /** Set after matching against the existing catalogue */
  action?: 'create' | 'update' | 'skip';
  existingId?: string;
}

export interface ParsedImport {
  rows: ImportRow[];
  /** Columns that were recognised, for display */
  recognised: string[];
  /** Header cells that were not recognised (ignored) */
  ignored: string[];
}

type Field = 'sku' | 'name' | 'category' | 'unit' | 'unitPrice' | 'reorderLevel' | 'description' | 'isActive';

const FIELD_ALIASES: Record<Field, string[]> = {
  sku: ['sku', 'sku code', 'item code', 'product code', 'code'],
  name: ['product name', 'name', 'product', 'item name', 'item', 'description of goods'],
  category: ['category', 'product category', 'group'],
  unit: ['unit', 'uom', 'unit of measure'],
  unitPrice: ['unit price (inr)', 'unit price', 'price', 'rate', 'selling price', 'price (inr)', 'mrp'],
  reorderLevel: ['reorder level', 'reorder', 'reorder qty', 'minimum stock', 'min stock'],
  description: ['description', 'notes', 'details'],
  isActive: ['active (yes/no)', 'active', 'status', 'is active'],
};

export const TEMPLATE_HEADERS = ['SKU', 'Product name', 'Category', 'Unit', 'Unit price (INR)', 'Reorder level', 'Description', 'Active (Yes/No)'];
const openingHeader = (code: string) => `Opening stock ${code}`;

const norm = (v: unknown) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/* ----------------------------------------------------------------- reading */

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  // Excel in some locales writes ';' separated CSV
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

async function readTable(file: File): Promise<unknown[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || file.type === 'text/csv') return parseCsv(await file.text());
  if (name.endsWith('.xls') && !name.endsWith('.xlsx')) {
    throw new Error('Old .xls files are not supported. In Excel choose File → Save As → "Excel Workbook (.xlsx)" and upload that file.');
  }
  try {
    return (await readSheet(file)) as unknown[][];
  } catch {
    throw new Error('This file could not be read as an Excel workbook. Upload an .xlsx or .csv file (you can download the template to start).');
  }
}

/* -------------------------------------------------------------- validation */

const SKU_RE = /^[A-Z0-9][A-Z0-9\-_./]*$/;
const YES = ['yes', 'y', 'true', '1', 'active'];
const NO = ['no', 'n', 'false', '0', 'inactive'];

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const cleaned = String(v).replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

export async function parseProductFile(file: File, warehouses: Warehouse[]): Promise<ParsedImport> {
  const table = (await readTable(file)).filter((r) => r.some((c) => norm(c) !== ''));
  if (table.length < 2) throw new Error('The file has no product rows. Fill in the template below the header row.');
  if (table.length - 1 > MAX_IMPORT_ROWS) throw new Error(`Too many rows (${table.length - 1}). Import at most ${MAX_IMPORT_ROWS} products per file.`);

  const header = table[0]!.map(norm);
  const fieldIndex: Partial<Record<Field, number>> = {};
  const warehouseIndex: { index: number; warehouse: Warehouse }[] = [];
  const recognised: string[] = [];
  const ignored: string[] = [];

  header.forEach((h, idx) => {
    if (!h) return;
    const field = (Object.keys(FIELD_ALIASES) as Field[]).find((f) => FIELD_ALIASES[f].includes(h) && fieldIndex[f] === undefined);
    if (field) {
      fieldIndex[field] = idx;
      recognised.push(String(table[0]![idx]).trim());
      return;
    }
    const code = h.replace(/^(opening stock|opening qty|opening|stock|qty)\s*[:@-]?\s*/, '').toUpperCase();
    const warehouse = warehouses.find((w) => w.code.toUpperCase() === code || w.name.toUpperCase() === code);
    if (warehouse && warehouse.isActive) {
      warehouseIndex.push({ index: idx, warehouse });
      recognised.push(String(table[0]![idx]).trim());
    } else ignored.push(String(table[0]![idx]).trim());
  });

  const missing = (['sku', 'name', 'category', 'unitPrice'] as Field[]).filter((f) => fieldIndex[f] === undefined);
  if (missing.length) {
    const labels: Record<string, string> = { sku: 'SKU', name: 'Product name', category: 'Category', unitPrice: 'Unit price (INR)' };
    throw new Error(`Required column(s) not found: ${missing.map((m) => labels[m]).join(', ')}. Use the template headers in the first row.`);
  }

  const cell = (r: unknown[], f: Field) => (fieldIndex[f] === undefined ? undefined : r[fieldIndex[f]!]);
  const seen = new Map<string, number>();

  const rows = table.slice(1).map((r, i): ImportRow => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const sku = String(cell(r, 'sku') ?? '').trim().toUpperCase();
    const name = String(cell(r, 'name') ?? '').trim();
    const category = String(cell(r, 'category') ?? '').trim();
    const unit = String(cell(r, 'unit') ?? '').trim() || 'pcs';
    const description = String(cell(r, 'description') ?? '').trim() || null;
    const price = toNumber(cell(r, 'unitPrice'));
    const reorderRaw = toNumber(cell(r, 'reorderLevel'));
    const activeRaw = norm(cell(r, 'isActive'));

    if (!sku) errors.push('SKU is required');
    else if (sku.length < 2 || sku.length > 40) errors.push('SKU must be 2-40 characters');
    else if (!SKU_RE.test(sku)) errors.push('SKU may contain only letters, numbers, - _ . /');
    if (sku && seen.has(sku)) errors.push(`Duplicate SKU (also on row ${seen.get(sku)})`);
    if (sku) seen.set(sku, i + 2);
    if (name.length < 2) errors.push('Product name is required (min 2 characters)');
    if (name.length > 160) errors.push('Product name is too long (max 160)');
    if (category.length < 2) errors.push('Category is required');
    if (unit.length > 20) errors.push('Unit is too long (max 20)');
    if (description && description.length > 1000) errors.push('Description is too long (max 1000)');
    if (price === null) errors.push('Unit price is required');
    else if (Number.isNaN(price) || price < 0) errors.push('Unit price must be a number of 0 or more');
    else if (Math.round(price * 100) / 100 !== price) errors.push('Unit price can have at most 2 decimals');
    let reorderLevel = 10;
    if (reorderRaw !== null) {
      if (Number.isNaN(reorderRaw) || reorderRaw < 0 || !Number.isInteger(reorderRaw)) errors.push('Reorder level must be a whole number of 0 or more');
      else reorderLevel = reorderRaw;
    }
    let isActive = true;
    if (activeRaw) {
      if (YES.includes(activeRaw)) isActive = true;
      else if (NO.includes(activeRaw)) isActive = false;
      else errors.push('Active must be Yes or No');
    }

    const opening: Record<string, number> = {};
    for (const { index, warehouse } of warehouseIndex) {
      const q = toNumber(r[index]);
      if (q === null || q === 0) continue;
      if (Number.isNaN(q) || q < 0 || !Number.isInteger(q)) errors.push(`Opening stock for ${warehouse.code} must be a whole number`);
      else if (q > 1_000_000) errors.push(`Opening stock for ${warehouse.code} is too large`);
      else opening[warehouse.id] = q;
    }
    if (!isActive && Object.keys(opening).length) {
      warnings.push('Opening stock is ignored for inactive products');
      for (const k of Object.keys(opening)) delete opening[k];
    }

    return { rowNumber: i + 2, sku, name, category, unit, unitPrice: price, reorderLevel, description, isActive, opening, errors, warnings };
  });

  return { rows, recognised, ignored };
}

/** Marks each valid row as create / update / skip against the current catalogue. */
export function planImport(rows: ImportRow[], existing: Product[], updateExisting: boolean): ImportRow[] {
  const bySku = new Map(existing.map((p) => [p.sku.toUpperCase(), p]));
  return rows.map((r) => {
    if (r.errors.length) return { ...r, action: undefined, existingId: undefined };
    const match = bySku.get(r.sku);
    if (!match) return { ...r, action: 'create', existingId: undefined };
    if (!updateExisting) return { ...r, action: 'skip', existingId: match.id, warnings: [...r.warnings.filter((w) => !w.startsWith('SKU exists')), 'SKU exists - skipped'] };
    const warnings = r.warnings.filter((w) => !w.startsWith('SKU exists') && !w.startsWith('Opening stock is not'));
    if (Object.keys(r.opening).length) warnings.push('Opening stock is not added for existing products (use Stock In)');
    return { ...r, action: 'update', existingId: match.id, warnings };
  });
}

/* ----------------------------------------------------------------- writing */

async function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const headerCell = (value: string) => ({ value, fontWeight: 'bold' as const, backgroundColor: '#E0E7FF' });

export async function downloadTemplate(warehouses: Warehouse[]) {
  const active = warehouses.filter((w) => w.isActive);
  const header = [...TEMPLATE_HEADERS, ...active.map((w) => openingHeader(w.code))].map(headerCell);
  const examples = [
    ['KD-NEW-001', 'Coconut Oil 1L', 'Staples', 'bottle', 210, 50, 'Cold pressed coconut oil', 'Yes', ...active.map((_, i) => (i === 0 ? 100 : 40))],
    ['KD-NEW-002', 'Rava 1kg', 'Staples', 'pack', 62.5, 80, null, 'Yes', ...active.map((_, i) => (i === 0 ? 200 : null))],
  ].map((row) => row.map((value) => (value === null ? null : { value })));
  const help = [
    [headerCell('Column'), headerCell('Required'), headerCell('What to enter')],
    ...[
      ['SKU', 'Yes', 'Unique product code, e.g. KD-BEV-010 (letters, numbers, - _ . /). Existing SKUs are updated or skipped.'],
      ['Product name', 'Yes', 'Product name as it should appear in StockSense.'],
      ['Category', 'Yes', 'e.g. Beverages, Staples, Personal Care.'],
      ['Unit', 'No', 'pcs, pack, box, bag, bottle, kg ... (default pcs).'],
      ['Unit price (INR)', 'Yes', 'Selling / valuation price per unit, up to 2 decimals.'],
      ['Reorder level', 'No', 'Low-stock alert threshold in units (default 10).'],
      ['Description', 'No', 'Optional notes.'],
      ['Active (Yes/No)', 'No', 'Yes (default) or No.'],
      ['Opening stock <warehouse>', 'No', 'Starting quantity per warehouse for NEW products. Recorded as Stock In (reference OPENING-STOCK).'],
    ].map((r) => r.map((value) => ({ value }))),
  ];
  const blob = await writeExcelFile([
    { data: [header, ...examples], sheet: 'Products', columns: header.map((_, i) => ({ width: i === 1 || i === 6 ? 32 : 18 })) },
    { data: help, sheet: 'Instructions', columns: [{ width: 26 }, { width: 10 }, { width: 90 }] },
  ]).toBlob();
  await download(blob, 'StockSense-product-import-template.xlsx');
}

export async function exportProducts(products: Product[], warehouses: Warehouse[]) {
  const active = warehouses.filter((w) => w.isActive);
  const header = [...TEMPLATE_HEADERS, 'On hand (total)', ...active.map((w) => `On hand ${w.code}`)].map(headerCell);
  const rows = products.map((p) => {
    const byWh = new Map(p.stockByWarehouse.map((s) => [s.warehouseId, s.quantity]));
    return [p.sku, p.name, p.category, p.unit, p.unitPrice, p.reorderLevel, p.description, p.isActive ? 'Yes' : 'No', p.totalStock, ...active.map((w) => byWh.get(w.id) ?? 0)].map((value) =>
      value === null || value === undefined ? null : { value },
    );
  });
  const blob = await writeExcelFile([{ data: [header, ...rows], sheet: 'Products', columns: header.map((_, i) => ({ width: i === 1 || i === 6 ? 32 : 16 })) }]).toBlob();
  await download(blob, `StockSense-products-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function downloadImportReport(results: { row: ImportRow; status: string; message: string }[]) {
  const header = ['Row', 'SKU', 'Product name', 'Result', 'Details'].map(headerCell);
  const rows = results.map((r) => [r.row.rowNumber, r.row.sku, r.row.name, r.status, r.message].map((value) => ({ value })));
  const blob = await writeExcelFile([{ data: [header, ...rows], sheet: 'Import results', columns: [{ width: 8 }, { width: 18 }, { width: 32 }, { width: 12 }, { width: 70 }] }]).toBlob();
  await download(blob, `StockSense-import-results-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
