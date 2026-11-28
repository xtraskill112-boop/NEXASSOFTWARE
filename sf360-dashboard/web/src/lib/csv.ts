import type { AddressPayload, ForwardOrderPayload } from "../api";
import type { SavedAddress, Shipment } from "../types";
import { groupLabel } from "./status";
import { toDate } from "./format";

/** Columns of the bulk-booking template. * = required. */
export const BULK_COLUMNS: { key: string; required: boolean; help: string }[] = [
  { key: "client_order_id", required: true, help: "Your order ID (unique). Repeat it on several rows to add more products to one order." },
  { key: "customer_name", required: true, help: "Customer full name" },
  { key: "customer_phone", required: true, help: "10-digit mobile" },
  { key: "customer_alt_phone", required: false, help: "Optional second number" },
  { key: "address_line_1", required: true, help: "House, street, area" },
  { key: "address_line_2", required: false, help: "Landmark (optional)" },
  { key: "city", required: true, help: "City" },
  { key: "state", required: false, help: "State" },
  { key: "pincode", required: true, help: "6-digit delivery pincode" },
  { key: "payment_mode", required: true, help: "prepaid or cod" },
  { key: "cod_amount", required: false, help: "Amount to collect (COD only)" },
  { key: "product_value", required: true, help: "Total value of the order in ₹ (without tax)" },
  { key: "total_amount", required: false, help: "Total incl. tax (optional)" },
  { key: "weight_kg", required: false, help: "Weight in kg, e.g. 0.5" },
  { key: "sku_name", required: true, help: "Product name" },
  { key: "sku_id", required: true, help: "Your SKU code" },
  { key: "quantity", required: false, help: "Units (default 1)" },
  { key: "unit_price", required: false, help: "Price per unit (default: product_value / quantity)" },
  { key: "category", required: false, help: "Product category" },
  { key: "hsn_code", required: false, help: "HSN code" },
  { key: "invoice_no", required: false, help: "Invoice number" },
  { key: "eway_bill", required: false, help: "12-digit e-way bill (required at ₹50,000 or more)" },
  { key: "pickup_date", required: false, help: "YYYY-MM-DD (marketplace orders only)" },
  { key: "pickup_slot", required: false, help: "Slot key from Shadowfax, e.g. slot_1 (marketplace only)" },
];

export function templateCsv(): string {
  const header = BULK_COLUMNS.map((c) => c.key).join(",");
  const example = [
    "ORD-1001", "Rahul Sharma", "9876543210", "", "42 MG Road Koramangala", "Near Forum Mall", "Bengaluru", "Karnataka", "560034",
    "cod", "1299", "1299", "", "0.5", "Wireless Headphones", "SKU-HP-01", "1", "1299", "Electronics", "85183000", "INV-1001", "", "", "",
  ].join(",");
  return `${header}\n${example}\n`;
}

export type RawRow = Record<string, string>;

/** Normalises header names: "Customer Phone" → "customer_phone". */
export function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\*/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Turns a 2-D sheet (first row = header) into keyed rows, skipping empty lines. */
export function rowsFromTable(table: unknown[][]): RawRow[] {
  if (!table.length) return [];
  const header = table[0].map((h) => normalizeHeader(String(h ?? "")));
  const out: RawRow[] = [];
  for (const line of table.slice(1)) {
    const row: RawRow = {};
    let any = false;
    header.forEach((h, i) => {
      if (!h) return;
      const v = cellToString(line[i]);
      if (v) any = true;
      row[h] = v;
    });
    if (any) out.push(row);
  }
  return out;
}

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

export interface BulkOrder {
  payload: ForwardOrderPayload;
  /** 1-based line numbers in the uploaded file (header is line 1). */
  lines: number[];
}

export interface BulkDefaults {
  orderType: "marketplace" | "warehouse";
  returnType: "seller" | "origin";
  pickup: SavedAddress;
  returnAddress: SavedAddress;
  sellerGstin?: string | null;
}

export function addressPayload(a: SavedAddress): AddressPayload {
  return {
    name: a.name ?? undefined,
    contact: a.contact ?? undefined,
    alternateContact: a.alternateContact ?? undefined,
    address1: a.address1,
    address2: a.address2 ?? undefined,
    city: a.city,
    state: a.state ?? undefined,
    pincode: a.pincode,
    email: a.email ?? undefined,
    uniqueCode: a.uniqueCode ?? undefined,
  };
}

