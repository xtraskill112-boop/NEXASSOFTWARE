import request from "supertest";
import { createHmac, randomUUID } from "node:crypto";
import { prisma } from "@naamdev/db";
import { createApp } from "../src/app";
import { drainNotifications } from "../src/modules/notifications/service";
import { DEMO_PASSWORD, RZP_KEY_SECRET, RZP_MOCK_PORT, RZP_WEBHOOK_SECRET } from "./constants";

export const app = createApp();
type App = "web" | "admin" | "delivery";

export class Client {
  agent = request.agent(app);
  csrf = "";
  constructor(public appName: App = "web") {}
  async init() {
    const r = await this.agent.get("/api/v1/auth/csrf").set("x-nds-app", this.appName);
    this.csrf = r.body.csrfToken;
    return this;
  }
  private h(t: request.Test) {
    return t.set("x-nds-app", this.appName).set("x-csrf-token", this.csrf);
  }
  get(url: string) { return this.h(this.agent.get(url)); }
  post(url: string, body: object = {}) { return this.h(this.agent.post(url)).send(body); }
  put(url: string, body: object = {}) { return this.h(this.agent.put(url)).send(body); }
  patch(url: string, body: object = {}) { return this.h(this.agent.patch(url)).send(body); }
  del(url: string, body: object = {}) { return this.h(this.agent.delete(url)).send(body); }
}

export async function client(appName: App = "web") {
  return new Client(appName).init();
}

export async function loginAs(email: string, appName: App = "admin", password = DEMO_PASSWORD) {
  const c = await client(appName);
  const r = await c.post("/api/v1/auth/login", { identifier: email, password });
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${r.status} ${JSON.stringify(r.body)}`);
  return c;
}

let phoneSeq = Math.floor(Math.random() * 8_000_000);
export const uniquePhone = () => `9${String(100_000_000 + (phoneSeq++ % 899_999_999)).padStart(9, "0")}`;

/** Registers a brand-new customer through the real OTP flow and returns a logged-in client. */
export async function newCustomer(name = "Test Customer") {
  const c = await client("web");
  const phone = uniquePhone();
  const otp = await c.post("/api/v1/auth/otp/request", { phone, purpose: "REGISTER" });
  if (!otp.body.devCode) throw new Error("OTP dev echo not available: " + JSON.stringify(otp.body));
  const reg = await c.post("/api/v1/auth/register", { name, phone, otp: otp.body.devCode, password: "Sweets@2026" });
  if (reg.status !== 201) throw new Error("register failed " + JSON.stringify(reg.body));
  return { c, phone: `+91${phone}`, user: reg.body.user as { id: string; loyaltyPoints: number } };
}

export async function addAddress(c: Client, pincode = "302001") {
  const r = await c.post("/api/v1/account/addresses", {
    type: "HOME", fullName: "Test Customer", phone: "9876543210", line1: "12 Test Street", line2: "C-Scheme", city: "Jaipur", state: "Rajasthan", pincode, lat: 26.905, lng: 75.803,
  });
  if (r.status !== 201) throw new Error("address failed " + JSON.stringify(r.body));
  return r.body.address.id as string;
}

export async function variantBySlug(slug: string, index = 0) {
  const p = await prisma.product.findUniqueOrThrow({ where: { slug }, include: { variants: { orderBy: { sortOrder: "asc" }, include: { inventory: true } } } });
  return p.variants[index]!;
}

export const inventoryOf = (variantId: string) => prisma.inventory.findUniqueOrThrow({ where: { variantId } });

export async function placeCodOrder(c: Client, addressId: string, extra: object = {}) {
  return c.post("/api/v1/checkout/place-order", { addressId, paymentMethod: "COD", idempotencyKey: randomUUID(), ...extra });
}

export const rzp = {
  async pay(orderId: string, amount?: number) {
    const r = await fetch(`http://localhost:${RZP_MOCK_PORT}/__test/pay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ order_id: orderId, amount }) });
    return (await r.json()) as { id: string; order_id: string; amount: number };
  },
  async setRefundStatus(id: string, status: string) {
    await fetch(`http://localhost:${RZP_MOCK_PORT}/__test/refund-status`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }) });
  },
  signature: (orderId: string, paymentId: string) => createHmac("sha256", RZP_KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex"),
  webhook(event: object, eventId = randomUUID()) {
    const raw = JSON.stringify(event);
    const sig = createHmac("sha256", RZP_WEBHOOK_SECRET).update(raw).digest("hex");
    return request(app).post("/api/v1/payments/razorpay/webhook").set("content-type", "application/json").set("x-razorpay-signature", sig).set("x-razorpay-event-id", eventId).send(raw);
  },
};

export const settle = () => drainNotifications();
