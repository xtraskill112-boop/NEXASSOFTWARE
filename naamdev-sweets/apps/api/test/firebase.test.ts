import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { auth as firebaseAuth, bucket, C, db, getDoc, getDocs, type DeliveryZone, type PartnerEarning } from "@naamdev/db";
import { JOBS_SECRET } from "./constants";
import { app, Client, CUSTOMER_PASSWORD, firebaseSignIn, firebaseSignUp, loginAs, newCustomer, placeCodOrder, addAddress, settle, uniqueEmail, uniquePhone, userDoc, variantBySlug } from "./helpers";

const png = () => sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 200, g: 120, b: 40 } } }).png().toBuffer();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("staff accounts (Firebase Auth)", () => {
  it("creates staff with a role, applies claims, resets passwords and deactivates", async () => {
    const admin = await loginAs("admin@naamdevsweets.local");
    const email = uniqueEmail("staff");
    const created = await admin.post("/api/v1/admin/people/staff", {
      name: "New Packer", email, phone: uniquePhone(), password: "Packer@2026", roleId: "PACKING_STAFF", designation: "Packing staff",
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const uid = created.body.id as string;
    expect((await firebaseAuth.getUser(uid)).customClaims).toMatchObject({ role: "PACKING_STAFF", staff: true });
    expect((await userDoc(uid)).staff?.employeeCode).toMatch(/^ND-\d+$/);

    // The new staff member can use the console with exactly their role's permissions.
    const packer = await loginAs(email, "admin", "Packer@2026");
    expect((await packer.get("/api/v1/admin/orders")).status).toBe(200);
    expect((await packer.get("/api/v1/admin/people/staff")).status).toBe(403);

    // Duplicate email is refused.
    const dup = await admin.post("/api/v1/admin/people/staff", { name: "Dup", email, phone: uniquePhone(), password: "Packer@2026", roleId: "PACKING_STAFF", designation: "x y" });
    expect(dup.status).toBe(409);

    // A manager can't hand out the super admin role.
    const manager = await loginAs("manager@naamdevsweets.local");
    const escalate = await manager.post("/api/v1/admin/people/staff", { name: "Boss", email: uniqueEmail("boss"), phone: uniquePhone(), password: "Boss@20260", roleId: "SUPER_ADMIN", designation: "Boss man" });
    expect([403, 400]).toContain(escalate.status);

    // Password reset by an admin signs the old sessions out.
    await wait(1100);
    expect((await admin.post(`/api/v1/admin/people/staff/${uid}/password`, { password: "Packer@2027" })).status).toBe(200);
    expect((await packer.get("/api/v1/admin/orders")).status).toBe(401);
    await expect(firebaseSignIn(email, "Packer@2026")).rejects.toThrow();
    await wait(1100);
    const again = await loginAs(email, "admin", "Packer@2027");

    // Deactivation disables the Firebase account.
    await wait(1100);
    expect((await admin.patch(`/api/v1/admin/people/staff/${uid}`, { isActive: false })).status).toBe(200);
    expect((await again.get("/api/v1/admin/orders")).status).toBe(401);
    expect((await firebaseAuth.getUser(uid)).disabled).toBe(true);
  });

  it("creates custom roles whose permissions take effect", async () => {
    const admin = await loginAs("admin@naamdevsweets.local");
    const key = `AUDITOR_${Array.from({ length: 6 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("")}`;
    const r = await admin.post("/api/v1/admin/people/roles", { key, name: "Auditor", permissions: ["audit.view", "not.a.permission"] });
    expect(r.status).toBe(201);
    expect(r.body.role.permissions).toEqual(["audit.view"]);
    expect((await admin.post("/api/v1/admin/people/roles", { key, name: "Auditor", permissions: [] })).status).toBe(409);
    const roles = await admin.get("/api/v1/admin/people/roles");
    expect(roles.body.roles.find((x: { key: string }) => x.key === key).userCount).toBe(0);
    expect((await admin.del(`/api/v1/admin/people/roles/${key}`)).status).toBe(200);
    expect((await admin.del("/api/v1/admin/people/roles/SUPER_ADMIN")).status).toBe(400);
  });
});

describe("customer privacy", () => {
  it("anonymises a customer: profile scrubbed, sign-in removed, orders kept", async () => {
    const { c, user, email } = await newCustomer("Forget Me");
    const addressId = await addAddress(c);
    const v = await variantBySlug("kaju-katli", 1);
    await c.post("/api/v1/cart/items", { variantId: v.id, quantity: 1 });
    const order = await placeCodOrder(c, addressId);
    expect(order.status).toBe(201);
    const admin = await loginAs("admin@naamdevsweets.local");
    expect((await admin.post(`/api/v1/admin/people/customers/${user.id}/anonymize`)).status).toBe(200);
    const u = await userDoc(user.id);
    expect(u).toMatchObject({ name: "Deleted user", email: null, phone: null, status: "DELETED" });
    expect((await db.collection(C.users).doc(user.id).collection("addresses").get()).size).toBe(0);
    await expect(firebaseAuth.getUser(user.id)).rejects.toThrow();
    await expect(firebaseSignIn(email, CUSTOMER_PASSWORD)).rejects.toThrow();
    expect((await getDoc(db.collection(C.orders).doc(order.body.order.id)))).not.toBeNull();
    await settle();
  });
});

describe("uploads on the free plan (stored in Firestore)", () => {
  it("stores photos in Firestore, serves them from /media and rejects videos", async () => {
    const { c } = await newCustomer("Free Uploader");
    const r = await c.upload("/api/v1/uploads/avatar", await png(), "me.png");
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.file.url).toMatch(/^http:\/\/localhost:\d+\/media\/[A-Za-z0-9]+\.webp$/);
    const path = new URL(r.body.file.url).pathname;
    const img = await request(app).get(path);
    expect(img.status).toBe(200);
    expect(img.headers["content-type"]).toBe("image/webp");
    expect(img.headers["cache-control"]).toMatch(/immutable/);
    expect((await request(app).get("/media/doesnotexist123.webp")).status).toBe(404);
    expect((await c.patch("/api/v1/account/avatar", { url: r.body.file.url })).body.user.avatarUrl).toBe(r.body.file.url);
    const admin = await loginAs("admin@naamdevsweets.local");
    const video = await admin.upload("/api/v1/admin/uploads/video", Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(64)]), "clip.mp4");
    expect(video.status).toBe(400);
    expect(video.body.error.code).toBe("VIDEO_UNAVAILABLE");
  });

  it("keeps KYC documents private in Firestore, readable only by partners.manage", async () => {
    const rider = new Client("delivery");
    rider.token = (await firebaseSignUp(uniqueEmail("kycfree"), CUSTOMER_PASSWORD)).idToken;
    expect((await rider.post("/api/v1/delivery/register", { name: "KYC Free", phone: uniquePhone(), city: "Jaipur", vehicleType: "SCOOTER" })).status).toBe(201);
    expect((await rider.upload("/api/v1/delivery/documents", await png(), "pan.png", { type: "PAN" })).status).toBe(201);
    const partnerId = (await rider.get("/api/v1/delivery/me")).body.partner.id as string;
    const stored = (await db.collection(C.partners).doc(partnerId).collection("documents").doc("PAN").get()).data()!;
    expect(stored.storageKey).toMatch(/^fs:/);
    const admin = await loginAs("admin@naamdevsweets.local");
    const doc = await admin.get(`/api/v1/admin/people/partners/${partnerId}/documents/PAN/file`);
    expect(doc.status).toBe(200);
    expect(doc.headers["content-type"]).toBe("image/jpeg");
    // Private files have no public address.
    expect((await request(app).get(`/media/${stored.storageKey.slice(3)}.jpg`)).status).toBe(404);
  });
});

