# Architecture

```
                         ┌──────────────── Caddy (HTTPS, HSTS) ────────────────┐
  customers ──▶ web  :3000 (Next.js storefront)  ─┐                              │
  staff     ──▶ admin :3001 (Next.js console)    ─┼─ /api/v1, /static, /uploads ─▶ api :4000 ─▶ PostgreSQL 16
  partners  ──▶ delivery :3002 (Next.js PWA)     ─┘   (same-origin rewrites)       │  Express 5 + Socket.IO
                                                                                   │  scheduler (advisory-locked jobs)
  browsers ── Socket.IO (wss) ─────────────────────────────────────────────────────┘
  Razorpay ── webhooks ──▶ api /api/v1/payments/razorpay/webhook
```

* **One API, three apps.** Each Next.js app proxies `/api/v1/*` to the API through a rewrite, so the
  browser talks to its own origin: session cookies stay first-party and `SameSite=Lax`, no CORS
  pre-flights for normal traffic. Socket.IO connects to the API origin directly with a short-lived JWT.
* **Server components fetch on the server** (`API_INTERNAL_URL`) for SEO pages — home, category,
  product (with JSON-LD), collections, content pages, sitemap. Interactive areas (cart, checkout,
  account, console, partner app) are client components using `@naamdev/api-client`.
* **pnpm monorepo**: `apps/*` and `packages/*`. Workspace packages ship TypeScript source; the API
  bundle (tsup) inlines them, Next.js transpiles them.

## Packages

| Package | Contents |
|---|---|
| `packages/shared` | Money helpers (integer **paise** everywhere), `priceCart` (GST-inclusive pricing, coupon allocation by largest remainder, loyalty cap), coupon rules, loyalty, order state machine, 29 permissions × 9 system roles, zod validation schemas shared by client and server, English/Hindi dictionaries, geo helpers |
| `packages/db` | Prisma schema (59 models), SQL migration (adds `pg_trgm`, trigram/GIN search indexes and CHECK constraints such as `available >= 0`), catalogue + content data, idempotent seed |
| `packages/ui` | Tailwind v4 design system: semantic colour tokens with light/dark themes, buttons, forms, dialogs/sheets, tabs, status chips, skeletons, empty/error states, brand emblem & splash |
| `packages/api-client` | Typed fetch client (CSRF handling, `x-nds-app` header, field-level errors) and Socket.IO connector |

## API modules (`apps/api/src/modules`)

`auth` · `catalog` (+ public settings/pages/FAQs) · `cart` · `orders` (checkout, lifecycle, serializers)
· `payments/razorpay` · `inventory` · `delivery` · `notifications` (in-app, email, SMS, push) ·
`loyalty` · `account` · `reviews` · `support` · `uploads` · `admin/*` (orders, payments, catalog,
inventory, marketing, people, settings, analytics). Cross-cutting code lives in `lib/` (errors,
crypto, logger, pagination, settings cache, audit) and `middleware/` (auth, CSRF, rate limits,
error handler). Endpoint list: [API.md](API.md).

## Money and pricing — the server decides

All amounts are integers in paise. The client never submits prices: `POST /checkout/quote` and
`POST /checkout/place-order` re-read variants, stock, coupon, loyalty balance and settings inside
the transaction and compute every total with `priceCart`. Prices are GST-inclusive by default
(5%); tax is back-calculated per line and stored on the order item for invoices.

## Order lifecycle

```
PENDING ─▶ CONFIRMED ─▶ PROCESSING ─▶ PREPARING ─▶ PACKED ─▶ READY_FOR_PICKUP ─▶ DISPATCHED ─▶ OUT_FOR_DELIVERY ─▶ DELIVERED
   │            │             │             │           │              │                                                │
   └────────────┴─────────────┴─────────────┴───────────┴──────────────┴──▶ CANCELLED ─▶ REFUND_INITIATED ─▶ REFUNDED ◀─┘
```

* Transitions are whitelisted in `packages/shared/src/order-state.ts` and enforced server-side;
  every change writes `OrderStatusHistory`, emits a Socket.IO event and notifies the customer.
* Kitchen steps (Processing → Ready for pickup) need only `orders.process` (packing staff); other
  transitions need `orders.manage`; cancellation needs `orders.cancel`.
* Customers can self-cancel while `PENDING`/`CONFIRMED`/`PROCESSING`.
* **COD** orders are created `CONFIRMED`. **Online** orders are created `PENDING` with stock
  reserved for `checkout.reservationMinutes`; they become `CONFIRMED` only after the server verifies
  the Razorpay payment (signature + fetched payment status/amount, or a signed webhook). The
  `expire-unpaid-orders` job cancels unpaid orders and releases stock. A payment that arrives after
  expiry/cancellation is refunded automatically.

