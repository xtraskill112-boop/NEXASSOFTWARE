import { expect, test, type Page } from "@playwright/test";

/**
 * Read-only check of the deployed shop: pages load their data from the API in a real browser
 * (CORS, Content-Security-Policy, API address), the demo logins can sign in to each app, and the
 * payment sheet opens with UPI and cash on delivery. It creates no orders, accounts or other data
 * (the item it puts in the demo customer's cart to reach checkout is removed again). Run by .github/workflows/naamdev-live-check.yml.
 */
const WEB = process.env.LIVE_WEB_URL ?? "https://naamdevsweets.web.app";
const ADMIN = process.env.LIVE_ADMIN_URL ?? "https://naamdevsweets-admin.web.app";
const RIDER = process.env.LIVE_PARTNER_URL ?? "https://naamdevsweets-partner.web.app";
const API = process.env.LIVE_API_URL ?? "https://naamdev-api.onrender.com";
const PASSWORD = process.env.LIVE_DEMO_PASSWORD ?? "";

/** Fails the test on CSP violations, uncaught page errors and API requests that never got an answer. */
function watch(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy|CORS|blocked/i.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("requestfailed", (r) => {
    if (r.url().startsWith(API) && r.failure()?.errorText !== "net::ERR_ABORTED") problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`);
  });
  page.on("response", (r) => {
    if (r.url().startsWith(API) && r.status() >= 500) problems.push(`API ${r.status()}: ${r.url()}`);
  });
  return problems;
}

/** First lines of what the page shows, for failure messages. */
async function bodyText(page: Page) {
  return (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 400);
}

async function noSplash(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("nd_splash", "1"));
}

test("API is up and Firestore answers", async ({ request }) => {
  const res = await request.get(`${API}/health`, { timeout: 120_000 });
  expect(res.status()).toBe(200);
  const settings = await request.get(`${API}/api/v1/public/settings`);
  expect(settings.status()).toBe(200);
  // What the storefront home page will show: each section and how many products it has.
  const home = await request.get(`${API}/api/v1/catalog/home`);
  const text = await home.text();
  console.log(`catalog/home → ${home.status()}`);
  expect(home.status(), text.slice(0, 500)).toBe(200);
  const feed = JSON.parse(text) as { sections: { type: string; title: string; products?: unknown[] }[] };
  console.log(feed.sections.map((s) => `${s.type}=${s.products?.length ?? "-"}`).join(" "));
  expect(feed.sections.find((s) => s.type === "BESTSELLERS")?.products?.length ?? 0).toBeGreaterThan(0);
});

test("storefront shows the catalogue from the API", async ({ page }) => {
  const problems = watch(page);
  await noSplash(page);
  await page.goto(WEB);
  try {
    await expect(page.getByRole("heading", { name: "Bestselling sweets" })).toBeVisible();
  } catch (e) {
    throw new Error(`${(e as Error).message}\n\nThe page shows: ${await bodyText(page)}\nProblems: ${problems.join(" | ") || "none"}`);
  }
  await expect(page.getByRole("link", { name: "Kaju Katli" }).first()).toBeVisible();

  await page.goto(`${WEB}/product/kaju-katli`);
  await expect(page.getByRole("heading", { level: 1, name: "Kaju Katli" })).toBeVisible();
  await expect(page.getByText(/₹\s?[\d,]+/).first()).toBeVisible();

  await page.goto(`${WEB}/search?q=kaju%20katri`);
  await expect(page.getByText(/^\d+ items?$/)).toBeVisible();
  expect(problems).toEqual([]);
});

test.describe("demo logins", () => {
  test.skip(!PASSWORD, "NAAMDEV_ADMIN_PASSWORD secret not available");

  test("customer signs in to the storefront", async ({ page }) => {
    const problems = watch(page);
    await noSplash(page);
    await page.goto(`${WEB}/login`);
    await page.getByLabel("Email address").fill("customer@naamdevsweets.local");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto(`${WEB}/account/orders`);
    await expect(page.getByRole("heading", { name: "My orders" })).toBeVisible();

    // Payment sheet: opens with UPI and cash on delivery. Nothing is paid or ordered here.
    await page.goto(`${WEB}/cart`);
    // The cart has loaded once it shows either its heading or the empty state (live listeners keep
    // a connection open, so "network idle" never happens).
    await expect(page.getByText(/^(Your cart|Your cart is empty)$/).first()).toBeVisible();
    const hadKaju = await page.getByRole("button", { name: "Remove Kaju Katli" }).count();
    await page.goto(`${WEB}/product/kaju-katli`);
    await page.getByRole("button", { name: "Buy now" }).first().click();
    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
    await expect(page.getByText(/Estimated delivery/)).toBeVisible();
    await page.getByRole("button", { name: /Proceed to pay/ }).last().click();
    const sheet = page.getByRole("dialog", { name: "Payment" });
    await expect(sheet.getByText("NAAMDEV SWEETS", { exact: true })).toBeVisible();
    await expect(sheet.getByRole("button", { name: /^Pay ₹[\d,.]+ with UPI$/ })).toBeVisible();
    await expect(sheet.getByRole("button", { name: /Cash on Delivery/ })).toBeVisible();
    await sheet.getByRole("button", { name: "Close" }).first().click();
    await expect(sheet).toHaveCount(0);
    // Leave the demo cart as it was.
    if (!hadKaju) {
      await page.goto(`${WEB}/cart`);
      const remove = page.getByRole("button", { name: "Remove Kaju Katli" });
      await expect(remove.first()).toBeVisible();
      while (await remove.count()) {
        await remove.first().click();
        await page.waitForTimeout(1500);
      }
    }
    expect(problems).toEqual([]);
  });

  test("store owner signs in to the console", async ({ page }) => {
    const problems = watch(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${ADMIN}/login`);
    await page.getByLabel("Work email").fill("owner@naamdevsweets.local");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Store overview" })).toBeVisible();
    expect(problems).toEqual([]);
  });

  test("rider signs in to the partner app", async ({ page }) => {
    const problems = watch(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${RIDER}/login`);
    await page.getByLabel("Email").fill("rider@naamdevsweets.local");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText(/^You're (offline|online)$/)).toBeVisible();
    expect(problems).toEqual([]);
  });
});