describe("Cloud Storage uploads (paid plan, STORAGE_DRIVER=firebase)", () => {
  beforeAll(() => {
    process.env.STORAGE_DRIVER = "firebase";
  });
  afterAll(() => {
    delete process.env.STORAGE_DRIVER;
  });

  it("stores public images with a download URL and rejects non-images", async () => {
    const { c } = await newCustomer("Uploader");
    const r = await c.upload("/api/v1/uploads/avatar", await png(), "me.png");
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.file.url).toMatch(/\/v0\/b\/.+\/o\/.+alt=media&token=/);
    const fetched = await fetch(r.body.file.url);
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get("content-type")).toMatch(/image\//);
    const bad = await c.upload("/api/v1/uploads/avatar", Buffer.from("#!/bin/sh\necho hi\n"), "evil.png");
    expect(bad.status).toBe(400);
    // Avatar URLs must point at our own storage.
    expect((await c.patch("/api/v1/account/avatar", { url: "https://evil.example.com/x.png" })).status).toBe(400);
    expect((await c.patch("/api/v1/account/avatar", { url: r.body.file.url })).body.user.avatarUrl).toBe(r.body.file.url);
  });

  it("keeps partner KYC documents private and only staff can read them", async () => {
    const rider = new Client("delivery");
    rider.token = (await firebaseSignUp(uniqueEmail("kyc"), CUSTOMER_PASSWORD)).idToken;
    expect((await rider.post("/api/v1/delivery/register", { name: "KYC Rider", phone: uniquePhone(), city: "Jaipur", vehicleType: "MOTORCYCLE" })).status).toBe(201);
    const up = await rider.upload("/api/v1/delivery/documents", await png(), "aadhaar.png", { type: "AADHAAR" });
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    const me = await rider.get("/api/v1/delivery/me");
    const partnerId = me.body.partner.id as string;
    const [file] = await bucket().getFiles({ prefix: `private/partners/${partnerId}` });
    expect(file).toHaveLength(1);
    // No public download token on private files.
    const [meta] = await file[0]!.getMetadata();
    expect(meta.metadata?.firebaseStorageDownloadTokens).toBeUndefined();

    const admin = await loginAs("admin@naamdevsweets.local");
    const doc = await admin.get(`/api/v1/admin/people/partners/${partnerId}/documents/AADHAAR/file`);
    expect(doc.status).toBe(200);
    expect(doc.headers["content-type"]).toMatch(/^image\//); // re-encoded server-side
    const packing = await loginAs("packing@naamdevsweets.local");
    expect((await packing.get(`/api/v1/admin/people/partners/${partnerId}/documents/AADHAAR/file`)).status).toBe(403);
    expect((await admin.post(`/api/v1/admin/people/partners/${partnerId}/documents/AADHAAR/review`, { status: "VERIFIED" })).status).toBe(200);
    expect((await admin.post(`/api/v1/admin/people/partners/${partnerId}/status`, { status: "APPROVED" })).body.partner.status).toBe("APPROVED");
    await settle();
  });
});

