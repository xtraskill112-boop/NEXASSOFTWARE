import { expect, test, type Page } from "@playwright/test";

const WEB = process.env.E2E_WEB_URL ?? "http://localhost:3000";
const ADMIN = process.env.E2E_ADMIN_URL ?? "http://localhost:3001";
const RIDER = process.env.E2E_DELIVERY_URL ?? "http://localhost:3002";
const PASSWORD = "Naamdev@123";
const STORE = { latitude: 26.913, longitude: 75.79 };

const phone = `9${String(Date.now()).slice(-9)}`;
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
    await p.getByLabel("Mobile number or email").fill("rider@naamdevsweets.local");
    await p.getByLabel("Password").fill(PASSWORD);
    await p.getByRole("button", { name: "Log in" }).click();
    await expect(p.getByText("You're offline", { exact: true })).toBeVisible();
    await p.getByRole("switch", { name: "Online" }).click();
    await expect(p.getByText("You're online", { exact: true })).toBeVisible();
    await expect(p.getByText("Live location is being shared")).toBeVisible();
    await ctx.storageState({ path: "/tmp/nd-rider.json" });
    await ctx.close();
  });

  test("customer discovers, signs up with OTP and places a COD order", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await noSplash(p);
    await p.goto(WEB);
    await expect(p.getByRole("heading", { name: "Bestselling sweets" })).toBeVisible();

    // Typo-tolerant search
    await p.goto(`${WEB}/search?q=kaju%20katri`);
    await expect(p.getByRole("heading", { name: /Results for/ })).toBeVisible();
    await p.getByRole("link", { name: "Kaju Katli" }).first().click();
    await expect(p.getByRole("heading", { level: 1, name: "Kaju Katli" })).toBeVisible();

    // Weight selection updates price
    const price = p.locator("text=/^₹[\\d,]+$/").first();
    await p.getByRole("radio", { name: /1 kg/ }).click();
    await expect(price).toContainText("₹1,105");
    await p.getByRole("button", { name: "Buy now" }).first().click();

    // Redirected to login for checkout → OTP sign-up (dev echo shows the code)
    await expect(p).toHaveURL(/\/login/);
    await p.getByLabel("Mobile number").fill(phone);
    await p.getByRole("button", { name: "Send OTP" }).click();
    const devText = await p.getByText(/your OTP is/).innerText();
    const otp = devText.match(/(\d{6})/)![1]!;
    for (const [i, d] of [...otp].entries()) await p.getByLabel(`Digit ${i + 1}`).fill(d);
    await expect(p.getByRole("heading", { name: /Almost there/ })).toBeVisible();
    await p.getByLabel("Full name").fill("E2E Test Customer");
    await p.getByRole("button", { name: "Create account" }).click();

    // Checkout: add address, choose COD, place order
    await expect(p.getByRole("heading", { name: "Checkout" })).toBeVisible();
    await p.getByLabel("Flat / House no. / Building").fill("Flat 7, Test Residency");
    await p.getByLabel("Area / Street / Sector").fill("C-Scheme");
    await p.getByLabel("PIN code").fill("302001");
    await p.getByRole("button", { name: "Save address" }).click();
    await expect(p.getByText(/Estimated delivery/)).toBeVisible();
    await p.getByRole("radio", { name: /Cash on delivery/ }).click();
    await p.getByRole("button", { name: /Place order/ }).last().click();

    await expect(p.getByRole("heading", { name: "Order placed!" })).toBeVisible();
    orderNumber = (await p.locator("p.font-mono").first().innerText()).trim();
    expect(orderNumber).toMatch(/^ND\d{6}-\d{4}$/);
    await p.getByRole("link", { name: "Track order" }).click();
    await expect(p).toHaveURL(/\/account\/orders\//);
    orderId = p.url().split("/").pop()!;
    await ctx.storageState({ path: "/tmp/nd-customer.json" });
    await ctx.close();
  });

  test("staff prepare and pack the order in the console (auto-offers to the rider)", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`${ADMIN}/login`);
    await p.getByLabel("Email or mobile").fill("orders@naamdevsweets.local");
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

  test("role permissions shape the console", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`${ADMIN}/login`);
    await p.getByLabel("Email or mobile").fill("support@naamdevsweets.local");
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
      await p.getByLabel("Email or mobile").fill("packing@naamdevsweets.local");
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
    await expect(dialog.getByText("Incorrect password")).toBeVisible();
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
