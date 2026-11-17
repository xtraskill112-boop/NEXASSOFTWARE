import { describe, expect, it } from "vitest";
import { canTransition, nextStatuses, hasPermission, SYSTEM_ROLES, allocateProportionally, formatINR, normalizeIndianPhone, pointsEarned, tierFor, DEFAULT_SETTINGS, translate, haversineKm } from "../src";

describe("order state machine", () => {
  it("allows the happy path", () => {
    const path = ["PENDING", "CONFIRMED", "PROCESSING", "PREPARING", "PACKED", "READY_FOR_PICKUP", "DISPATCHED", "OUT_FOR_DELIVERY", "DELIVERED"] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
  });
  it("blocks invalid jumps", () => {
    expect(canTransition("PENDING", "DELIVERED")).toBe(false);
    expect(canTransition("DELIVERED", "CANCELLED")).toBe(false);
    expect(canTransition("OUT_FOR_DELIVERY", "CANCELLED")).toBe(false);
    expect(canTransition("REFUNDED", "REFUND_INITIATED")).toBe(false);
  });
  it("supports refund flows", () => {
    expect(nextStatuses("CANCELLED")).toEqual(["REFUND_INITIATED"]);
    expect(canTransition("REFUND_INITIATED", "REFUNDED")).toBe(true);
  });
});

describe("permissions", () => {
  it("grants super admin everything and limits packing staff", () => {
    const sa = SYSTEM_ROLES.find((r) => r.key === "SUPER_ADMIN")!;
    const packing = SYSTEM_ROLES.find((r) => r.key === "PACKING_STAFF")!;
    expect(hasPermission(sa.permissions, ["roles.manage", "settings.manage"])).toBe(true);
    expect(hasPermission(packing.permissions, "orders.process")).toBe(true);
    expect(hasPermission(packing.permissions, "refunds.manage")).toBe(false);
    expect(hasPermission(undefined, "orders.view")).toBe(false);
  });
});

describe("utilities", () => {
  it("allocates proportionally and sums exactly", () => {
    const parts = allocateProportionally(1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts).toEqual([334, 333, 333]);
  });
  it("formats rupees in Indian grouping", () => {
    expect(formatINR(12345600)).toBe("₹1,23,456");
    expect(formatINR(9950)).toBe("₹99.5");
  });
  it("normalises Indian phone numbers", () => {
    expect(normalizeIndianPhone("98765 43210")).toBe("+919876543210");
    expect(normalizeIndianPhone("+91-98765-43210")).toBe("+919876543210");
    expect(normalizeIndianPhone("12345")).toBeNull();
    expect(normalizeIndianPhone("5876543210")).toBeNull();
  });
  it("computes loyalty earn with tier multiplier", () => {
    expect(pointsEarned(100000, 0, DEFAULT_SETTINGS.loyalty)).toBe(50);
    expect(pointsEarned(100000, 6000, DEFAULT_SETTINGS.loyalty)).toBe(75);
    expect(tierFor(1600).key).toBe("GOLD");
  });
  it("translates with variables and falls back", () => {
    expect(translate("hi", "nav.cart")).toBe("कार्ट");
    expect(translate("en", "common.onlyLeft", { n: 3 })).toBe("Only 3 left");
  });
  it("computes haversine distance", () => {
    const d = haversineKm({ lat: 28.6139, lng: 77.209 }, { lat: 28.7041, lng: 77.1025 });
    expect(d).toBeGreaterThan(13);
    expect(d).toBeLessThan(15);
  });
});
