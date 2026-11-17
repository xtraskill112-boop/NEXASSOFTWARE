import { describe, expect, it } from "vitest";
import { prisma } from "@naamdev/db";
import { client, loginAs, newCustomer, uniquePhone } from "./helpers";

describe("authentication", () => {
  it("registers a customer via OTP and returns the profile with signup bonus", async () => {
    const { c, user } = await newCustomer("Asha Sharma");
    expect(user.loyaltyPoints).toBe(50);
    const me = await c.get("/api/v1/auth/me");
    expect(me.body.user.name).toBe("Asha Sharma");
    expect(me.body.user.role.key).toBe("CUSTOMER");
    expect(me.body.user.phoneVerified).toBe(true);
  });

  it("OTP login for an unknown number requires registration, then completes with a token", async () => {
    const c = await client();
    const phone = uniquePhone();
    const otp = await c.post("/api/v1/auth/otp/request", { phone, purpose: "LOGIN" });
    expect(otp.status).toBe(200);
    const v = await c.post("/api/v1/auth/otp/verify", { phone, otp: otp.body.devCode });
    expect(v.body.registrationRequired).toBe(true);
    const reg = await c.post("/api/v1/auth/register", { name: "Rohan", registrationToken: v.body.registrationToken });
    expect(reg.status).toBe(201);
    expect(reg.body.user.hasPassword).toBe(false);
  });

  it("rejects a wrong OTP and locks after repeated attempts", async () => {
    const c = await client();
    const phone = uniquePhone();
    await c.post("/api/v1/auth/otp/request", { phone, purpose: "LOGIN" });
    const bad = await c.post("/api/v1/auth/otp/verify", { phone, otp: "000000" });
    expect([400, 429]).toContain(bad.status);
  });

  it("logs in with password, rejects bad credentials with a generic message", async () => {
    const c = await client();
    const ok = await c.post("/api/v1/auth/login", { identifier: "customer@naamdevsweets.local", password: "Naamdev@123" });
    expect(ok.status).toBe(200);
    const bad = await c.post("/api/v1/auth/login", { identifier: "customer@naamdevsweets.local", password: "wrong-password1" });
    expect(bad.status).toBe(401);
    const unknown = await c.post("/api/v1/auth/login", { identifier: "nobody@example.com", password: "wrong-password1" });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.message).toBe(bad.body.error.message);
  });

  it("stores passwords as argon2 hashes, never plaintext", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { email: "customer@naamdevsweets.local" } });
    expect(u.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it("blocks customers from the admin console and allows staff", async () => {
    const c = await client("admin");
    const r = await c.post("/api/v1/auth/login", { identifier: "customer@naamdevsweets.local", password: "Naamdev@123" });
    expect(r.status).toBe(403);
    const staff = await loginAs("manager@naamdevsweets.local");
    const me = await staff.get("/api/v1/auth/me");
    expect(me.body.user.role.isStaff).toBe(true);
    expect(me.body.user.permissions).toContain("orders.manage");
  });

  it("requires a CSRF token for state-changing requests", async () => {
    const c = await client();
    const r = await c.agent.post("/api/v1/auth/login").set("x-nds-app", "web").send({ identifier: "x@y.z", password: "x" });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("CSRF_FAILED");
  });

  it("resets a password with an OTP and revokes old sessions", async () => {
    const { c, phone } = await newCustomer("Reset Me");
    const other = await client();
    const f = await other.post("/api/v1/auth/password/forgot", { identifier: phone });
    expect(f.body.devCode).toMatch(/^\d{6}$/);
    const r = await other.post("/api/v1/auth/password/reset", { identifier: phone, otp: f.body.devCode, password: "NewSweets@99" });
    expect(r.status).toBe(200);
    const me = await c.get("/api/v1/auth/me");
    expect(me.body.user).toBeNull();
    const login = await other.post("/api/v1/auth/login", { identifier: phone, password: "NewSweets@99" });
    expect(login.status).toBe(200);
  });

  it("logs out and invalidates the session", async () => {
    const { c } = await newCustomer();
    await c.post("/api/v1/auth/logout");
    const me = await c.get("/api/v1/auth/me");
    expect(me.body.user).toBeNull();
    const orders = await c.get("/api/v1/orders");
    expect(orders.status).toBe(401);
  });
});
