import { describe, expect, it } from "vitest";
import { auth as firebaseAuth } from "@naamdev/db";
import { Client, CUSTOMER_PASSWORD, firebaseSignIn, firebaseSignUp, loginAs, newCustomer, uniqueEmail, userDoc } from "./helpers";

describe("authentication (Firebase email + password)", () => {
  it("signs up a customer, creates the profile with the signup bonus", async () => {
    const { c, email, user } = await newCustomer("Asha Sharma");
    expect(user.loyaltyPoints).toBe(50);
    const me = await c.get("/api/v1/auth/me");
    expect(me.body.user.name).toBe("Asha Sharma");
    expect(me.body.user.email).toBe(email);
    expect(me.body.user.role.key).toBe("CUSTOMER");
    // Custom claims mirror the role for Firestore security rules.
    const fb = await firebaseAuth.getUser(user.id);
    expect(fb.customClaims).toMatchObject({ role: "CUSTOMER", staff: false });
  });

  it("reports a signed-in Firebase account without a profile as needing one", async () => {
    const c = new Client("web");
    c.token = (await firebaseSignUp(uniqueEmail("half"), CUSTOMER_PASSWORD)).idToken;
    const me = await c.get("/api/v1/auth/me");
    expect(me.body.user).toBeNull();
    expect(me.body.needsProfile).toBe(true);
    const orders = await c.get("/api/v1/orders");
    expect(orders.status).toBe(401);
  });

  it("rejects missing, malformed and forged tokens", async () => {
    const c = new Client("web");
    expect((await c.get("/api/v1/orders")).status).toBe(401);
    c.token = "not-a-jwt";
    expect((await c.get("/api/v1/orders")).status).toBe(401);
    expect((await c.get("/api/v1/auth/me")).body.user).toBeNull();
  });

  it("validates the profile and never lets the client pick its role", async () => {
    const c = new Client("web");
    c.token = (await firebaseSignUp(uniqueEmail("role"), CUSTOMER_PASSWORD)).idToken;
    const bad = await c.post("/api/v1/auth/register", { name: "X", phone: "123" });
    expect(bad.status).toBe(400);
    const ok = await c.post("/api/v1/auth/register", { name: "Sneaky", roleKey: "SUPER_ADMIN", isStaff: true });
    expect(ok.status).toBe(201);
    expect(ok.body.user.role.key).toBe("CUSTOMER");
  });

  it("blocks customers from the admin console and allows staff", async () => {
    const c = new Client("admin");
    const r = await c.signIn("customer@naamdevsweets.local", "Naamdev@123");
    expect(r.status).toBe(403);
    const staff = await loginAs("manager@naamdevsweets.local");
    const me = await staff.get("/api/v1/auth/me");
    expect(me.body.user.role.isStaff).toBe(true);
    expect(me.body.user.permissions).toContain("orders.manage");
  });

  it("wrong passwords are rejected by Firebase Auth", async () => {
    await expect(firebaseSignIn("customer@naamdevsweets.local", "wrong-password1")).rejects.toThrow(/INVALID_PASSWORD|INVALID_LOGIN_CREDENTIALS/);
  });

  it("sign out everywhere rejects previously issued tokens", async () => {
    const { c, email, password } = await newCustomer("Everywhere");
    const r = await c.post("/api/v1/auth/sign-out-everywhere");
    expect(r.status).toBe(200);
    // Tokens issued in the same second stay valid, as with Firebase's own revocation check.
    await new Promise((res) => setTimeout(res, 1100));
    expect((await c.get("/api/v1/auth/me")).body.user).toBeNull();
    const again = new Client("web");
    await new Promise((res) => setTimeout(res, 1100));
    const s = await again.signIn(email, password);
    expect(s.status).toBe(200);
  });

  it("suspended customers lose access and can't sign in", async () => {
    const { c, user, email, password } = await newCustomer("Suspend Me");
    const admin = await loginAs("admin@naamdevsweets.local");
    expect((await admin.post(`/api/v1/admin/people/customers/${user.id}/status`, { status: "SUSPENDED", reason: "Abuse" })).status).toBe(200);
    expect((await c.get("/api/v1/orders")).status).toBe(401);
    await expect(firebaseSignIn(email, password)).rejects.toThrow(/USER_DISABLED/);
    expect((await userDoc(user.id)).status).toBe("SUSPENDED");
    await admin.post(`/api/v1/admin/people/customers/${user.id}/status`, { status: "ACTIVE" });
    expect((await firebaseSignIn(email, password)).idToken).toBeTruthy();
  });
});
