# API reference

Base URL: `/api/v1` on each site (Firebase Hosting forwards it to the `naamdev-api` Cloud Run service;
locally the Next.js dev servers proxy it to `http://localhost:4000`). JSON in, JSON out.
Source: `apps/api/src/modules/**/routes.ts`.

## Conventions

| Topic | Rule |
|---|---|
| Authentication | Sign in with Firebase Authentication (email + password) in the browser, then send the Firebase ID token as `Authorization: Bearer <token>` (`@naamdev/api-client` does this automatically and refreshes tokens). No cookies, no CSRF token. |
| App identity | Send `x-nds-app: web \| admin \| delivery`. The console only accepts staff and the partner app only delivery partners. |
| Guest cart | The API returns `x-cart-token` on the first add; send it back as `x-cart-token`. An empty value means "forget it" (merged into the account). |
| Money | Integers in paise (`totalPaise: 110500` = ₹1,105.00). |
| Pagination | `?page=1&pageSize=20` → `{ items, meta: { page, pageSize, total, totalPages } }`. |
| Errors | `{ error: { code, message, details? } }`. Validation failures are 400 `VALIDATION_ERROR` with `details.fields` (field → message). Others: 401, 403, 404, 409, 429 (rate limit), 503 `SERVICE_UNAVAILABLE`. |
| Rate limits | Global 600/min per IP; auth 30/10 min; writes 120/min; uploads 60/10 min (per Cloud Run instance). |
| Health | `GET /health` (outside `/api/v1`) → Firestore status and which integrations are configured. |
| Jobs | `POST /internal/jobs/tick` with header `x-jobs-secret` (Cloud Scheduler). 404 without the secret. |

## Customer & public

| Area | Endpoints |
|---|---|
| Auth | `GET /auth/me` (profile, or `needsProfile` for a new Firebase account) · `POST /auth/session` (after sign-in: checks app access, merges the guest cart) · `POST /auth/register` (completes the storefront profile: name, optional phone, referral code) · `POST /auth/logout` · `POST /auth/sign-out-everywhere`. Sign-up, password reset and email change are Firebase Auth calls from the browser. |
| Catalogue | `GET /catalog/home` · `GET /catalog/categories` · `GET /catalog/categories/:slug` · `GET /catalog/products` (`q`, `category`, `collection`, `foodType`, `minPrice`/`maxPrice`, `inStock`, `onOffer`, `flag`, `sort`) · `GET /catalog/products/by-ids` · `GET /catalog/products/:slug` · `GET /catalog/search/suggest?q=` (typo-tolerant) · `GET /catalog/search/trending` · `GET /catalog/collections/:slug` · `GET /catalog/delivery-estimate?pincode=` |
| Public content | `GET /public/settings` · `GET /public/pages/:slug` · `GET /public/faqs` · `GET /public/coupons` · `GET /public/sitemap-data` |
| Cart (guest or signed in) | `GET /cart` · `POST /cart/items` · `PATCH /cart/items/:id` · `DELETE /cart/items/:id` · `DELETE /cart` · `POST /cart/coupon` · `DELETE /cart/coupon` |
| Checkout | `POST /checkout/quote` (includes `paymentOptions.online/upi/cod`) · `POST /checkout/place-order` (`paymentMethod`: `ONLINE` \| `UPI` \| `COD`, requires `idempotencyKey`; returns the order plus a Razorpay session or a UPI session) |
| Orders | `GET /orders?status=active\|past\|all` · `GET /orders/:id` (with allowed actions and, for UPI, the payment session) · `GET /orders/:id/tracking` · `GET /orders/:id/payment-session` · `POST /orders/:id/upi-reference` (`{ utr }`, 12 digits — puts the payment into *verifying*; never confirms by itself) · `POST /orders/:id/cancel` · `POST /orders/:id/reorder` · `POST /orders/:id/return` |
| Payments | `POST /payments/razorpay/verify` (signature **and** gateway status/amount checked server-side) · `POST /payments/razorpay/webhook` (raw body, `x-razorpay-signature`) |
| Account | `PATCH /account/profile` · `PATCH /account/phone` · `PATCH /account/avatar` · `GET/POST /account/addresses` · `PATCH/DELETE /account/addresses/:id` · `GET /account/wishlist` · `POST/DELETE /account/wishlist/:productId` · `GET /account/recently-viewed` · `GET /account/notifications` · `POST /account/notifications/read` · `POST/DELETE /account/devices` (FCM tokens) · `GET /account/loyalty` · `GET /account/referrals` · `GET /account/coupons` · `POST/DELETE /account/deletion-request` |
| Reviews | `GET /reviews/mine` · `POST /reviews` (verified purchase only) · `DELETE /reviews/:id` |
| Support | `POST /support/contact` · `GET /support/tickets` · `POST /support/tickets` · `GET /support/tickets/:id` · `POST /support/tickets/:id/messages` |
| Uploads | `POST /uploads/return-image` · `POST /uploads/avatar` (multipart; type sniffed from file bytes, re-encoded, stored in Firebase Storage) |

