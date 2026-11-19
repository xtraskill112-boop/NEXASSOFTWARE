# Testing

Three layers, all runnable locally and in CI (`.github/workflows/naamdev-ci.yml` at the repository
root). Every test runs on the **Firebase emulators** (Auth, Firestore, Storage — project
`demo-naamdev`); nothing touches the real `naamdevseets` project. Java 11+ is needed for the
Firestore emulator.

| Layer | Command | Tooling | Count |
|---|---|---|---|
| Unit | `pnpm test:unit` | Vitest | 37 tests — `packages/shared/test` |
| API integration | `pnpm test:api` | Vitest + Supertest + Firebase emulators + local Razorpay mock | 68 tests in 8 files — `apps/api/test` |
| End-to-end | `pnpm test:e2e` | Playwright (Chromium) against the static production builds on the emulators | 7 serial steps — `tests/e2e/ecosystem.spec.ts` |
| Types | `pnpm typecheck` | `tsc --noEmit` in all workspace packages | — |

## Unit tests (`packages/shared`)

Pricing (`priceCart`: subtotal and MRP savings, delivery fee, free-delivery threshold and zone
overrides, inclusive and exclusive GST, percentage coupons with caps, category-scoped coupons,
free-delivery coupons, invalid coupons reported without applying, loyalty redemption limit, minimum
order, empty cart), coupon validation and descriptions, proportional allocation, the order state
machine, role permissions, rupee formatting, phone normalisation, loyalty tiers, translations,
haversine distance, and the **UPI payment link** (exact format with amount and order number, URL
encoding, 12-digit reference validation).

## API integration tests (`apps/api/test`)

`pnpm --filter @naamdev/api test` wraps Vitest in `firebase emulators:exec`. `global-setup.ts` wipes
the emulators' Firestore and Auth data, runs the seed, and starts a Razorpay mock; test clients sign
in through the Auth emulator's REST API (exactly what the browser SDK does) and call the API with the
resulting bearer ID token.

Covered:

* **Auth** — email/password sign-up creates the profile with signup bonus and custom claims; signed-in
  accounts without a profile can't use the API; malformed/forged tokens rejected; the client can't
  pick its role; console/customer separation; *sign out everywhere* invalidates earlier tokens;
  suspension disables sign-in.
* **Cart & checkout** — guest cart token and merge at sign-in, server-side totals, stock limits,
  coupons with reasons, minimum order, COD placement with FEFO batch reservation, idempotent
  checkout (concurrent duplicates → one order), oversell protection, non-serviceable PIN codes,
  cancellation restoring stock/coupon/points, loyalty redemption, reorder.
* **Catalogue** — typo-tolerant and ingredient search, filters/sorting, suggestions, product detail,
  home feed, delivery estimate.
* **Razorpay** — pending order + reservation window, forged signature rejected, genuine payment
  verified and idempotent, amount mismatch rejected, webhook-only confirmation with duplicate events
  ignored, invalid webhook signature rejected, automatic refund settled by webhook, partial refunds.
* **Direct UPI** — the link carries the shop's UPI ID, payee, exact server total and `ORDER #…` note;
  a submitted reference **never** confirms the order by itself; references can't be reused across
  orders; only `payments.verify` staff can confirm (customers 403, packing staff 403); "not found"
  gives the customer another window; expiry cancels unpaid UPI orders but keeps those being verified;
  cancelling a paid UPI order creates a *pending* manual refund that is only marked refunded once staff
  record the transfer reference; UPI settings validation.
* **Delivery** — full lifecycle with OTP, earnings and loyalty; pending partners can't go online;
  partner registration (a storefront account can't become a partner).
* **Console** — RBAC per endpoint, dashboard money hidden without permission, CSV export, product CRUD,
  inventory batches/damage/history, batch expiry, settings validation, support ticket loop, staff
  accounts in Firebase Auth (claims, password reset revoking sessions, deactivation), custom roles,
  customer anonymisation (Firebase login deleted, orders kept), delivery zones keyed by PIN code,
  partner payout settlement.
* **Firebase specifics** — free-plan uploads stored in Firestore and served from `/media/…` (non-images
  and videos rejected, avatars must be our own URLs), Cloud Storage uploads (paid plan, download-token
  URLs), private KYC documents without public addresses and readable only by `partners.manage`,
  live documents written for the customer and staff, the scheduler endpoint (secret required, each
  job runs once per lease), unpaid-order expiry releasing stock.

## End-to-end (`tests/e2e`)

`pnpm test:e2e` runs `scripts/e2e.sh`: it starts the emulators, seeds them, starts the API, makes
**static production builds** of the three apps pointed at the emulators (`E2E_SKIP_BUILD=1` reuses
them), serves them with `scripts/serve-static.mjs` — which applies the same rewrites and
Content-Security-Policy as Firebase Hosting (`firebase.json`) — and runs Playwright with separate
browser contexts:

1. **Rider** signs in to the partner app with geolocation granted and goes online.
2. **Customer** searches with a typo ("kaju katri"), opens Kaju Katli, picks 1 kg (server price
   ₹1,105), *Buy now*, **signs up with email + password** (Firebase Auth), adds an address, pays by
   COD and lands on the order-placed page.
3. **Order manager** moves the order through Preparing → Packed; the system offers it to the rider.
4. **Rider** accepts, picks up, starts the trip and completes delivery with the 4-digit OTP from the
   customer's tracking page; the customer sees *Delivered* and earned points.
5. **Customer pays by UPI**: sees the QR code, the shop's UPI ID and payee name, submits a reference
   and sees "Checking your UPI payment"; the **order manager** sees it on the dashboard, confirms
   *Payment received*; the customer's page updates live (Firestore listener) to *Paid*.
6. **Support agent** sees only what the support role allows.
7. **Packing staff** changes their password (a wrong current password is rejected), signs out; the old
   password no longer works and the new one does.

Server logs go to `$E2E_LOG_DIR` (default `$TMPDIR` or `/tmp`), `nd-e2e-*.log`.

## Not covered by automated tests

* The real Firebase project (`naamdevseets`): deploys, production security-rule evaluation and
  composite indexes (the emulator doesn't enforce indexes) are exercised by the deploy workflow's smoke
  test, not by CI.
* Real third-party providers (Razorpay accounts, SMTP, SMS, FCM, Google Maps) and actual UPI apps —
  see the manual checklists in [INTEGRATIONS.md](INTEGRATIONS.md).
* The Android apps on devices (the Java code is compiled in CI's Android workflow).
* Visual regression, load testing and cross-browser runs (only Chromium is exercised).

## Latest recorded run

Run on 2026-11-19 in this repository's development container (Node 22, Java 21, firebase-tools 15.34.2):

| Suite | Result |
|---|---|
| `pnpm typecheck` | all packages pass |
| `pnpm test:unit` | 37 / 37 passed |
| `pnpm test:api` | 68 / 68 passed (8 files) |
| `pnpm test:e2e` | 7 / 7 passed (emulators, static builds served with the Hosting rules) |
| API Docker image | Builds and, run the way Render runs it (production mode, `PORT`, against the emulators), serves `/healthz`, `/health`, the catalogue and static artwork, allows CORS only for the three sites, and runs the in-process jobs |
| Deploy workflow, Render step | Exercised against a local stand-in for the Render API (create, then update keeping `ENCRYPTION_KEY`/`JOBS_SECRET`); **not yet run against real Render or Firebase** |