/** Groups rows by client_order_id (several rows = several products) and builds API payloads. */
export function buildBulkOrders(rows: RawRow[], d: BulkDefaults): BulkOrder[] {
  const byId = new Map<string, BulkOrder>();
  const order: BulkOrder[] = [];
  rows.forEach((r, i) => {
    const line = i + 2;
    const id = r.client_order_id ?? "";
    const qty = r.quantity ? Number(r.quantity) : 1;
    const productValue = r.product_value ?? "";
    const unitPrice = r.unit_price || (productValue && qty ? String(Math.round((Number(productValue) / qty) * 100) / 100) : "");
    const product = {
      name: r.sku_name ?? "",
      skuId: r.sku_id ?? "",
      price: unitPrice,
      quantity: r.quantity || undefined,
      category: r.category || undefined,
      hsnCode: r.hsn_code || undefined,
      invoiceNo: r.invoice_no || undefined,
    };
    const existing = id ? byId.get(id) : undefined;
    if (existing) {
      existing.payload.products.push(product);
      existing.lines.push(line);
      return;
    }
    const paymentMode = (r.payment_mode ?? "").toLowerCase().trim() === "cod" ? "cod" : (r.payment_mode ?? "").toLowerCase().trim() === "prepaid" ? "prepaid" : (r.payment_mode as "prepaid");
    const entry: BulkOrder = {
      lines: [line],
      payload: {
        orderType: d.orderType,
        clientOrderId: id,
        paymentMode,
        codAmount: paymentMode === "cod" ? (r.cod_amount ?? "") : 0,
        productValue,
        totalAmount: r.total_amount || undefined,
        actualWeightKg: r.weight_kg || undefined,
        ewayBill: r.eway_bill || undefined,
        sellerGstin: d.sellerGstin || undefined,
        customer: {
          name: r.customer_name ?? "",
          contact: r.customer_phone ?? "",
          alternateContact: r.customer_alt_phone || undefined,
          address1: r.address_line_1 ?? "",
          address2: r.address_line_2 || undefined,
          city: r.city ?? "",
          state: r.state || undefined,
          pincode: r.pincode ?? "",
        },
        pickup: {
          ...addressPayload(d.pickup),
          pickupDate: r.pickup_date || undefined,
          pickupSlot: r.pickup_slot || undefined,
        },
        returnType: d.orderType === "warehouse" ? "origin" : d.returnType,
        returnAddress: addressPayload(d.returnAddress),
        products: [product],
      },
    };
    if (id) byId.set(id, entry);
    order.push(entry);
  });
  return order;
}

/** Quick checks before upload; the server validates everything again. */
export function missingColumns(rows: RawRow[]): string[] {
  if (!rows.length) return [];
  const present = new Set(Object.keys(rows[0]));
  return BULK_COLUMNS.filter((c) => c.required && !present.has(c.key)).map((c) => c.key);
}

function escapeCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  // Stop spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(escapeCell).join(",")).join("\r\n");
}

export function shipmentsCsv(list: Shipment[]): string {
  const header = [
    "AWB", "Order ID", "Type", "Order type", "Status", "Bucket", "Payment", "COD amount", "Product value",
    "Customer", "Phone", "City", "State", "Pincode", "Pickup date", "Booked at (IST)", "Last update (IST)", "Tracking link",
  ];
  const ist = (v: Parameters<typeof toDate>[0]) => {
    const d = toDate(v);
    return d ? new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 16).replace("T", " ") : "";
  };
  const rows = list.map((s) => [
    s.awb,
    s.clientOrderId ?? "",
    s.kind === "reverse" ? "Return" : "Forward",
    s.orderType ?? "",
    s.statusDisplay,
    groupLabel(s.statusGroup, s.kind),
    s.paymentMode ?? "",
    s.codAmount,
    s.productValue,
    s.customer?.name ?? "",
    s.customer?.contact ?? "",
    s.customer?.city ?? "",
    s.customer?.state ?? "",
    s.customer?.pincode ?? "",
    s.pickupDate ?? "",
    ist(s.createdAt),
    ist(s.lastEventAt ?? s.updatedAt),
    s.trackUrl ?? "",
  ]);
  return toCsv([header, ...rows]);
}

export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  // BOM so Excel opens ₹ and Hindi names correctly.
  const blob = new Blob(["﻿", text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