describe("live updates & scheduler", () => {
  it("writes live order signals the customer's browser listens to", async () => {
    const { c, user } = await newCustomer("Live");
    const addressId = await addAddress(c);
    const v = await variantBySlug("gulab-jamun", 1);
    await c.post("/api/v1/cart/items", { variantId: v.id, quantity: 1 });
    const placed = await placeCodOrder(c, addressId);
    await settle();
    await wait(300);
    const liveDoc = await getDoc<{ userId: string; status: string; version: number }>(db.collection(C.liveOrders).doc(placed.body.order.id));
    expect(liveDoc?.userId).toBe(user.id);
    expect(liveDoc?.status).toBe("CONFIRMED");
    const staff = await getDoc<{ event: string }>(db.collection(C.liveStaff).doc("orders"));
    expect(staff?.event).toBeTruthy();
  });

  it("protects the scheduler endpoint and runs due jobs once", async () => {
    expect((await request(app).post("/internal/jobs/tick?sweepSeconds=0")).status).toBe(404);
    expect((await request(app).post("/internal/jobs/tick?sweepSeconds=0").set("x-jobs-secret", "wrong")).status).toBe(404);
    const first = await request(app).post("/internal/jobs/tick?sweepSeconds=0").set("x-jobs-secret", JOBS_SECRET);
    expect(first.status).toBe(200);
    const names = first.body.results.map((r: { job: string }) => r.job);
    expect(names).toEqual(["expire-unpaid-orders", "expire-delivery-offers", "expire-batches", "inventory-alerts", "cleanup"]);
    // An immediate second tick finds nothing due.
    const second = await request(app).post("/internal/jobs/tick?sweepSeconds=0").set("x-jobs-secret", JOBS_SECRET);
    expect(second.body.results.every((r: { skipped?: boolean }) => r.skipped)).toBe(true);
  });

  it("expires unpaid online orders and releases their stock", async () => {
    const { c } = await newCustomer("Abandoner");
    const addressId = await addAddress(c);
    const v = await variantBySlug("royal-mixed-dry-fruits", 1);
    await c.post("/api/v1/cart/items", { variantId: v.id, quantity: 1 });
    const { randomUUID } = await import("node:crypto");
    const r = await c.post("/api/v1/checkout/place-order", { addressId, paymentMethod: "ONLINE", idempotencyKey: randomUUID() });
    expect(r.status).toBe(201);
    const before = (await db.collection(C.inventory).doc(v.id).get()).data()!;
    await db.collection(C.orders).doc(r.body.order.id).update({ reservationExpiresAt: new Date(Date.now() - 1000) });
    const { expireUnpaidOrders } = await import("../src/modules/orders/service");
    await expireUnpaidOrders();
    const o = (await db.collection(C.orders).doc(r.body.order.id).get()).data()!;
    expect(o.status).toBe("CANCELLED");
    const after = (await db.collection(C.inventory).doc(v.id).get()).data()!;
    expect(after.available).toBe(before.available + 1);
    expect(after.reserved).toBe(before.reserved - 1);
    await settle();
  });
});

