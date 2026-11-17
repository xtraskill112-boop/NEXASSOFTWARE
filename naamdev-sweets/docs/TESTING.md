# Testing

Three layers, all runnable locally and in CI (`.github/workflows/naamdev-ci.yml` at the repository
root). Tests never touch your development database.

| Layer | Command | Tooling | Count |
|---|---|---|---|
| Unit | `pnpm test:unit` | Vitest | 34 tests — `packages/shared/test` |
| API integration | `pnpm test:api` | Vitest + Supertest + local Razorpay mock + real PostgreSQL | 52 tests in 7 files — `apps/api/test` |
| End-to-end | `pnpm test:e2e` | Playwright (Chromium) against production builds | 6 serial steps — `tests/e2e/ecosystem.spec.ts` |
| Types | `pnpm typecheck` | `tsc --noEmit` in all 8 packages | — |

## Unit tests (`packages/shared`)

Pricing (`priceCart`: subtotal and MRP savings, delivery fee, free-delivery threshold and zone
overrides, inclusive and exclusive GST, percentage coupons with caps, category-scoped coupons
allocated per line, free-delivery coupons, invalid coupons reported without applying, loyalty
redemption limit, minimum order, empty cart), coupon validation and plain-language descriptions,
proportional allocation that sums exactly, the order state machine (happy path, invalid jumps,
refund flows), role permissions, rupee formatting, Indian phone normalisation, loyalty tiers,
translations and haversine distance.

## API integration tests (`apps/api/test`)

* `global-setup.ts` creates a **fresh, uniquely named database** (`naamdev_test_<timestamp>_<hex>`)
  on the Postgres server given by `TEST_DATABASE_SERVER_URL` (default
  `postgresql://naamdev:naamdev_dev@localhost:5432`), applies migrations with
  `prisma migrate deploy`, seeds it, starts a Razorpay mock on a local port and drops only that
  database afterwards (`KEEP_TEST_DB=true` keeps it for debugging). The database user needs
  `CREATEDB`.
* `setup-env.ts` points the API at that database with `OTP_DEV_ECHO=true` and console providers
  (`otp-delivery.test.ts` overrides this to model production without an SMS provider).
* The Razorpay mock (`razorpay-mock.ts`) implements the orders, payments and refunds endpoints the
  API calls; tests sign checkout responses and webhooks with the same HMAC-SHA256 scheme Razorpay
  uses, so signature, amount, webhook and refund code paths run for real.

Covered: OTP registration/login/lockout, password login and argon2 storage, CSRF enforcement,
password reset with session revocation, console/customer separation · guest cart merge, server-side
totals, stock limits, coupons with reasons, minimum order, COD placement with FEFO reservation,
idempotent checkout, non-serviceable PIN codes, customer cancellation restoring stock/coupon/points,
loyalty redemption, reorder · typo-tolerant and ingredient search, filters/sorting, suggestions,
product detail, home feed, delivery estimate · online payment: pending order + reservation window,
forged signature rejected, genuine payment verified and idempotent, amount mismatch rejected,
webhook-only confirmation with duplicate events ignored, invalid webhook signature rejected,
automatic refund on cancellation settled by webhook, partial refunds and over-refund protection ·
full delivery lifecycle with OTP, earnings and loyalty, pending partners can't go online, partner
registration, verified-buyer reviews · admin RBAC per endpoint, dashboard money hidden without
permission, CSV export, product/variant CRUD, inventory batches/damage/history, batch expiry at the
sale cut-off, settings validation, support ticket loop · OTP honesty when SMS can't be delivered.

## End-to-end (`tests/e2e`)

`pnpm test:e2e` runs `scripts/e2e.sh`, which:

1. refuses to start if ports 4000/3000/3001/3002 are busy;
2. creates a fresh `naamdev_e2e_<timestamp>` database (dropping older E2E databases), migrates and
   seeds it;
3. starts the API, makes **production builds** of the three apps (set `E2E_SKIP_BUILD=1` to reuse
   existing `.next` output) and serves them with `next start`;
4. runs Playwright, then stops every server it started.

The journey, in order, with three separate browser contexts:

1. **Rider** signs in to the partner app with geolocation granted and goes online.
2. **Customer** searches with a typo ("kaju katri"), opens Kaju Katli, picks the 1 kg variant
   (server price ₹1,105), *Buy now*, signs up with a mobile OTP, adds an address, pays by COD and
   lands on the order-placed page.
3. **Order manager** moves the order through Preparing → Packed in the console; the system offers
   it to the online rider.
4. **Rider** accepts, picks up, starts the trip and completes delivery with the 4-digit OTP shown
   on the customer's tracking page; the customer sees *Delivered* and earned reward points.
5. **Support agent** signs in and sees only what the support role allows.
6. **Packing staff** changes their own console password (a wrong current password is rejected),
   signs out, the old password no longer works and the new one does.

Logs of the servers go to `$E2E_LOG_DIR` (default `$TMPDIR` or `/tmp`), `nd-e2e-*.log`.

To run Playwright against servers you started yourself: `pnpm test:e2e:only`.

## Not covered by automated tests

* Real third-party providers (Razorpay live/test accounts, MSG91/Twilio, SMTP, FCM, Google Maps,
  Cloudinary) — see the manual checklists in [INTEGRATIONS.md](INTEGRATIONS.md).
* Online-payment UI with the real Razorpay Checkout widget (the API side is covered with the mock).
* Visual regression, load testing and cross-browser runs (only Chromium is exercised).

## Latest recorded run

Run on 2026-11-17 in this repository's development container (PostgreSQL 16, Node 22):

| Suite | Result |
|---|---|
| `pnpm typecheck` | all 8 packages pass |
| `pnpm test:unit` | 34 / 34 passed |
| `pnpm test:api` | 52 / 52 passed (7 files) |
| `pnpm test:e2e` | 6 / 6 passed (fresh database, fresh production builds) |
| Docker images | API image builds, migrates, seeds and serves `/health`; storefront image serves home, product, sitemap and static assets |
