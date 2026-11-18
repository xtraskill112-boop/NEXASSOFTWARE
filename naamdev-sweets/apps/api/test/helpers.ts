import request from "supertest";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { C, db, getDoc, getDocs, type Inventory, type Order, type Product, type User } from "@naamdev/db";
import { createApp } from "../src/app";
import { drainNotifications } from "../src/modules/notifications/service";
import { DEMO_PASSWORD, RZP_KEY_SECRET, RZP_MOCK_PORT, RZP_WEBHOOK_SECRET } from "./constants";

export const app = createApp();
type App = "web" | "admin" | "delivery";

/** Firebase Auth emulator REST API — what the browser SDK calls for email/password sign-in. */
async function identity(op: "signUp" | "signInWithPassword", email: string, password: string) {
  const r = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:${op}?key=emulator-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const j = (await r.json()) as { idToken?: string; localId?: string; error?: { message: string } };
  if (!r.ok || !j.idToken) throw new Error(`${op} failed for ${email}: ${j.error?.message ?? r.status}`);
  return { idToken: j.idToken, uid: j.localId! };
}

export const firebaseSignIn = (email: string, password: string) => identity("signInWithPassword", email, password);
export const firebaseSignUp = (email: string, password: string) => identity("signUp", email, password);

/** An API client like the browser apps: bearer ID token + guest cart token header. */
export class Client {
  token: string | null = null;
  cartToken: string | null = null;
  constructor(public appName: App = "web") {}

  private async send(t: request.Test, body?: object) {
    t.set("x-nds-app", this.appName);
    if (this.token) t.set("authorization", `Bearer ${this.token}`);
    if (this.cartToken) t.set("x-cart-token", this.cartToken);
    const res = await (body ? t.send(body) : t);
    const issued = res.headers["x-cart-token"];
    if (typeof issued === "string") this.cartToken = issued || null;
    return res;
  }
  get(url: string) { return this.send(request(app).get(url)); }
  post(url: string, body: object = {}) { return this.send(request(app).post(url), body); }
  put(url: string, body: object = {}) { return this.send(request(app).put(url), body); }
  patch(url: string, body: object = {}) { return this.send(request(app).patch(url), body); }
  del(url: string, body: object = {}) { return this.send(request(app).delete(url), body); }

  /** multipart/form-data upload, as the browser apps send files. */
  upload(url: string, file: Buffer, filename: string, fields: Record<string, string> = {}) {
    const t = request(app).post(url);
    for (const [k, v] of Object.entries(fields)) t.field(k, v);
    t.attach("file", file, filename);
    return this.send(t);
  }

  /** Signs in with Firebase (email + password) and opens the session, as the apps do after login. */
  async signIn(email: string, password: string) {
    this.token = (await firebaseSignIn(email, password)).idToken;
    return this.post("/api/v1/auth/session");
  }
}

export const client = async (appName: App = "web") => new Client(appName);

export async function loginAs(email: string, appName: App = "admin", password = DEMO_PASSWORD) {
  const c = new Client(appName);
  const r = await c.signIn(email, password);
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${r.status} ${JSON.stringify(r.body)}`);
  return c;
}

let phoneSeq = Math.floor(Math.random() * 8_000_000);
export const uniquePhone = () => `9${String(100_000_000 + (phoneSeq++ % 899_999_999)).padStart(9, "0")}`;
export const uniqueEmail = (tag = "cust") => `${tag}-${Date.now()}-${randomBytes(3).toString("hex")}@test.naamdev.local`;
export const CUSTOMER_PASSWORD = "Sweets@2026";

/** Signs up a brand-new customer (Firebase email/password) and completes the NAAMDEV profile. */
export async function newCustomer(name = "Test Customer", c = new Client("web")) {
  const email = uniqueEmail();
  c.token = (await firebaseSignUp(email, CUSTOMER_PASSWORD)).idToken;
  const reg = await c.post("/api/v1/auth/register", { name, phone: uniquePhone() });
  if (reg.status !== 201) throw new Error("register failed " + JSON.stringify(reg.body));
  return { c, email, password: CUSTOMER_PASSWORD, user: reg.body.user as { id: string; loyaltyPoints: number } };
}

export async function addAddress(c: Client, pincode = "302001") {
  const r = await c.post("/api/v1/account/addresses", {
    type: "HOME", fullName: "Test Customer", phone: "9876543210", line1: "12 Test Street", line2: "C-Scheme", city: "Jaipur", state: "Rajasthan", pincode, lat: 26.905, lng: 75.803,
  });
  if (r.status !== 201) throw new Error("address failed " + JSON.stringify(r.body));
  return r.body.address.id as string;
}

export async function productBySlug(slug: string) {
  const [p] = await getDocs<Product>(db.collection(C.products).where("slug", "==", slug).limit(1));
  if (!p) throw new Error(`no product ${slug}`);
  return p;
}

export async function variantBySlug(slug: string, index = 0) {
  const p = await productBySlug(slug);
  const v = [...p.variants].sort((a, b) => a.sortOrder - b.sortOrder)[index];
  if (!v) throw new Error(`no variant ${index} for ${slug}`);
  return v;
}

export async function inventoryOf(variantId: string) {
  const inv = await getDoc<Inventory>(db.collection(C.inventory).doc(variantId));
  if (!inv) throw new Error(`no inventory for ${variantId}`);
  return inv;
}

export const orderDoc = async (id: string) => (await getDoc<Order>(db.collection(C.orders).doc(id)))!;
export const userDoc = async (id: string) => (await getDoc<User>(db.collection(C.users).doc(id)))!;

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
