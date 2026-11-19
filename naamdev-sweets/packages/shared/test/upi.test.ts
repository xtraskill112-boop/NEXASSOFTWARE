import { describe, expect, it } from "vitest";
import { buildUpiLink, upiProofSchema } from "../src";

describe("UPI payment link", () => {
  it("matches the shop's link format with the order amount and number filled in", () => {
    const link = buildUpiLink({ vpa: "paytmqr6rgzn2@ptys", payeeName: "RAKESH TAILOR", amountPaise: 45050, note: "ORDER #ND261119-0042" });
    expect(link).toBe("upi://pay?pa=paytmqr6rgzn2%40ptys&pn=RAKESH%20TAILOR&am=450.50&cu=INR&tn=ORDER%20%23ND261119-0042");
  });

  it("encodes characters UPI apps would otherwise misread", () => {
    const link = buildUpiLink({ vpa: "shop@upi", payeeName: "A & B (Sweets)", amountPaise: 100, note: "x+y" });
    expect(link).toContain("pn=A%20%26%20B%20%28Sweets%29");
    expect(link).toContain("tn=x%2By");
    expect(link).toContain("am=1.00");
  });

  it("accepts only 12-digit UPI references", () => {
    expect(upiProofSchema.safeParse({ utr: "4123 4567 8901" }).success).toBe(true);
    expect(upiProofSchema.safeParse({ utr: "41234567890" }).success).toBe(false);
    expect(upiProofSchema.safeParse({ utr: "ABCDEFGHIJKL" }).success).toBe(false);
  });
});
