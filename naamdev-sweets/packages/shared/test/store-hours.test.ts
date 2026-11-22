import { describe, expect, it } from "vitest";
import { clockLabel, closedNotice, isOpenAt, minutesNow, minutesOfDay } from "../src/store-hours";

describe("store hours", () => {
  it("opens at the opening minute and closes at the closing minute", () => {
    expect(isOpenAt("08:00", "22:00", minutesOfDay("07:59"))).toBe(false);
    expect(isOpenAt("08:00", "22:00", minutesOfDay("08:00"))).toBe(true);
    expect(isOpenAt("08:00", "22:00", minutesOfDay("21:59"))).toBe(true);
    expect(isOpenAt("08:00", "22:00", minutesOfDay("22:00"))).toBe(false);
    expect(isOpenAt("08:00", "22:00", minutesOfDay("23:30"))).toBe(false);
  });
  it("handles hours that run past midnight and all-day hours", () => {
    expect(isOpenAt("18:00", "02:00", minutesOfDay("23:00"))).toBe(true);
    expect(isOpenAt("18:00", "02:00", minutesOfDay("01:59"))).toBe(true);
    expect(isOpenAt("18:00", "02:00", minutesOfDay("02:00"))).toBe(false);
    expect(isOpenAt("00:00", "00:00", minutesOfDay("03:00"))).toBe(true);
  });
  it("reads the clock in India time, not the machine's", () => {
    // 16:45 UTC is 22:15 in India (UTC+5:30).
    expect(minutesNow(new Date("2026-11-22T16:45:00Z"))).toBe(minutesOfDay("22:15"));
    expect(isOpenAt("08:00", "22:00", minutesNow(new Date("2026-11-22T16:45:00Z")))).toBe(false);
    expect(isOpenAt("08:00", "22:00", minutesNow(new Date("2026-11-22T05:00:00Z")))).toBe(true);
  });
  it("tells customers when they can order while the shop is closed", () => {
    expect(closedNotice("08:00", "22:00", minutesOfDay("12:00"))).toBeNull();
    expect(closedNotice("08:00", "22:00", minutesOfDay("22:05"))).toBe("We're closed right now. You can place your order from 8 AM (we're open 8 AM–10 PM).");
  });
  it("labels times the way the shop writes them", () => {
    expect(clockLabel("08:00")).toBe("8 AM");
    expect(clockLabel("22:00")).toBe("10 PM");
    expect(clockLabel("12:30")).toBe("12:30 PM");
    expect(clockLabel("00:15")).toBe("12:15 AM");
  });
});
