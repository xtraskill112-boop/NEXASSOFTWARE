# NAAMDEV SWEETS

A complete Indian sweets & food-delivery platform: a customer storefront (English + हिन्दी, INR),
a store/staff console, a delivery-partner app and one backend API with live order tracking.

| App | Path | Dev URL | Who uses it |
|---|---|---|---|
| Storefront (Next.js, PWA-ready) | `apps/web` | http://localhost:3000 | Customers: browse, search, cart, checkout, track, account, support |
| Console (Next.js) | `apps/admin` | http://localhost:3001 | Super admin, store owner, managers, packing staff, support agents (permission-based) |
| Partner app (Next.js PWA) | `apps/delivery` | http://localhost:3002 | Delivery partners: go online, accept offers, pickup, OTP delivery, earnings |
| API (Express + Socket.IO) | `apps/api` | http://localhost:4000 | Everything above |

Shared packages: `packages/db` (Prisma schema, migrations, seed), `packages/shared` (money, pricing,
coupons, order state machine, permissions, validation, i18n), `packages/ui` (design system),
`packages/api-client` (typed fetch client + realtime).

## What works today, and what needs your credentials

Everything below is implemented and exercised by the test suites. Third-party services are
**off until you add their keys** — the apps say so rather than pretending:

| Integration | Without credentials | With credentials |
|---|---|---|
| Razorpay (UPI, cards, netbanking, wallets) | Checkout offers **Cash on Delivery only** and explains why | Online payments; server-side signature + amount verification, webhooks, refunds |
| SMS OTP (MSG91 or Twilio) | Dev: OTP printed in the API log (and echoed on screen when `OTP_DEV_ECHO=true`). Prod: OTP login returns "couldn't send" — password login still works | Real OTP SMS (Indian templates must be DLT-registered) |
| Email (SMTP) | Dev: printed to the API log. Prod: skipped and recorded as skipped | Order/OTP/reset emails |
| Push (Firebase Cloud Messaging) | In-app + realtime (Socket.IO) notifications only | Browser push notifications on the storefront |
| Google Maps | Address form with an optional GPS pin; live tracking draws a schematic route (store → partner → you) with ETA | Draggable map pin, "use my current location" PIN lookup, live Google map |
| Cloudinary | Uploads stored on local disk (`UPLOAD_DIR`), served by the API | Images/videos on Cloudinary |

The console's **Settings → Integrations** tab shows the live status of each one and the delivery log
of every notification. Setup steps for every provider: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).

Product imagery is original, procedurally generated SVG artwork (`pnpm assets`), not stock photos —
replace it with real photography from the console's product editor whenever you have it.

## Quick start (local development)

Requirements: Node.js ≥ 20.11, pnpm 10 (`corepack enable`), PostgreSQL 14+.

```bash
cd naamdev-sweets
pnpm install

# 1. Database (any local Postgres; this user/db matches the example env)
createuser -P naamdev            # password: naamdev_dev
createdb -O naamdev naamdev
psql -d naamdev -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm'   # needs superuser once

# 2. Environment
cp apps/api/.env.example apps/api/.env
cp apps/api/.env.example packages/db/.env       # only DATABASE_URL is read here
cp apps/web/.env.example apps/web/.env.local
cp apps/admin/.env.example apps/admin/.env.local
cp apps/delivery/.env.example apps/delivery/.env.local

# 3. Schema + catalogue + demo accounts
pnpm db:generate
pnpm db:deploy
pnpm db:seed

# 4. Run everything (API + three apps, hot reload)
pnpm dev
```

### Demo accounts (development seed only)

The seed creates these when `NODE_ENV` is not `production` (or `SEED_DEMO_ACCOUNTS=true`).
Password for all: `Naamdev@123`. They are fictional; no real customer data is included.

| Role | Login | App |
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
| Customer | `customer@naamdevsweets.local` or mobile `9000000100` | Storefront |

Customers normally sign in with a mobile OTP. In development the OTP appears in the API terminal
(and on screen while `OTP_DEV_ECHO=true`).

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | API + storefront + console + partner app with hot reload |
| `pnpm build` | Production build of every package and app |
| `pnpm typecheck` | TypeScript across all 8 workspace packages |
| `pnpm test` | Unit tests + API integration tests |
| `pnpm test:unit` | Pricing, coupons, loyalty, permissions, order state machine (Vitest) |
| `pnpm test:api` | API integration tests against a throw-away Postgres database (Vitest + Supertest + Razorpay mock) |
| `pnpm test:e2e` | Fresh database → API → production builds → Playwright journey across all three apps |
| `pnpm db:deploy` / `db:seed` / `db:migrate` | Apply migrations / seed (idempotent) / create a new migration |
| `pnpm assets` | Regenerate the catalogue artwork, emblem and app icons |

Test details and the latest recorded results: [docs/TESTING.md](docs/TESTING.md).

## Production

Docker Compose runs PostgreSQL, the API, the three apps, Caddy (automatic HTTPS for four domains)
and a daily backup job:

```bash
cp .env.production.example .env      # fill in domains, secrets, provider keys
docker compose up -d --build
docker compose exec api node dist/seed.js   # first deploy only: roles, catalogue, settings, super admin
```

Full guide — DNS, secrets, migrations, Razorpay webhook URL, backups & restore, logs and
monitoring, scaling notes: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, data model, order lifecycle, inventory, delivery dispatch, realtime
- [docs/API.md](docs/API.md) — REST endpoints and Socket.IO events
- [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) — Razorpay, SMS, email, push, maps, Cloudinary
- [docs/SECURITY.md](docs/SECURITY.md) — auth, sessions, CSRF, RBAC, payments, uploads, audit, data protection
- [docs/TESTING.md](docs/TESTING.md) — test suites and how to run them
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Docker, HTTPS, backups, monitoring
- [docs/PROGRESS.md](docs/PROGRESS.md) — feature checklist and known limitations
