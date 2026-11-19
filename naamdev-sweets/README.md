# NAAMDEV SWEETS

A complete Indian sweets & food-delivery platform on **Firebase**: a customer storefront (English +
हिन्दी, INR), a store/staff console, a delivery-partner app, one backend API, live order tracking and
Android apps for customers and riders.

| App | Path | Live address (after deploy) | Who uses it |
|---|---|---|---|
| Storefront (Next.js, PWA-ready) | `apps/web` | https://naamdevseets.web.app | Customers: browse, search, cart, checkout, track, account, support |
| Console (Next.js) | `apps/admin` | https://naamdevseets-admin.web.app | Super admin, store owner, managers, packing staff, support agents (permission-based) |
| Partner app (Next.js PWA) | `apps/delivery` | https://naamdevseets-partner.web.app | Delivery partners: go online, accept offers, pickup, OTP delivery, earnings |
| API (Express on Cloud Run) | `apps/api` | served under `/api` on each site | Everything above |

**Firebase services used:** Cloud Firestore (all data), Firebase Authentication (**email + password
only**), Firebase Storage (product images, avatars, private rider documents), Firebase Hosting (the three
sites), Cloud Run (API + the three Next.js apps), Cloud Scheduler (background jobs), and Firestore
listeners for real-time updates (order status, rider location, new orders, delivery offers).

Android apps (`mobile/android`): **NAAMDEV SWEETS** for customers and **NAAMDEV Partner** for riders.
They open the live sites above directly — nobody has to type a shop address. APKs are built by GitHub
Actions; see [mobile/android/README.md](mobile/android/README.md).

Shared packages: `packages/db` (Firestore access, types, seed), `packages/shared` (money, pricing,
coupons, order state machine, permissions, validation, i18n), `packages/ui` (design system),
`packages/api-client` (typed fetch client, Firebase Auth and live-update helpers).

## Payments

| Method | How it's confirmed |
|---|---|
| **UPI (direct to the shop)** — default `paytmqr6rgzn2@ptys` (RAKESH TAILOR), editable in Console → Settings → UPI payments | The customer pays from any UPI app (button on phones, QR code on computers) and enters the 12-digit UPI reference. The order stays **on hold** until a staff member with *Confirm direct UPI payments* finds the money in the shop's UPI account and clicks **Payment received**. A reference number alone never confirms an order. |
| Razorpay (cards, UPI, netbanking, wallets) | Off until you add Razorpay keys. Then: server-side signature and amount checks, webhooks, automatic refunds. |
| Cash on delivery | Rider collects cash and confirms on delivery. |

Refunds for UPI and cash orders are sent by staff (UPI/bank transfer) and recorded with the transfer
reference; they are never marked as refunded before that.

## What works without extra setup, and what needs credentials

| Integration | Without credentials | With credentials |
|---|---|---|
| Firebase (data, sign-in, storage, hosting) | Required — the deploy workflow sets it up in your project | — |
| UPI direct payments | Works (staff-verified, see above) | — |
| Razorpay | Checkout offers UPI (direct) and cash on delivery | Online payments with gateway verification |
| Order emails (SMTP) | Skipped and recorded as skipped. Sign-up verification and password-reset emails are sent by Firebase Auth regardless | Order confirmation / status emails |
| SMS | Off | MSG91 or Twilio (Indian templates must be DLT-registered) |
| Push (FCM) | In-app + live notifications only | Browser push on the storefront (needs a web push VAPID key) |
| Google Maps | Address form with optional GPS pin; schematic live-tracking route | Draggable map pin and live Google map |

The console's **Settings → Integrations** tab shows the live status of each one and the delivery log
of every notification. Setup steps: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).

## Going live (Firebase project `naamdevseets`)

1. Firebase console: keep the project on the **Blaze** plan.
2. Google Cloud console → IAM → Service accounts: create a key for a service account with the
   **Owner** role and add it to this GitHub repository as the secret `FIREBASE_SERVICE_ACCOUNT`.
3. Add the secret `NAAMDEV_ADMIN_EMAIL` (your console login; Firebase emails you a link to set the password).
4. GitHub → Actions → **NAAMDEV deploy to Firebase** → Run workflow.

The workflow creates the Firestore database, turns on email/password sign-in, deploys the API and
apps to Cloud Run, the three Hosting sites, security rules, indexes and the job scheduler, then prints
the live addresses. Full guide and troubleshooting: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Local development

Requirements: Node.js ≥ 20.11, pnpm 10 (`corepack enable`), Java 11+ (for the Firestore emulator).
Development runs entirely on the Firebase emulators — no real project, no keys.

```bash
cd naamdev-sweets
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/admin/.env.example apps/admin/.env.local
cp apps/delivery/.env.example apps/delivery/.env.local

pnpm emulators          # terminal 1: Auth, Firestore and Storage emulators
pnpm db:seed:local      # terminal 2: catalogue, settings, demo accounts (idempotent)
pnpm dev                # API + storefront + console + partner app with hot reload
```

### Demo accounts (development seed only)

Created only when not in production (or with `SEED_DEMO_ACCOUNTS=true`). Password for all:
`Naamdev@123`. They are fictional; no real customer data is included.

| Role | Email | App |
|---|---|---|
| Super admin | `admin@naamdevsweets.local` | Console |
| Store owner | `owner@naamdevsweets.local` | Console |
| Store manager | `manager@naamdevsweets.local` | Console |
| Order manager | `orders@naamdevsweets.local` | Console |
| Inventory manager | `inventory@naamdevsweets.local` | Console |
| Packing staff | `packing@naamdevsweets.local` | Console (kitchen board) |
| Support agent | `support@naamdevsweets.local` | Console |
| Delivery partner (approved) | `rider@naamdevsweets.local` | Partner app |
| Delivery partner (pending documents) | `rider2@naamdevsweets.local` | Partner app |
| Customer | `customer@naamdevsweets.local` | Storefront |

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | API + storefront + console + partner app with hot reload |
| `pnpm emulators` | Firebase Auth, Firestore and Storage emulators for development |
| `pnpm db:seed:local` | Seed the running emulators |
| `pnpm build` | Production build of every package and app |
| `pnpm typecheck` | TypeScript across all workspace packages |
| `pnpm test` | Unit tests + API integration tests |
| `pnpm test:unit` | Pricing, coupons, loyalty, permissions, order state machine, UPI links (Vitest) |
| `pnpm test:api` | API integration tests on the Firebase emulators (Vitest + Supertest + Razorpay mock) |
| `pnpm test:e2e` | Emulators → seed → API → production builds → Playwright journeys across all three apps |
| `pnpm assets` | Regenerate the catalogue artwork, emblem and app icons |

Test details and the latest recorded results: [docs/TESTING.md](docs/TESTING.md).

## Documentation

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Firebase setup, the deploy workflow, costs, operations
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, data model, order lifecycle, inventory, dispatch, realtime
- [docs/API.md](docs/API.md) — REST endpoints and live documents
- [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) — UPI, Razorpay, email, SMS, push, maps
- [docs/SECURITY.md](docs/SECURITY.md) — authentication, RBAC, payments, uploads, audit, data protection
- [docs/TESTING.md](docs/TESTING.md) — test suites and how to run them
- [docs/PROGRESS.md](docs/PROGRESS.md) — feature checklist and known limitations
