import { describe, expect, it, vi } from "vitest";

// This file runs in its own module scope: switch off dev OTP echo and the SMS provider
// before the app (and its env parser) is imported, to model a production deploy without SMS.
vi.hoisted(() => {
  process.env.OTP_DEV_ECHO = "false";
  process.env.SMS_PROVIDER = "none";
});

const { prisma } = await import("@naamdev/db");
const { client, uniquePhone } = await import("./helpers");

describe("OTP delivery honesty", () => {
  it("refuses to report an OTP as sent when no SMS provider can deliver it", async () => {
    const c = await client();
    const phone = uniquePhone();
    const r = await c.post("/api/v1/auth/otp/request", { phone, purpose: "LOGIN" });
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(r.body.devCode).toBeUndefined();
    // The undeliverable code is not left behind as a usable OTP.
    expect(await prisma.otpCode.count({ where: { target: { contains: phone.slice(-10) } } })).toBe(0);
  });

  it("forgot-password by SMS says the channel is unavailable, the same way for every number", async () => {
    const c = await client();
    const unknown = await c.post("/api/v1/auth/password/forgot", { identifier: uniquePhone() });
    expect(unknown.status).toBe(503);
    expect(unknown.body.devCode).toBeUndefined();
  });
});
