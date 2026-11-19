import type { Transaction } from "firebase-admin/firestore";
import { nextCounter } from "@naamdev/db";

export { nextCounter };

const istParts = (d = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "2-digit", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { yy: get("year"), mm: get("month"), dd: get("day") };
};

export async function nextOrderNumber(tx: Transaction): Promise<string> {
  const { yy, mm, dd } = istParts();
  const n = await nextCounter(tx, `order-${yy}${mm}${dd}`);
  return `ND${yy}${mm}${dd}-${String(n).padStart(4, "0")}`;
}

/** GST invoice numbers run per Indian financial year (April–March). */
export async function nextInvoiceNumber(tx: Transaction): Promise<string> {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const startYear = ist.getMonth() >= 3 ? ist.getFullYear() : ist.getFullYear() - 1;
  const fy = `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
  const n = await nextCounter(tx, `invoice-${fy}`);
  return `NDS/${fy}/${String(n).padStart(6, "0")}`;
}

export async function nextTicketNumber(tx: Transaction): Promise<string> {
  return `TKT-${String(await nextCounter(tx, "ticket")).padStart(6, "0")}`;
}

export async function nextPurchaseNumber(tx: Transaction): Promise<string> {
  const { yy, mm } = istParts();
  return `PO-${yy}${mm}-${String(await nextCounter(tx, `purchase-${yy}${mm}`)).padStart(4, "0")}`;
}