describe("delivery zones & payouts", () => {
  it("manages zones keyed by pincode", async () => {
    const admin = await loginAs("admin@naamdevsweets.local");
    const z = await admin.post("/api/v1/admin/zones", { pincode: "302099", area: "Test Nagar", city: "Jaipur", etaMinutes: 50 });
    expect(z.status, JSON.stringify(z.body)).toBe(201);
    expect((await admin.post("/api/v1/admin/zones", { pincode: "302099", area: "Again", city: "Jaipur" })).status).toBe(409);
    const moved = await admin.put("/api/v1/admin/zones/302099", { pincode: "302098", area: "Test Nagar", city: "Jaipur", etaMinutes: 40, isActive: true });
    expect(moved.body.zone.id).toBe("302098");
    expect(await getDoc<DeliveryZone>(db.collection(C.zones).doc("302099"))).toBeNull();
    const est = await new Client().get("/api/v1/catalog/delivery-estimate?pincode=302098");
    expect(est.body.serviceable).toBe(true);
    expect((await admin.del("/api/v1/admin/zones/302098")).status).toBe(200);
  });

  it("settles a partner's unsettled earnings", async () => {
    const admin = await loginAs("admin@naamdevsweets.local");
    const rider = await loginAs("rider@naamdevsweets.local", "delivery");
    const partnerId = (await rider.get("/api/v1/delivery/me")).body.partner.id as string;
    await db.collection(C.earnings).add({ partnerId, assignmentId: null, orderId: null, type: "INCENTIVE", amountPaise: 2500, description: "Test bonus", isSettled: false, settledAt: null, createdAt: new Date() } satisfies PartnerEarning);
    const detail = await admin.get(`/api/v1/admin/people/partners/${partnerId}`);
    expect(detail.body.unsettledPaise).toBeGreaterThanOrEqual(2500);
    const s = await admin.post(`/api/v1/admin/people/partners/${partnerId}/settle`, { reference: "UTR123456" });
    expect(s.body.settled).toBeGreaterThan(0);
    const open = await getDocs<PartnerEarning>(db.collection(C.earnings).where("partnerId", "==", partnerId).where("isSettled", "==", false));
    expect(open).toHaveLength(0);
  });
});
