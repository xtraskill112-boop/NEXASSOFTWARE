import type { Timestamp } from "firebase/firestore";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inrExact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("en-IN");

export const money = (v: number | null | undefined) => inr.format(v ?? 0);
export const moneyExact = (v: number | null | undefined) => inrExact.format(v ?? 0);
export const count = (v: number | null | undefined) => num.format(v ?? 0);

const dateTime = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});
const dateOnly = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export function toDate(v: Timestamp | Date | string | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return v.toDate();
}

export const fmtDateTime = (v: Timestamp | Date | string | null | undefined) => {
  const d = toDate(v);
  return d ? dateTime.format(d) : "—";
};
export const fmtDate = (v: Timestamp | Date | string | null | undefined) => {
  const d = toDate(v);
  return d ? dateOnly.format(d) : "—";
};

/** Today in India, YYYY-MM-DD (matches the pickupDate field). */
export function todayIST(offsetDays = 0): string {
  return new Date(Date.now() + 5.5 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10);
}

/** Start of a YYYY-MM-DD day in India, as a Date. */
export function istDayStart(day: string): Date {
  return new Date(`${day}T00:00:00+05:30`);
}

export function relative(v: Timestamp | Date | string | null | undefined): string {
  const d = toDate(v);
  if (!d) return "—";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return fmtDate(d);
}

/** Same normalisation as functions/src/model.ts normalizeSearch. */
export function normalizeSearch(term: string): string {
  const t = term.trim().toLowerCase();
  const digits = t.replace(/\D/g, "");
  if (digits.length >= 10 && digits.length === t.replace(/[\s+()-]/g, "").length) return digits.slice(-10);
  // Search one token: the longest word (name prefixes are indexed per word).
  if (/\s/.test(t)) return t.split(/\s+/).sort((a, b) => b.length - a.length)[0].slice(0, 15);
  return t.length > 15 && !/\d/.test(t) ? t.slice(0, 15) : t;
}
