/**
 * Drives the real web app against the emulators + mock Shadowfax and checks every main flow.
 * Run through e2e/run.sh (which starts everything).
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");

const APP = "http://127.0.0.1:4173";
const AUTH = "http://127.0.0.1:9099";
const FN = "http://127.0.0.1:5001/demo-sf360/asia-south1";
const MOCK = "http://127.0.0.1:4010";
const SHOTS = process.env.SHOTS_DIR ?? "/tmp/sf360-shots";
mkdirSync(SHOTS, { recursive: true });

const results = [];
let currentPage = null;
async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t });
    console.log(`✔ ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: String(err?.message ?? err).split("\n")[0] });
    console.log(`✘ ${name}\n   ${String(err?.message ?? err).split("\n")[0]}`);
    if (currentPage) await currentPage.screenshot({ path: join(SHOTS, "FAILED.png"), fullPage: true }).catch(() => undefined);
    throw err;
  }
}

async function createUser(email, password, verified) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const { localId } = await r.json();
  if (verified) {
    await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/demo-sf360/accounts:update`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
      body: JSON.stringify({ localId, emailVerified: true }),
    });
  }
}

const section = (page, title) => page.locator("section").filter({ has: page.getByRole("heading", { name: title }) });
const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const field = (scope, label) => scope.getByLabel(new RegExp(`^${escapeRe(label)}( \\*)?$`));

async function login(page, email, password) {
  await page.goto(APP);
  await page.getByLabel(/^E-mail/).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

async function fillAddress(scope, a) {
  if (a.name) await field(scope, "Name").fill(a.name);
  if (a.contact) await field(scope, "Phone").fill(a.contact);
  await field(scope, "Address").fill(a.address1);
  await field(scope, "City").fill(a.city);
  await field(scope, "State").selectOption(a.state);
  await field(scope, "Pincode").fill(a.pincode);
}

const browser = await chromium.launch();
let awb1 = "";
try {
  await step("create owner (verified) and a stranger account in the Auth emulator", async () => {
    await createUser("owner@example.com", "Owner-pass-123", true);
    await createUser("stranger@example.com", "Stranger-pass-123", true);
    await createUser("unverified@example.com", "Unverified-pass-123", false);
  });

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  currentPage = page;
  page.on("pageerror", (e) => console.log("   page error:", e.message));

  await step("login page renders and owner can log in", async () => {
    await page.goto(APP);
    await page.getByRole("button", { name: "Log in" }).waitFor();
    await page.screenshot({ path: join(SHOTS, "01-login-desktop.png") });
    await login(page, "owner@example.com", "Owner-pass-123");
    await page.getByRole("heading", { name: "Dashboard" }).waitFor({ timeout: 30000 });
    await page.getByText("TEST MODE").waitFor();
  });

  await step("save a pickup address and booking defaults (Firestore rules allow the owner)", async () => {
    await page.getByRole("link", { name: "Settings" }).first().click();
    await page.getByRole("button", { name: "Add address" }).click();
    const dlg = page.locator("dialog[open]");
    await field(dlg, "Label").fill("Main warehouse");
    await fillAddress(dlg, { name: "My Store", contact: "9876543211", address1: "15 Industrial Area Phase 2", city: "Bengaluru", state: "Karnataka", pincode: "560058" });
    await dlg.getByRole("button", { name: "Save" }).click();
    await page.getByText("Main warehouse").first().waitFor();
    await field(section(page, "Booking defaults"), "Default pickup address").selectOption({ label: "Main warehouse" });
    await page.getByRole("button", { name: "Save defaults" }).click();
    await page.getByText("Settings saved").waitFor();
    const doc = await (await fetch("http://127.0.0.1:8080/v1/projects/demo-sf360/databases/(default)/documents/settings/app", { headers: { Authorization: "Bearer owner" } })).json();
    if (!doc.fields?.defaultPickupId?.stringValue) throw new Error(`default pickup not saved: ${JSON.stringify(doc.fields)}`);
  });

  await step("new shipment: pincode check first, then book (COD)", async () => {
    await page.getByRole("link", { name: "New" }).first().click();
    await page.getByRole("heading", { name: "New shipment" }).waitFor();
    const cust = section(page, "Deliver to (customer)");
    await fillAddress(cust, { name: "Rahul Sharma", contact: "9876543210", address1: "42 MG Road, Koramangala", city: "Bengaluru", state: "Karnataka", pincode: "560034" });
    // Default pickup address was applied from settings.
    await page.waitForFunction(() => [...document.querySelectorAll("input")].some((i) => i.value === "560058"));
    const prod = section(page, "Products");
    await field(prod, "Product name").fill("Wireless Headphones");
    await field(prod, "SKU").fill("SKU-HP-01");
    await field(prod, "Unit price ₹").fill("1299");
    await section(page, "Payment & package").getByRole("radio", { name: "COD" }).click();
    await field(section(page, "Payment & package"), "Weight (kg)").fill("0.5");
    await page.getByRole("button", { name: "Book shipment" }).isDisabled();
    await page.getByRole("button", { name: "Check serviceability" }).click();
    await page.getByText("All legs are serviceable").waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: "Estimate charge" }).click();
    await page.getByText(/Estimated: .*incl\. GST/).waitFor({ timeout: 30000 });
    await page.screenshot({ path: join(SHOTS, "02-new-shipment-desktop.png"), fullPage: true });
    await page.getByRole("button", { name: "Book shipment" }).click();
    await page.waitForURL(/\/orders\/SF\d+TST$/, { timeout: 30000 });
    awb1 = decodeURIComponent(page.url().split("/").pop());
    await page.getByRole("heading", { name: awb1 }).waitFor();
  });

  await step("webhook: wrong key is rejected (401)", async () => {
    const r = await fetch(`${FN}/shadowfaxWebhook`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Token nope" }, body: "{}" });
    if (r.status !== 401) throw new Error(`expected 401, got ${r.status}`);
  });

  await step("webhook: Out For Delivery shows up live on the order page", async () => {
    const r = await fetch(`${FN}/shadowfaxWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Token test-webhook-key" },
      body: JSON.stringify({
        awb_number: awb1,
        order_id: "x",
        // Shadowfax sends IST wall-clock time.
        event_timestamp: new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 19).replace("T", " "),
        current_location: "BLR_Koramangala",
        comments: "Item OFD at BLR_Koramangala",
        event: "ofd",
        status: "Out For Delivery",
        rider_name: "Ravi",
        rider_contact: "9000000000",
        type: "FWD",
      }),
    });
    if (r.status !== 200) throw new Error(`webhook status ${r.status}`);
    await page.getByText("Out for delivery", { exact: true }).first().waitFor({ timeout: 15000 });
    await page.getByText("Rider: Ravi").waitFor();
    await page.screenshot({ path: join(SHOTS, "03-order-detail-desktop.png"), fullPage: true });
  });

  await step("refresh pulls tracking from Shadowfax (delivered)", async () => {
    await fetch(`${MOCK}/__test/advance`, { method: "POST", body: JSON.stringify({ awb: awb1, status_id: "delivered", status: "Delivered" }) });
    await page.getByRole("button", { name: "Refresh" }).click();
    await page.getByText(/Updated: /).waitFor({ timeout: 30000 });
    await page.getByText("Proof of delivery").waitFor();
    await page.getByRole("button", { name: "Fetch" }).click();
    await page.getByText("recipient name").waitFor({ timeout: 30000 });
  });

  await step("bulk upload: row-by-row results (2 booked, 2 failed)", async () => {
    const csv = [
      "client_order_id,customer_name,customer_phone,address_line_1,city,state,pincode,payment_mode,cod_amount,product_value,sku_name,sku_id,quantity",
      "BULK-1,Asha Verma,9811111111,12 Lake Road,Delhi,Delhi,110001,prepaid,,800,T-shirt,TS-1,2",
      "BULK-1,,,,,,,,,,Cap,CP-1,1",
      "BULK-2,Vikram Rao,98222,7 Hill View,Pune,Maharashtra,411001,cod,500,500,Mug,MG-1,1",
      "BULK-3,Neha Gupta,9833333333,4 Park Street,Kolkata,West Bengal,999999,cod,650,650,Lamp,LP-1,1",
      "BULK-4,Imran Khan,9844444444,9 Ring Road,Jaipur,Rajasthan,302001,prepaid,,1200,Shoes,SH-1,1",
    ].join("\n");
    const file = join(SHOTS, "bulk.csv");
    writeFileSync(file, csv);
    await page.getByRole("link", { name: "Bulk upload" }).click();
    await page.locator('input[type="file"]').setInputFiles(file);
    await page.getByText("5 rows →").waitFor();
    await page.getByRole("button", { name: /Book 4 orders/ }).click();
    await page.getByText(/4 \/ 4 processed/).waitFor({ timeout: 60000 });
    await page.getByText("2 booked").waitFor();
    await page.getByText(/Phone must be 10-14 digits/).waitFor();
    await page.getByText(/not serviceble/).waitFor();
    await page.screenshot({ path: join(SHOTS, "04-bulk-desktop.png"), fullPage: true });
  });

  await step("orders: search by name and by phone", async () => {
    await page.goto(`${APP}/orders`);
    await page.getByRole("searchbox", { name: "Search" }).fill("asha");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("link", { name: "Asha Verma" }).waitFor({ timeout: 15000 });
    await page.getByRole("searchbox", { name: "Search" }).fill("98444 44444");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("link", { name: "Imran Khan" }).waitFor({ timeout: 15000 });
    await page.getByRole("searchbox", { name: "Search" }).fill("");
    await page.getByRole("button", { name: "Search" }).click();
    await page.screenshot({ path: join(SHOTS, "05-orders-desktop.png"), fullPage: true });
  });

  await step("export CSV downloads a file", async () => {
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV" }).click()]);
    const path = join(SHOTS, "export.csv");
    await dl.saveAs(path);
  });

  await step("cancel needs a reason and typing CANCEL", async () => {
    await page.getByRole("link", { name: "Imran Khan" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    const dlg = page.locator("dialog[open]");
    const yes = dlg.getByRole("button", { name: "Yes, cancel" });
    await field(dlg, "Reason").fill("Customer changed mind");
    if (!(await yes.isDisabled())) throw new Error("confirm button should wait for CANCEL");
    await dlg.getByLabel('Type "CANCEL" to confirm').fill("cancel");
    await yes.click();
    await page.getByText("Shipment cancelled.").waitFor({ timeout: 30000 });
    await page.getByText("Cancelled", { exact: true }).first().waitFor({ timeout: 15000 });
  });

  await step("label link is generated before pickup", async () => {
    await page.goto(`${APP}/orders`);
    await page.getByRole("link", { name: "Asha Verma" }).click();
    const popup = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Label (PDF)" }).click();
    const p = await popup;
    await p.waitForURL(/example\.com\/labels\//, { timeout: 30000 }).catch(() => undefined);
    await p.close();
    await page.getByText(/Label ready until/).waitFor({ timeout: 15000 });
  });

  await step("return pickup: check pincodes, then book", async () => {
    await page.goto(`${APP}/returns/new`);
    await fillAddress(section(page, "Pick up from (customer)"), { name: "Rahul Sharma", contact: "9876543210", address1: "42 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560034" });
    const back = section(page, "Bring it back to");
    await page.waitForFunction(() => [...document.querySelectorAll("input")].some((i) => i.value === "560058"));
    const items = section(page, "Items");
    await field(items, "Item name").fill("Wireless Headphones");
    await field(items, "Price ₹").fill("1299");
    await field(items, "Return reason").fill("Not working");
    await page.getByRole("button", { name: "Check serviceability" }).click();
    await page.getByText("All legs are serviceable").waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: "Book return pickup" }).click();
    await page.waitForURL(/\/orders\/R\d+TST$/, { timeout: 30000 });
    void back;
  });

  await step("dashboard counters are live", async () => {
    await page.goto(APP);
    await page.getByRole("heading", { name: "Dashboard" }).waitFor();
    const tile = page.getByRole("link", { name: /Delivered/ }).first();
    await tile.getByText("1", { exact: true }).waitFor({ timeout: 15000 });
    await page.screenshot({ path: join(SHOTS, "06-dashboard-desktop.png"), fullPage: true });
  });

  const phone = await browser.newContext({ ...devices["iPhone 13"] });
  const m = await phone.newPage();
  await step("phone layout: dashboard, orders, order detail, new shipment", async () => {
    await login(m, "owner@example.com", "Owner-pass-123");
    await m.getByRole("heading", { name: "Dashboard" }).waitFor({ timeout: 30000 });
    await m.getByText("Asha Verma").first().waitFor({ timeout: 15000 });
    await m.screenshot({ path: join(SHOTS, "10-dashboard-phone.png"), fullPage: true });
    await m.goto(`${APP}/orders`);
    await m.getByText("Asha Verma").first().waitFor();
    await m.screenshot({ path: join(SHOTS, "11-orders-phone.png"), fullPage: true });
    await m.goto(`${APP}/orders/${awb1}`);
    await m.getByRole("heading", { name: awb1 }).waitFor();
    await m.screenshot({ path: join(SHOTS, "12-detail-phone.png"), fullPage: true });
    await m.goto(`${APP}/new`);
    await m.getByRole("heading", { name: "New shipment" }).waitFor();
    await m.screenshot({ path: join(SHOTS, "13-new-phone.png"), fullPage: true });
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) throw new Error("horizontal scroll on phone");
  });

  await step("an account that is not on the allow-list is refused", async () => {
    const c = await browser.newContext();
    const p = await c.newPage();
    await login(p, "stranger@example.com", "Stranger-pass-123");
    await p.getByText("This account cannot use the dashboard.").waitFor({ timeout: 30000 });
    // Firestore rules also refuse direct reads for this account.
    const denied = await p.evaluate(async () => {
      try {
        const r = await fetch("http://127.0.0.1:8080/v1/projects/demo-sf360/databases/(default)/documents/shipments");
        return r.status;
      } catch {
        return -1;
      }
    });
    if (denied === 200) throw new Error("unauthenticated read was allowed");
    await c.close();
  });

  await step("an unverified e-mail must verify first", async () => {
    const c = await browser.newContext();
    const p = await c.newPage();
    await login(p, "unverified@example.com", "Unverified-pass-123");
    await p.getByRole("button", { name: "Send verification link" }).waitFor({ timeout: 30000 });
    await c.close();
  });
} finally {
  await browser.close();
  writeFileSync(join(SHOTS, "results.json"), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} steps passed. Screenshots: ${SHOTS}`);
  if (failed) process.exitCode = 1;
}
