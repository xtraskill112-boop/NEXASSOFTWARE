/** Store hours are "HH:MM" strings in the shop's own time zone. */
export const STORE_TIME_ZONE = "Asia/Kolkata";

export function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return ((h ?? 0) % 24) * 60 + (m ?? 0);
}

/** Minutes since midnight in the shop's time zone, whatever the server's or visitor's clock says. */
export function minutesNow(at: Date = new Date(), timeZone = STORE_TIME_ZONE): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return n("hour") * 60 + n("minute");
}

/**
 * Whether the shop is open at `minute` (0–1439). Equal times mean open all day; a closing time at or
 * before the opening time means the hours run past midnight (e.g. 18:00–02:00).
 */
export function isOpenAt(openingTime: string, closingTime: string, minute: number): boolean {
  const open = minutesOfDay(openingTime);
  const close = minutesOfDay(closingTime);
  if (open === close) return true;
  return open < close ? minute >= open && minute < close : minute >= open || minute < close;
}

/** "08:00" → "8 AM", "22:30" → "10:30 PM". */
export function clockLabel(hhmm: string): string {
  const t = minutesOfDay(hhmm);
  const h = Math.floor(t / 60), m = t % 60;
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

/** What a customer sees when they try to order outside opening hours; null while the shop is open. */
export function closedNotice(openingTime: string, closingTime: string, minute: number): string | null {
  if (isOpenAt(openingTime, closingTime, minute)) return null;
  return `We're closed right now. You can place your order from ${clockLabel(openingTime)} (we're open ${clockLabel(openingTime)}–${clockLabel(closingTime)}).`;
}