### Duplicate protection

* Every checkout carries a client-generated `idempotencyKey`; `(userId, idempotencyKey)` is unique,
  and placement runs under a per-user Postgres advisory lock, so double taps and retries return the
  original order.
* `markOrderPaid` is idempotent (unique gateway payment id, status guard), so the verify call and
  the webhook can race safely. Webhooks are de-duplicated by event id in `WebhookEvent`.

## Inventory

* Stock is tracked per **variant** (`Inventory.available/reserved`) and per **batch**
  (`InventoryBatch` with manufacture/expiry dates, supplier, purchase cost).
* Reservation uses an atomic `UPDATE … WHERE available >= qty`; allocation picks batches
  **first-expiry-first-out** with `SELECT … FOR UPDATE`, skipping batches that expire within the
  sale cut-off (6 h) so nothing near expiry is sold.
* On dispatch reservations are committed; on cancel they are released back to the same batches.
* Every movement (purchase, sale, release, adjustment, wastage, expiry) is a `StockTransaction`.
  Jobs: `expire-batches` (writes off expired stock) and `inventory-alerts` (low stock / expiring soon
  to staff with `inventory.manage`).

## Delivery dispatch

1. When an order is `PACKED` or `READY_FOR_PICKUP` without an active assignment (or a manager clicks
   *Auto-assign*), the API offers it
   to the nearest approved, **online** partner whose GPS fix is ≤ 10 min old, within
   `delivery.serviceRadiusKm`, carrying fewer than 2 active orders.
2. The partner app shows the offer with a countdown (`offerTimeoutSeconds`); `expire-delivery-offers`
   re-offers to the next partner on timeout or rejection. Managers can also assign manually.
3. Partner flow: *Accept → Arrived at store → Picked up (order `DISPATCHED`) → Start trip
   (`OUT_FOR_DELIVERY`) → Deliver*. Delivery requires the customer's **4-digit delivery OTP** (shown
   on their tracking page) and, for COD, confirmation of the cash collected.
4. While online, the partner app streams GPS (throttled: at most one fix per 10 s unless the
   partner moved 30 m or more); points are stored (`TrackingPoint`) and
   streamed to the customer's tracking page and the console's live map.
5. Earnings: base fee + per-km rate per delivery, plus a daily incentive once the target is reached;
   the console records settlements.

## Realtime

Socket.IO authenticates with a JWT from `GET /auth/socket-token` (12 h, audience `socket`) and
joins rooms: the user's own room, the partner room for delivery partners, the staff room for staff
with `orders.view`/`delivery.manage`, and per-order rooms on subscribe (owner, assigned partner or
staff only). Events are listed in [API.md](API.md#socketio-events). The console plays a chime on
new orders; the partner app vibrates/beeps on offers.

## Background jobs

`apps/api/src/jobs/scheduler.ts` runs in every API instance but each job takes a Postgres advisory
lock, so with several replicas only one executes a given tick.

| Job | Every | Purpose |
|---|---|---|
| `expire-unpaid-orders` | 1 min | Cancel online orders past their payment window, release stock |
| `expire-delivery-offers` | 15 s | Re-offer timed-out delivery offers |
| `expire-batches` | 10 min | Write off expired batches |
| `inventory-alerts` | 30 min | Low-stock and expiring-soon alerts |
| `cleanup` | 6 h | Purge expired/revoked sessions, OTPs older than a day, abandoned guest carts (30 days), tracking points older than 90 days |

## Notifications

`notify()` writes an in-app `Notification`, pushes it over Socket.IO and fans out to email, SMS and
FCM according to the user's preferences and configured providers. Every external attempt is logged
in `NotificationDelivery` with `SENT`, `FAILED` or `SKIPPED` (no provider) — visible in
*Console → Settings → Integrations*. Sends are fire-and-forget so a slow provider never blocks an
order; OTPs are the exception and fail loudly if they cannot be delivered.

## Front-end notes

* Design tokens are defined once in `packages/ui/src/styles/theme.css` (Tailwind v4 `@theme`), with a
  `.dark` variant toggled by `next-themes`; all three apps share them.
* Motion uses Framer Motion; CSS animations and transitions are neutralised under
  `prefers-reduced-motion: reduce`.
* Storefront i18n: English/Hindi dictionaries in `packages/shared/src/i18n`, product and category
  names have Hindi fields; the language choice is stored in the `nd_lang` cookie so server-rendered pages match.
* SEO: per-page metadata, Open Graph, canonical URLs, JSON-LD (`Bakery` + `SearchAction` site-wide,
  `Product` with offers/ratings and `BreadcrumbList` on product pages, `FAQPage`),
  `sitemap.xml` and `robots.txt` generated from live data.