## Delivery partner (`x-nds-app: delivery`)

`POST /delivery/register` (after Firebase sign-up: name, phone, city, vehicle) · `GET/PATCH /delivery/me` (vehicle, bank/UPI — encrypted at rest) ·
`POST /delivery/documents` · `POST /delivery/status` (online/offline) · `POST /delivery/location` ·
`GET /delivery/offers` · `GET /delivery/assignments/active` · `GET /delivery/assignments/history` ·
`GET /delivery/assignments/:id` · `POST /delivery/assignments/:id/accept|reject|arrived|pickup|start` ·
`POST /delivery/assignments/:id/deliver` (customer OTP; COD amount confirmation) · `GET /delivery/earnings`

## Console (`/admin/*`, staff only, every route permission-checked)

| Area | Endpoints (prefix `/admin`) | Permission |
|---|---|---|
| Dashboard & reports | `GET /dashboard` · `GET /reports/:type` (sales, orders, products, inventory, customers, coupons, delivery, gst; `?from&to`, `?format=csv` needs `reports.export`) | `dashboard.view`, `analytics.view`, `reports.export` |
| Orders | `GET /orders` (`payment`, `paymentStatus` filters) · `GET /orders/:id` · `POST /orders/:id/status` · `POST /orders/:id/notes` · `POST /orders/:id/assign` · `POST /orders/:id/refunds` · `POST /orders/refunds/:refundId/sync` · `POST /orders/refunds/:refundId/complete` (record a hand-sent refund's reference) · `POST /orders/returns/:returnId/decision` | `orders.*`, `refunds.manage` |
| Direct UPI | `GET /orders/upi/pending` (payments waiting for a check) · `POST /orders/:id/upi/verify` (`{ decision: "RECEIVED" \| "NOT_FOUND", note? }`) | `payments.verify` |
| Payments | `GET /payments` · `GET /payments/refunds` · `GET /payments/returns` | `payments.view` |
| Catalogue | `GET/POST /catalog/products` · `GET/PUT /catalog/products/:id` · `PATCH /catalog/products/:id/flags` · `POST /catalog/products/:id/archive\|restore` · `GET/POST/PUT/DELETE /catalog/categories[/:id]` · `GET/POST/PUT/DELETE /catalog/collections[/:id]` | `products.*`, `categories.manage` |
| Inventory | `GET /inventory/stock` · `GET /inventory/variants/:variantId` · `PATCH /inventory/variants/:variantId/threshold` · `POST /inventory/batches` · `POST /inventory/adjust` · `GET /inventory/batches/expiring` · `GET /inventory/transactions` · `GET/POST /inventory/purchases` · `GET/POST/PUT /inventory/suppliers[/:id]` | `inventory.*`, `suppliers.manage` |
| Marketing & content | `/marketing/coupons` (CRUD, `PATCH …/active`, `GET …/:id/usage`) · `/marketing/banners` · `/marketing/home-sections` (+ `reorder`) · `/marketing/pages/:slug` · `/marketing/faqs` · `POST /marketing/notifications/broadcast` | `coupons.manage`, `content.manage`, `notifications.send` |
| People | `/people/customers` (+ `status`, `points`, `anonymize`) · `/people/staff` (creates the Firebase login; + `password`) · `/people/roles` · `/people/partners` (+ `live`, `status`, document review & secure file download, `settle`) · `/people/reviews` (+ `moderate`) · `/people/tickets` (+ messages, update) | `customers.*`, `staff.manage`, `roles.manage`, `partners.manage`, `reviews.moderate`, `support.*` |
| Uploads | `POST /uploads/image` (8 MB) · `POST /uploads/video` (50 MB) | `products.manage`, `content.manage` (images also `categories.manage`) |
| Settings & audit | `GET /settings` · `PUT /settings/:key` (`checkout`, `upi`, `delivery`, `loyalty`, `storeProfile`, `returns`, `announcement`, `social`, `notifications`) · `GET/PUT /store` · `/zones` (CRUD) · `GET /audit` · `GET /notification-logs` · `GET /me/notifications` · `POST /me/notifications/read` | `settings.manage`, `audit.view` |

## Live documents (Firestore)

Real-time updates are small Firestore documents written by the API; clients listen with the Firebase
SDK (`watchLive` in `@naamdev/api-client/firebase`) and re-fetch when `version` changes. Clients can't
write them; security rules restrict who can read each one.

| Document | Readers | Written when |
|---|---|---|
| `liveOrders/{orderId}` | the customer, the assigned rider, staff | order created, status change, assignment, UPI payment submitted/checked; `location` with the rider's position during delivery |
| `liveUsers/{uid}` | that user | a new in-app notification (`last` holds its title and body) |
| `livePartners/{uid}` | that rider | `offer`, `withdrawn`, `assignment` |
| `liveStaff/orders` | staff | `new-order` (console chime) and `order-updated` |
