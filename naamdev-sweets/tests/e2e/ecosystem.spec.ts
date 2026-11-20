import { expect, test, type Page } from "@playwright/test";

const WEB = process.env.E2E_WEB_URL ?? "http://localhost:3000";
const ADMIN = process.env.E2E_ADMIN_URL ?? "http://localhost:3001";
const RIDER = process.env.E2E_DELIVERY_URL ?? "http://localhost:3002";
const PASSWORD = "Naamdev@123";
const STORE = { latitude: 26.913, longitude: 75.79 };

const customerEmail = `e2e-${Date.now()}@test.naamdev.local`;
const CUSTOMER_PASSWORD = "Sweets@2026";
let orderId = "";
let orderNumber = "";

async function noSplash(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("nd_splash", "1"));
}

test.describe.serial("NAAMDEV ecosystem: order → kitchen → rider → doorstep", () => {
  test("rider goes online and shares live location", async ({ browser }) => {
    const ctx = await browser.newContext({ geolocation: STORE, permissions: ["geolocation"], viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(`${RIDER}/login`);
    await p.getByLabel("Email").fill("rider@naamdevsweets.local");
    await p.getByLabel("Password").fill(PASSWORD);
    await p.getByRole("button", { name: "Log in" }).click();
    await expect(p.getByText("You're offline", { exact: true })).toBeVisible();
    await p.getByRole("switch", { name: "Online" }).click();
    await expect(p.getByText("You're online", { exact: true })).toBeVisible();
    await expect(p.getByText("Live location is being shared")).toBeVisible();
    // Firebase keeps the sign-in in IndexedDB.
    await ctx.storageState({ path: "/tmp/nd-rider.json", indexedDB: true });
    await ctx.close();
  });

  test("customer discovers, signs up with email and places a COD order", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await noSplash(p);
    await p.goto(WEB);
    await expect(p.getByRole("heading", { name: "Bestselling sweets" })).toBeVisible();

    // Typo-tolerant search
    await p.goto(`${WEB}/search?q=kaju%20katri`);
    await expect(p.getByRole("heading", { name: /Results for/ })).toBeVisible();
    // Wait for the client-side results before tapping a product.
    await expect(p.getByText(/^\d+ items?$/)).toBeVisible();
    await p.getByRole("link", { name: "Kaju Katli" }).first().click();
    await expect(p).toHaveURL(/\/product\/kaju-katli/);
    await expect(p.getByRole("heading", { level: 1, name: "Kaju Katli" })).toBeVisible();

    // Weight selection updates price
    const price = p.locator("text=/^₹[\\d,]+$/").first();
    await p.getByRole("radio", { name: /1 kg/ }).click();
    await expect(price).toContainText("₹1,105");
    await p.getByRole("button", { name: "Buy now" }).first().click();

    // Redirected to login for checkout → email + password sign-up (Firebase Auth)
    await expect(p).toHaveURL(/\/login/);
    await p.getByRole("button", { name: "Create account" }).click();
    await expect(p.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await p.getByLabel("Full name").fill("E2E Test Customer");
    await p.getByLabel("Email address").fill(customerEmail);
    await p.getByLabel("Password").fill(CUSTOMER_PASSWORD);
    await p.getByRole("button", { name: "Create account" }).click();

    // Checkout: add address, then pay in the payment sheet with cash on delivery
    await expect(p.getByRole("heading", { name: "Checkout" })).toBeVisible();
    // Email sign-up skipped the optional mobile number, so the address form asks for it.
    await p.getByLabel(/^Mobile number/).fill("9876543210");
    await p.getByLabel("Flat / House no. / Building").fill("Flat 7, Test Residency");
    await p.getByLabel("Area / Street / Sector").fill("C-Scheme");
    await p.getByLabel("PIN code").fill("302001");
    await p.getByRole("button", { name: "Save address" }).click();
    await expect(p.getByText(/Estimated delivery/)).toBeVisible();
    await p.getByRole("button", { name: /Proceed to pay/ }).last().click();
    const sheet = p.getByRole("dialog", { name: "Payment" });
    await expect(sheet.getByText("Payment options")).toBeVisible();
    await sheet.getByRole("button", { name: /Cash on Delivery/ }).click();
    await sheet.getByRole("button", { name: /Place order/ }).click();

    await expect(p.getByRole("heading", { name: "Order placed!" })).toBeVisible();
    orderNumber = (await p.locator("p.font-mono").first().innerText()).trim();
    expect(orderNumber).toMatch(/^ND\d{6}-\d{4}$/);
    await p.getByRole("link", { name: "Track order" }).click();
    await expect(p).toHaveURL(/\/account\/orders\//);
    orderId = p.url().split("/").pop()!;
    await ctx.storageState({ path: "/tmp/nd-customer.json", indexedDB: true });
    await ctx.close();
  });

  test("staff prepare and pack the order in the console (auto-offers to the rider)", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`${ADMIN}/login`);
    await p.getByLabel("Work email").fill("orders@naamdevsweets.local");
    await p.getByLabel("Password").fill(PASSWORD);
    await p.getByRole("button", { name: "Sign in" }).click();
    await expect(p.getByRole("heading", { name: "Store overview" })).toBeVisible();
    await p.goto(`${ADMIN}/orders/${orderId}`);
    await expect(p.getByRole("heading", { name: orderNumber })).toBeVisible();
    await p.getByRole("button", { name: "Preparing", exact: true }).click();
    await expect(p.getByRole("button", { name: "Packed", exact: true })).toBeVisible();
    await p.getByRole("button", { name: "Packed", exact: true }).click();
    await expect(p.getByText("offered").first()).toBeVisible();
    await ctx.close();
  });

  test("rider accepts, picks up and completes delivery with the customer's OTP", async ({ browser }) => {
    // Customer reads the delivery OTP once dispatched; fetch it after pickup.
    const rctx = await browser.newContext({ storageState: "/tmp/nd-rider.json", geolocation: STORE, permissions: ["geolocation"], viewport: { width: 390, height: 844 } });
    const r = await rctx.newPage();
    await r.goto(RIDER);
    await expect(r.getByText("New delivery request")).toBeVisible();
    await r.getByRole("button", { name: "Accept" }).click();
    await r.getByRole("link", { name: new RegExp(orderNumber) }).click();
    await r.getByRole("button", { name: "Confirm pickup" }).click();
    await expect(r.getByRole("button", { name: "Start delivery" })).toBeVisible();
    await r.getByRole("button", { name: "Start delivery" }).click();

    const cctx = await browser.newContext({ storageState: "/tmp/nd-customer.json", viewport: { width: 390, height: 844 } });
    const c = await cctx.newPage();
    await noSplash(c);
    await c.goto(`${WEB}/account/orders/${orderId}`);
    await expect(c.getByText("Delivery OTP")).toBeVisible();
    const otp = (await c.locator("p.font-mono.tracking-\\[0\\.3em\\]").innerText()).trim();
    expect(otp).toMatch(/^\d{4}$/);
    await expect(c.getByText("Demo Rider")).toBeVisible();

    await r.getByLabel("Delivery OTP").fill(otp);
    await r.getByText(/I have collected/).click();
    await r.getByRole("button", { name: "Complete delivery" }).click();
    await expect(r.getByText(/Delivered at/)).toBeVisible();

    await c.reload();
    await expect(c.getByText("Delivered").first()).toBeVisible();
    await expect(c.getByText(/You earned \d+ Mithaas points/)).toBeVisible();
    await rctx.close();
    await cctx.close();
  });

  test("customer pays by UPI; the order waits until staff confirm the payment", async ({ browser }) => {
    const cctx = await browser.newContext({ storageState: "/tmp/nd-customer.json", viewport: { width: 1280, height: 900 } });
    const c = await cctx.newPage();
    await noSplash(c);
    await c.goto(`${WEB}/product/gulab-jamun`);
    await c.getByRole("button", { name: "Buy now" }).first().click();
    await expect(c.getByRole("heading", { name: "Checkout" })).toBeVisible();
    await expect(c.getByText(/Estimated delivery/)).toBeVisible();
    await c.getByRole("button", { name: /Proceed to pay/ }).last().click();

    // Payment sheet: UPI is the recommended option; paying places the order and shows the compact
    // UPI step — QR code (desktop) and the shop's UPI details. Nothing is confirmed yet.
    const sheet = c.getByRole("dialog", { name: "Payment" });
    await sheet.getByRole("button", { name: /^Pay ₹[\d,.]+ with UPI$/ }).click();
    await expect(sheet.getByLabel("UPI QR code").locator("svg")).toBeVisible();
    await expect(sheet.getByText("RAKESH TAILOR")).toBeVisible();
    await expect(sheet.getByText("paytmqr6rgzn2@ptys")).toBeVisible();
    const upiOrderNumber = ((await sheet.getByText(/^Order ND/).textContent()) ?? "").replace(/^Order /, "").trim();
    expect(upiOrderNumber).toMatch(/^ND\d{6}-\d{4}$/);
    await sheet.getByLabel("UPI reference number (UTR)").fill("412345678901");
    await sheet.getByRole("button", { name: /I've paid/ }).click();
    await expect(sheet.getByText("Checking your payment")).toBeVisible();
    await sheet.getByRole("button", { name: "View order status" }).click();
    await expect(c).toHaveURL(/\/account\/orders\//);
    const upiOrderId = c.url().split("/").pop()!;
    await expect(c.getByText("Checking your UPI payment")).toBeVisible();

    // Staff with "payments.verify" check the shop's UPI account and confirm.
    const actx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const a = await actx.newPage();
    await a.goto(`${ADMIN}/login`);
    await a.getByLabel("Work email").fill("orders@naamdevsweets.local");
    await a.getByLabel("Password").fill(PASSWORD);
    await a.getByRole("button", { name: "Sign in" }).click();
    await expect(a.getByText(/UPI payments? to check/)).toBeVisible();
    await a.goto(`${ADMIN}/orders/${upiOrderId}`);
    await expect(a.getByRole("heading", { name: upiOrderNumber })).toBeVisible();
    await expect(a.getByText("412345678901").first()).toBeVisible();
    a.once("dialog", (d) => void d.accept());
    await a.getByRole("button", { name: "Payment received" }).click();
    await expect(a.getByText("Payment confirmed — order accepted")).toBeVisible();

    // The customer's page updates live (Firestore) to the confirmed order.
    await expect(c.getByText("Checking your UPI payment")).toHaveCount(0);
    await expect(c.getByText("Paid").first()).toBeVisible();
    await actx.close();
    await cctx.close();
  });

  test("role permissions shape the console", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`${ADMIN}/login`);
    await p.getByLabel("Work email").fill("support@naamdevsweets.local");
    await p.getByLabel("Password").fill(PASSWORD);
    await p.getByRole("button", { name: "Sign in" }).click();
    await expect(p.getByRole("link", { name: "Support tickets" })).toBeVisible();
    await expect(p.getByRole("link", { name: "Products" })).toHaveCount(0);
    await expect(p.getByRole("link", { name: "Settings" })).toHaveCount(0);
    await p.goto(`${ADMIN}/settings`);
    await expect(p.getByText("Access restricted")).toBeVisible();
    await ctx.close();
  });

  test("staff change their own password; the old one stops working", async ({ browser }) => {
    const NEW_PASSWORD = "Packing@2026x";
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    const signIn = async (password: string) => {
      await p.goto(`${ADMIN}/login`);
      await p.getByLabel("Work email").fill("packing@naamdevsweets.local");
      await p.getByLabel("Password").fill(password);
      await p.getByRole("button", { name: "Sign in" }).click();
    };
    await signIn(PASSWORD);
    await p.getByRole("button", { name: "Change password" }).click();
    const dialog = p.getByRole("dialog", { name: "Change password" });
    await dialog.getByLabel("Current password").fill("wrong-password1");
    await dialog.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
    await dialog.getByLabel("Confirm new password").fill(NEW_PASSWORD);
    await dialog.getByRole("button", { name: "Update password" }).click();
    await expect(dialog.getByText(/incorrect/i)).toBeVisible();
    await dialog.getByLabel("Current password").fill(PASSWORD);
    await dialog.getByRole("button", { name: "Update password" }).click();
    await expect(p.getByText("Password changed")).toBeVisible();
    await p.getByRole("button", { name: "Log out" }).click();
    await expect(p).toHaveURL(/\/login/);
    await signIn(PASSWORD);
    await expect(p.getByText(/incorrect|invalid/i).first()).toBeVisible();
    await signIn(NEW_PASSWORD);
    await expect(p.getByRole("link", { name: "Kitchen board" })).toBeVisible();
    await ctx.close();
  });
});
