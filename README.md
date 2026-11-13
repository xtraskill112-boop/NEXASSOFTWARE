# StockSense Inventory Management System

**Project ID:** NX-2026-014  ·  **Client:** Kaveri Distributors Pvt. Ltd.  ·  **Developer:** Prince

StockSense is a full-stack, multi-warehouse inventory management platform. It tracks products across three warehouses (Bengaluru, Mysuru, Mangaluru), handles stock in, stock out and inter-warehouse transfers with strict no-negative-stock guarantees, raises low-stock alerts, and records every important operation in a complete audit trail. Access is controlled by Admin, Manager and Staff roles.

![Dashboard](docs/screenshots/dashboard.png)

---

## Contents

1. [Features](#features)
2. [Technology stack](#technology-stack)
3. [Quick start (Docker)](#quick-start-docker)
4. [Demo accounts & seed data](#demo-accounts--seed-data)
   - [Standalone single-file demo](#standalone-single-file-demo-indexhtml)
   - [Firebase edition (real logins, cloud data)](#firebase-edition-real-logins-cloud-data)
   - [Windows desktop app (.exe)](#windows-desktop-app-exe)
5. [Local development](#local-development)
6. [Configuration](#configuration)
7. [Architecture](#architecture)
8. [Business rules & stock integrity](#business-rules--stock-integrity)
9. [Roles & permissions](#roles--permissions)
10. [REST API reference](#rest-api-reference)
11. [Database schema](#database-schema)
12. [Testing](#testing)
13. [Security](#security)
14. [Project structure](#project-structure)
15. [Troubleshooting](#troubleshooting)

---

## Features

| Area | What you get |
|---|---|
| **Authentication** | Email/password sign-in, JWT sessions, bcrypt password hashing, login rate limiting, change password, automatic sign-out when a session is invalidated |
| **Dashboard** | Live KPIs (total SKUs, total inventory, low-stock products, total stock value), warehouse-wise stock chart with utilisation, 14-day movement trend (chart or table view), stock value by category, low-stock alerts, recent activity feed |
| **Products** | Add, edit, activate/deactivate and permanently delete (when no history) products; opening stock on creation; search by name/SKU/category/description; filters for category, stock status, active status and warehouse; sorting by name, SKU, stock, value or price; paginated table; detail drawer with per-warehouse stock and recent movements |
| **Warehouses** | Three seeded warehouses with live units, SKU count, share, value, capacity utilisation and low-stock count; add/edit/activate/deactivate (Admin); warehouse detail page with searchable stock list and movements |
| **Inventory operations** | Stock In, Stock Out and Transfer forms with product search, live per-warehouse availability, balance preview, "Max" helper, confirmation dialogs and a receipt of the recorded movement |
| **Movement history** | Full ledger filterable by type, warehouse, date range and free text (product, SKU, reference, notes) |
| **Low-stock reporting** | Out-of-stock / low-stock report with all-warehouse or single-warehouse scope, shortfall, suggested reorder quantity, estimated reorder cost and **CSV export** |
| **Audit log** | Every sign-in (successful and failed), sign-out, password change, user change, product/warehouse change, stock movement and rejected stock operation, with user, IP, user agent and JSON details |
| **User management** | Create users, change roles, activate/deactivate, reset passwords. Admins cannot lock themselves out, and at least one active admin always remains |
| **UX** | Responsive layout (desktop → phone), collapsible sidebar, global product search, notification bell with stock alerts, toasts, loading skeletons, empty and error states, confirmation dialogs, light/dark theme |

More screens: [Products](docs/screenshots/products.png) · [Stock operations](docs/screenshots/stock-operations.png) · [Low-stock report](docs/screenshots/low-stock-report.png) · [Audit logs](docs/screenshots/audit-logs.png) · [Dark mode](docs/screenshots/dashboard-dark.png) · [Login](docs/screenshots/login.png)

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS 4, React Router 7, TanStack Query 5, React Hook Form + Zod, Recharts, Lucide icons |
| Backend | Node.js 22, Express 5, TypeScript |
| Database | PostgreSQL 16, Prisma ORM 6 (migrations + typed client) |
| Security | JWT (HS256), bcrypt, Zod validation, role-based access control, express-rate-limit, Helmet, CORS |
| Testing | Jest + Supertest against a real PostgreSQL database |
| Deployment | Docker, Docker Compose, nginx (static hosting + API reverse proxy) |

## Quick start (Docker)

**Prerequisites:** Docker Engine 24+ with Docker Compose v2.

```bash
git clone <repository-url> stocksense
cd stocksense
docker compose up --build
```

When the containers are healthy:

| Service | URL |
|---|---|
| Web application | http://localhost:8080 |
| REST API | http://localhost:4000/api |
| Health check | http://localhost:4000/api/health |

On first start the backend automatically:
1. applies database migrations (`prisma migrate deploy`)
2. seeds the demo data. This is skipped automatically if users already exist, so restarts never duplicate data.

The defaults are meant for local evaluation. **For any shared or production deployment, create a `.env` file** next to `docker-compose.yml` (start from [`.env.example`](.env.example)) and set at least `POSTGRES_PASSWORD`, `JWT_SECRET` (`openssl rand -hex 32`) and `CORS_ORIGIN`. The API logs a warning on start-up while the placeholder JWT secret is still in use.

Useful commands:

```bash
docker compose logs -f backend      # follow API logs
docker compose down                 # stop (data is kept in the db-data volume)
docker compose down -v              # stop and DELETE all data (fresh seed on next start)
```

## Demo accounts & seed data

| Role | Email | Password |
|---|---|---|
| Admin | `admin@kaveridistributors.in` | `Admin@123` |
| Manager | `manager@kaveridistributors.in` | `Manager@123` |
| Staff | `staff@kaveridistributors.in` | `Staff@123` |
| Staff (deactivated, cannot sign in) | `suresh.gowda@kaveridistributors.in` | `Staff@123` |

The login page has one-click buttons that fill in these accounts. Hide them with `VITE_SHOW_DEMO_ACCOUNTS=false`. Override the seeded passwords with `SEED_ADMIN_PASSWORD`, `SEED_MANAGER_PASSWORD` and `SEED_STAFF_PASSWORD`. **Change all demo passwords before going live.**

The deterministic seed creates:

- **3 warehouses:** `BLR-CEN` Bengaluru Central (capacity 60,000), `MYS-REG` Mysuru Regional (30,000), `MNG-CST` Mangaluru Coastal (25,000)
- **32 FMCG products** across Beverages, Packaged Foods, Staples, Dairy, Snacks, Personal Care and Household Care. Several are deliberately low or out of stock, and one is inactive.
- **~500 stock movements** over the last 30 days (opening receipts, customer dispatches, replenishments, hub-to-regional transfers). Stock levels are derived from these movements, so the ledger and balances always agree.
- **~550 audit log entries** matching the history

## Standalone single-file demo (`index.html`)

[`standalone/index.html`](standalone/index.html) is the complete web application in **one HTML file**. Double-click it to open it in Chrome, Edge, Firefox or Safari. It needs no Docker, Node.js, database or internet connection.

In this edition the REST API runs **inside the browser** ([`frontend/src/standalone/`](frontend/src/standalone)). It has the same endpoints, validation, roles and permissions, stock rules (stock-outs and transfers beyond available stock are refused with 409) and audit logging as the Express backend, on top of the same demo data. Data is saved in the browser's local storage, so it survives reloads and is private to that browser. Use **Reset demo data** in the yellow banner to start over.

Use it for demos and client review only, not as the production system:
- Each browser keeps its own copy of the data; nothing is shared between users or computers.
- Security is simulated. Passwords are hashed and roles are enforced, but anyone with access to the browser can inspect or edit the stored data with developer tools.
- The real PostgreSQL concurrency protections apply only to the server edition (`docker compose up --build`).

Rebuild it after changing the frontend:

```bash
cd frontend
npm run build:standalone          # writes dist-standalone/index.html
cp dist-standalone/index.html ../standalone/index.html
```

## Firebase edition (real logins, cloud data)

[`firebase/hosting/index.html`](firebase/hosting/index.html) is the same single-file app connected to the Firebase project **`stocksense-7893c`**:

- **Firebase Authentication** (email + password) for real user accounts
- **Cloud Firestore** for shared, permanent storage, so every user and device sees the same live data
- **Firestore security rules** ([`firebase/firestore.rules`](firebase/firestore.rules)) that act as the server and enforce the business rules on Google's servers

It runs on Firebase's free **Spark** plan, with no server to maintain.

The file is fully self-contained: the app, the Firebase connection and the security rules (with a **Copy** button) are all inside `index.html`. When opened, it checks the Firebase project and, if anything is missing, shows a **setup checklist** (Authentication, Firestore database, security rules) with a button to the exact Firebase console page for each step.

### One-time setup in the Firebase console

1. **Authentication → Get started → Sign-in method → Email/Password → Enable.**
2. **Firestore Database → Create database**: Native mode, location `asia-south1` (Mumbai), **production mode**. This is separate from the Realtime Database, which StockSense does not use.
3. **Firestore Database → Rules**: replace the contents with the StockSense rules (use **Copy security rules** on the app's setup screen, or [`firebase/firestore.rules`](firebase/firestore.rules)) and click **Publish**. Alternatively, run `cd firebase && npm install && npx firebase login && npm run deploy:rules`.
4. Open `firebase/hosting/index.html` and **create the administrator account straight away**. The first account created on an empty project becomes the administrator.
5. On the dashboard, click **Load demo catalogue** for the Kaveri Distributors demo data, or add your own warehouses and products. Add managers and staff under **User Management**.

### A shareable link (Firebase Hosting)

```bash
cd firebase
npm install
npx firebase login
npm run deploy:hosting        # publishes firebase/hosting/index.html
```

The app is then available at **https://stocksense-7893c.web.app**.

### What the security rules enforce on the server

- every read and write requires a signed-in, **active** StockSense account; deactivated users lose access immediately
- role permissions: Staff record stock in and stock out; Manager also handles products and transfers; Admin also handles users and warehouses
- **stock can never be negative**, and every balance change must be written together with a new ledger movement of exactly the same quantity, so balances cannot be edited directly
- the stock ledger and audit log can only be added to, never edited or deleted
- unique SKUs and warehouse codes; users cannot change their own role or reactivate themselves; the first-administrator setup can happen only once

Stock operations use **Firestore transactions**: if two people dispatch the same stock at the same moment, one succeeds and the other is refused with *Insufficient stock*. This is verified in the automated end-to-end test.

### Known limits of the Firebase edition

Firestore rules cannot count or search across documents, so these checks run in the app rather than in the rules:

- warehouses holding stock cannot be deactivated
- products with history cannot be deleted
- at least one administrator must remain (the rules do prevent admins demoting or deactivating themselves)
- catalogue and user changes write their audit entries in the same transaction, but the rules do not require them

Other limits:
- Login rate limiting is Firebase Authentication's built-in brute-force protection. Failed sign-ins are not audited.
- Administrators create accounts from the browser, so sign-ups must stay enabled in Firebase Authentication. An account created outside the app has no StockSense profile and the rules deny it all data access. Fully locking down sign-ups needs Cloud Functions (Blaze plan).
- Admins reset passwords by sending Firebase's password-reset email. Email addresses cannot be changed.
- History screens (movements, audit log) load the last 90 days by default. Use the date filters for older records.

The Firebase web config in [`firebase/web-config.json`](firebase/web-config.json) is public by design: access is controlled by Authentication and the rules. For extra protection, restrict the API key to your app's domains in the Google Cloud console.

### Developing and testing the Firebase edition

```bash
cd firebase && npm install
npm run test:rules            # 22 security-rule tests in the Firestore emulator (needs Java 11+)

cd ../frontend
npm run build:firebase        # uses firebase/web-config.json (or VITE_FIREBASE_CONFIG)
cp dist-firebase/index.html ../firebase/hosting/index.html
```

A project ID starting with `demo-` connects to the local Firebase emulators (`npm run emulators` in `firebase/`), which is how the end-to-end tests run.

## Windows desktop app (.exe)

The Firebase edition is also packaged as a Windows desktop app ([`desktop/`](desktop), built with Electron). It opens StockSense in its own window, with a Start-menu entry and a desktop shortcut, and uses the same Firebase project and accounts as the web version.

| File | Use |
|---|---|
| `StockSense-Setup-1.0.0.exe` | Installer: choose the install folder; creates Start-menu and desktop shortcuts; uninstall from *Settings → Apps* |
| `StockSense-Portable-1.0.0.exe` | Portable: no installation, just double-click (also runs from a USB drive) |

**Requirements:** Windows 10 or 11 (64-bit) and an internet connection, because data lives in Firebase.

**First launch:** the app is not code-signed (signing needs a paid certificate), so Windows SmartScreen may show *"Windows protected your PC"*. Click **More info → Run anyway**. Sign in with your StockSense account. You stay signed in between launches; use *Sign out* in the user menu to switch accounts.

Desktop extras: the window size and position are remembered, only one copy runs at a time, Firebase console links open in your default browser, and CSV exports open a *Save as* dialog. If your network requires a proxy, set the environment variable `STOCKSENSE_PROXY=http://host:port`.

**Build the .exe files**

```bash
cd frontend && npm run build:firebase && cp dist-firebase/index.html ../firebase/hosting/index.html
cd ../desktop && npm install
npm run dist:win              # -> desktop/release/StockSense-Setup-*.exe and StockSense-Portable-*.exe
```

On Windows this works as-is. On Linux the installer step needs Wine (32-bit support included). You can also run the **Desktop app (Windows)** workflow from the GitHub Actions tab, which builds both files on a Windows runner and attaches them to the run. To publish a new version, raise `version` in `desktop/package.json`.

## Local development

**Prerequisites:** Node.js 20+ (22 recommended) and PostgreSQL 14+.

```bash
# 1. Database (example using psql as a superuser)
psql -c "CREATE ROLE stocksense WITH LOGIN PASSWORD 'stocksense_dev' CREATEDB;"
psql -c "CREATE DATABASE stocksense OWNER stocksense;"
psql -c "CREATE DATABASE stocksense_test OWNER stocksense;"   # for automated tests

# 2. Backend
cd backend
cp .env.example .env            # then edit DATABASE_URL / JWT_SECRET
npm install
npx prisma migrate deploy       # create tables
npm run db:seed                 # demo data
npm run dev                     # API on http://localhost:4000 (hot reload)

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                     # UI on http://localhost:5173 (proxies /api to :4000)
```

| Backend script | Purpose |
|---|---|
| `npm run dev` | Start API with hot reload (tsx) |
| `npm run build` / `npm start` | Compile to `dist/` and run the compiled server |
| `npm run typecheck` | TypeScript type check |
| `npm test` | Run the Jest + Supertest suite |
| `npm run test:coverage` | Tests with coverage report |
| `npm run prisma:migrate` | Create/apply a new migration during development |
| `npm run db:deploy` | Apply pending migrations |
| `npm run db:seed` | Seed demo data (no-op if users exist) |
| `npm run db:reset` | Drop, re-migrate and re-seed the dev database (destructive) |

| Frontend script | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type check and production build into `dist/` |
| `npm run preview` | Serve the production build locally |

## Configuration

All configuration comes from environment variables, and secrets are never committed. `.env` files are git-ignored, and templates live in [`.env.example`](.env.example) (Docker Compose), [`backend/.env.example`](backend/.env.example) and [`frontend/.env.example`](frontend/.env.example). The backend validates its environment with Zod on start-up and refuses to start if it is invalid (for example, a `JWT_SECRET` shorter than 32 characters).

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | – | PostgreSQL connection string (required) |
| `JWT_SECRET` | – | HMAC secret for JWTs, ≥ 32 chars (required) |
| `JWT_EXPIRES_IN` | `8h` | Session lifetime |
| `BCRYPT_ROUNDS` | `12` | bcrypt cost factor |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed browser origin(s), comma-separated |
| `LOGIN_RATE_LIMIT_WINDOW_MS` / `LOGIN_RATE_LIMIT_MAX` | `900000` / `5` | Failed login attempts allowed per IP + email per window |
| `API_RATE_LIMIT_WINDOW_MS` / `API_RATE_LIMIT_MAX` | `60000` / `300` | General API rate limit per IP |
| `TRUST_PROXY` | `false` | Set `true` behind a reverse proxy (Compose sets it for nginx) |
| `APP_TIMEZONE` | `Asia/Kolkata` | Time zone used to bucket dashboard trend days |
| `SEED_ON_START` | `true` (Compose) | Seed demo data on container start if the DB is empty |
| `VITE_SHOW_DEMO_ACCOUNTS` | `true` | Show demo-account buttons on the login page (build time) |

## Architecture

```
 Browser ──► nginx (frontend container, :8080)
               ├── /          → React SPA (static files)
               └── /api/*     → reverse proxy ──► Express API (backend container, :4000)
                                                     ├── Zod validation
                                                     ├── JWT auth + RBAC middleware
                                                     ├── Services (transactions, row locks)
                                                     └── Prisma ──► PostgreSQL 16 (db container)
```

- **Backend:** modular structure (`modules/<feature>/{routes,schemas,service}.ts`). Routes parse input with Zod, check permissions and call services. Services hold the business logic and run multi-step changes inside database transactions. A central error handler maps validation errors (400), auth errors (401/403), missing records (404), conflicts (409) and rate limits (429) to one JSON shape: `{ "error": { "code", "message", "details?" } }`.
- **Frontend:** TanStack Query handles data fetching, caching and invalidation after mutations, so the dashboard, tables and alerts update immediately after an operation. Context providers supply auth, theme, toasts and confirmation dialogs. All data on screen comes from the API; nothing is hard-coded.

## Business rules & stock integrity

**Stock can never become negative.** If a stock-out or transfer asks for more than is available, the API responds **`409 Conflict`** with code `INSUFFICIENT_STOCK` and the available and requested quantities. Nothing changes, and the rejected attempt is recorded in the audit log (`STOCK_OPERATION_REJECTED`).

This is enforced in layers:

1. **Single transaction per operation:** the stock level update, the `stock_movements` row and the `audit_logs` row are committed together or not at all.
2. **Atomic conditional decrement (stock out):** `UPDATE stock_levels SET quantity = quantity - n WHERE … AND quantity >= n`. PostgreSQL row locking serialises concurrent requests, and each one re-checks the condition against the latest committed value.
3. **Deterministic row locking (transfers):** both stock rows are locked with `SELECT … FOR UPDATE` in a fixed order (by warehouse id), so simultaneous A→B and B→A transfers cannot deadlock.
4. **Automatic retry** of the rare deadlock or serialization failure.
5. **Database `CHECK` constraints** as the final safety net: `stock_levels.quantity >= 0`, `stock_movements.quantity > 0`, and a constraint requiring each movement type to have the correct source/destination warehouses.

The test suite proves this under load. For example, 25 simultaneous requests for 4 units against 50 in stock produce exactly 12 successes, 13 × 409 and a final balance of 2.

Other rules:
- Inactive products and inactive warehouses cannot take part in stock operations (409).
- A warehouse that still holds stock cannot be deactivated (409).
- Products with stock or movement history cannot be hard-deleted. Deactivate them instead (409).
- **Low stock:** an active product whose total on-hand quantity is at or below its reorder level. **Out of stock:** quantity is zero. With a warehouse filter, the report compares that warehouse's quantity against the reorder level. Suggested reorder quantity brings stock back up to twice the reorder level.

## Roles & permissions

| Capability | Admin | Manager | Staff |
|---|:-:|:-:|:-:|
| View dashboard, products, warehouses, stock levels, movements | ✅ | ✅ | ✅ |
| View low-stock report & export CSV | ✅ | ✅ | ✅ |
| Stock In / Stock Out | ✅ | ✅ | ✅ |
| Transfer between warehouses | ✅ | ✅ | – |
| Create / edit / activate / deactivate products | ✅ | ✅ | – |
| Permanently delete products (no history) | ✅ | – | – |
| View audit logs | ✅ | ✅ | – |
| Create / edit / activate / deactivate warehouses | ✅ | – | – |
| Manage users (create, role, status, reset password) | ✅ | – | – |

Permissions are enforced on the **server** for every request (`backend/src/lib/permissions.ts`). The UI hides actions a role cannot perform, but that is a convenience only. The user's role and active status are re-read from the database on every request, so role changes and deactivations take effect immediately.

## REST API reference

Base URL: `/api`. All endpoints except `POST /auth/login` and `GET /health` need `Authorization: Bearer <token>`. List endpoints accept `page` and `pageSize` and return `{ data, pagination: { page, pageSize, total, totalPages } }`.

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET | `/health` | public | Service and database health |
| POST | `/auth/login` | public (rate-limited) | `{ email, password }` → `{ token, expiresAt, user }` |
| GET | `/auth/me` | any | Current user and permissions |
| POST | `/auth/logout` | any | Records sign-out in the audit log |
| POST | `/auth/change-password` | any | `{ currentPassword, newPassword }` → new token; other sessions are invalidated |
| GET | `/dashboard/summary` | dashboard:view | KPIs, warehouse stock, 14-day trend, categories, low-stock items, recent activities |
| GET | `/products` | products:view | `search, category, status, stockStatus, warehouseId, sortBy, sortOrder` |
| GET | `/products/categories` | products:view | Categories with product counts |
| GET | `/products/:id` | products:view | Product, per-warehouse stock, recent movements |
| POST | `/products` | products:create | Create (optional `openingStock: [{ warehouseId, quantity }]`) |
| PUT | `/products/:id` | products:update | Update catalogue fields |
| PATCH | `/products/:id/status` | products:deactivate | `{ isActive }` |
| DELETE | `/products/:id` | products:delete | Hard delete; 409 if the product has history |
| GET | `/warehouses` | warehouses:view | Warehouses with live stats (`includeInactive`) |
| GET | `/warehouses/:id` | warehouses:view | Warehouse, stats, recent movements |
| POST | `/warehouses` | warehouses:manage | Create |
| PUT | `/warehouses/:id` | warehouses:manage | Update |
| PATCH | `/warehouses/:id/status` | warehouses:manage | `{ isActive }`; 409 if it still holds stock |
| GET | `/inventory/stock-levels` | inventory:view | `warehouseId, productId, search, onlyInStock` |
| GET | `/inventory/movements` | inventory:view | `type, productId, warehouseId, userId, search, from, to` |
| POST | `/inventory/stock-in` | inventory:stock-in | `{ productId, warehouseId, quantity, reference?, notes? }` |
| POST | `/inventory/stock-out` | inventory:stock-out | Same body; **409** if insufficient stock |
| POST | `/inventory/transfer` | inventory:transfer | `{ productId, fromWarehouseId, toWarehouseId, quantity, reference?, notes? }`; **409** if insufficient |
| GET | `/reports/low-stock` | reports:view | `warehouseId, category, search, status=all\|low\|out, format=json\|csv` |
| GET | `/audit-logs` | audit:view | `action, entityType, entityId, userId, search, from, to` |
| GET | `/audit-logs/filters` | audit:view | Available actions and entity types |
| GET | `/users` | users:manage | `search, role, status` |
| GET | `/users/:id` | users:manage | User detail |
| POST | `/users` | users:manage | `{ name, email, role, password }` |
| PUT | `/users/:id` | users:manage | `{ name?, email?, role? }` |
| PATCH | `/users/:id/status` | users:manage | `{ isActive }` |
| POST | `/users/:id/reset-password` | users:manage | `{ password }` |

Example:

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"manager@kaveridistributors.in","password":"Manager@123"}' | jq -r .token)

curl -s -X POST http://localhost:4000/api/inventory/stock-out \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"productId":"<uuid>","warehouseId":"<uuid>","quantity":999999}'
# → 409 {"error":{"code":"INSUFFICIENT_STOCK","message":"Insufficient stock: requested 999999, only 520 available", ...}}
```

## Database schema

Defined in [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma), with SQL migrations in `backend/prisma/migrations`.

| Table | Purpose | Key columns |
|---|---|---|
| `users` | Accounts | `email` (unique), `password_hash`, `role` (ADMIN/MANAGER/STAFF), `is_active`, `token_version`, `last_login_at` |
| `warehouses` | Storage locations | `code` (unique), `name`, `city`, `address`, `capacity`, `is_active` |
| `products` | Catalogue | `sku` (unique), `name`, `category`, `unit`, `unit_price` (numeric 12,2), `reorder_level`, `is_active` |
| `stock_levels` | On-hand quantity per product per warehouse | unique (`product_id`, `warehouse_id`), `quantity` **CHECK ≥ 0** |
| `stock_movements` | Immutable ledger | `type` (STOCK_IN/STOCK_OUT/TRANSFER), `product_id`, `from_warehouse_id`, `to_warehouse_id`, `quantity` **CHECK > 0**, `reference`, `notes`, `performed_by`, `created_at` |
| `audit_logs` | Audit trail | `user_id`, `action`, `entity_type`, `entity_id`, `details` (JSONB), `ip_address`, `user_agent`, `created_at` |

Indexes cover the main filters (category, status, movement date/type/warehouse, audit action/entity/user/date).

## Testing

The backend suite has **77 Jest + Supertest tests** across auth, RBAC, users, products, warehouses, inventory, concurrency, dashboard, reports and audit logs. They run against a real PostgreSQL database, not mocks, so transactions, locks and constraints are actually exercised.

```bash
cd backend
# uses postgresql://stocksense:stocksense_dev@localhost:5432/stocksense_test by default
# or point it elsewhere (the name must contain "test"; the suite refuses other databases):
export TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/stocksense_test
npm test
```

Highlights:
- login success and failure, generic error messages, inactive accounts, tampered, foreign-signed and expired tokens, **rate limiting (429)**, password change invalidating old sessions
- every role/endpoint combination that must return 403, plus role changes taking effect immediately
- product validation (field-level errors), duplicate SKU (409), search, filters, sorting, pagination, opening stock, delete protection
- stock in/out/transfer, **409 on insufficient stock with no side effects**, inactive product/warehouse rules
- **concurrency:** 25 parallel stock-outs, mixed parallel in/out, opposite-direction parallel transfers (no deadlock, stock conserved), parallel transfers that must not oversell, and the database CHECK constraint itself
- dashboard KPIs verified against known fixtures, low-stock report scopes, filters and CSV export, audit log filters

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs the backend typecheck, build and tests against PostgreSQL 16, plus the frontend typecheck and build, on every push.

## Security

- Passwords hashed with **bcrypt** (cost 12). Passwords are never logged or returned. Login does a dummy hash comparison for unknown emails, so response timing does not reveal which accounts exist.
- **JWT** (HS256, issuer-checked, 8 h expiry). Each token carries a token version that is bumped on password change, password reset, role change and deactivation, which immediately invalidates existing sessions.
- **Login rate limiting** per IP + email (5 failures / 15 min by default, successful logins not counted) plus a general API rate limit.
- **Zod validation** on every body, query and route parameter, with strict enums and whitelisted sort columns. Raw SQL is fully parameterised.
- **RBAC** enforced server-side on every route, and the role is re-read from the database on every request.
- **Helmet** security headers, strict CORS, 100 kb JSON body limit, nginx security headers, CSV export hardened against formula injection.
- Containers run as non-root (API), secrets come only from environment variables, and `.env` files are git-ignored.

## Project structure

```
.
├── docker-compose.yml          # db + backend + frontend
├── .env.example                # Compose configuration template
├── backend/
│   ├── Dockerfile, docker-entrypoint.sh
│   ├── prisma/
│   │   ├── schema.prisma       # data model
│   │   ├── migrations/         # SQL migrations (incl. CHECK constraints)
│   │   ├── seed.ts, seed-data.ts
│   ├── src/
│   │   ├── app.ts, server.ts
│   │   ├── config/env.ts       # validated configuration
│   │   ├── lib/                # prisma, jwt, password, permissions, audit, errors, pagination
│   │   ├── middleware/         # auth/RBAC, rate limiting, error handling
│   │   └── modules/            # auth, users, products, warehouses, inventory, dashboard, reports, audit
│   └── tests/                  # Jest + Supertest suites
├── frontend/
│   ├── Dockerfile, nginx.conf
│   └── src/
│       ├── components/         # layout (sidebar, topbar), ui kit, charts, product picker
│       ├── context/            # auth, theme, toasts, confirm dialog
│       ├── lib/                # API client, types, formatters, queries
│       ├── pages/              # dashboard, products, warehouses, inventory, reports, audit, users, profile, login
│       └── routes/             # auth and permission guards
└── docs/screenshots/
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Port 8080 or 4000 already in use | Set `WEB_PORT` / `API_PORT` in `.env`, e.g. `WEB_PORT=8081` |
| Backend exits with `Invalid environment configuration` | A required variable is missing or invalid (for example `JWT_SECRET` under 32 characters). The log lists each problem. |
| Need a completely fresh demo dataset | `docker compose down -v && docker compose up --build` |
| "Too many login attempts" | Wait for the window (15 min by default) or restart the backend container in a dev environment |
| Tests refuse to run | `TEST_DATABASE_URL` must point to a database whose name contains `test` |

---

© 2026 Kaveri Distributors Pvt. Ltd. Built for project NX-2026-014.
