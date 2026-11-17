# API reference

Base URL: `/api/v1` (each Next.js app proxies it on its own origin; directly on the API it is
`http://localhost:4000/api/v1`). JSON in, JSON out. Source: `apps/api/src/modules/**/routes.ts`.

## Conventions

| Topic | Rule |
|---|---|
| App identity | Send `x-nds-app: web \| admin \| delivery`. It selects the session cookie (`nds_sid_web`, `nds_sid_admin`, `nds_sid_delivery`), so one browser can be signed in to all three apps independently. |
| CSRF | `GET /auth/csrf` sets the `nds_csrf` cookie and returns `csrfToken`; send it as `x-csrf-token` on every `POST/PUT/PATCH/DELETE`. `@naamdev/api-client` does this automatically. |
| Money | Integers in paise (`totalPaise: 110500` = ₹1,105.00). |
| Pagination | `?page=1&pageSize=20` → `{ items, meta: { page, pageSize, total, totalPages } }`. |
| Errors | `{ error: { code, message, details? } }`. Validation failures are 400 `VALIDATION_ERROR` with `details.fields` (field → message). Others: 401, 403, 404, 409, 429 (rate limit), 503 `SERVICE_UNAVAILABLE` (e.g. payments/SMS not configured). |
| Rate limits | Global 600/min per IP; login 30/10 min; OTP 8/10 min; writes 120/min; uploads 60/10 min. |
| Health | `GET /health` (outside `/api/v1`) → database status and which integrations are configured. |

## Customer & public

| Area | Endpoints |
|---|---|
| Auth | `GET /auth/csrf` · `POST /auth/otp/request` · `POST /auth/otp/verify` (returns a session, or `registrationRequired` + `registrationToken`) · `POST /auth/register` · `POST /auth/login` (email/phone + password) · `POST /auth/logout` · `GET /auth/me` · `GET /auth/socket-token` · `POST /auth/password/forgot` · `POST /auth/password/reset` · `POST /auth/password/change` · `POST /auth/verify/email/request\|confirm` · `POST /auth/verify/phone/request\|confirm` · `GET /auth/sessions` · `DELETE /auth/sessions/:id` |
| Catalogue | `GET /catalog/home` · `GET /catalog/categories` · `GET /catalog/categories/:slug` · `GET /catalog/products` (`q`, `category`, `collection`, `foodType`, `minPrice`/`maxPrice`, `inStock`, `onOffer`, `flag`, `sort`) · `GET /catalog/products/by-ids` · `GET /catalog/products/:slug` · `GET /catalog/search/suggest?q=` (typo-tolerant trigram search) · `GET /catalog/search/trending` · `GET /catalog/collections/:slug` · `GET /catalog/delivery-estimate?pincode=` |
| Public content | `GET /public/settings` · `GET /public/pages/:slug` · `GET /public/faqs` · `GET /public/coupons` · `GET /public/sitemap-data` |
| Cart (guest or signed in) | `GET /cart` · `POST /cart/items` · `PATCH /cart/items/:id` · `DELETE /cart/items/:id` · `DELETE /cart` · `POST /cart/coupon` · `DELETE /cart/coupon` |
| Checkout | `POST /checkout/quote` · `POST /checkout/place-order` (requires `idempotencyKey`; returns the order and, for online payment, a Razorpay session) |
| Orders | `GET /orders?status=active\|past\|all` · `GET /orders/:id` (with allowed actions) · `GET /orders/:id/tracking` · `GET /orders/:id/payment-session` · `POST /orders/:id/cancel` · `POST /orders/:id/reorder` · `POST /orders/:id/return` |
| Payments | `POST /payments/razorpay/verify` (signature **and** gateway status/amount checked server-side) · `POST /payments/razorpay/webhook` (raw body, `x-razorpay-signature`; configure in Razorpay) |
| Account | `PATCH /account/profile` · `PATCH /account/avatar` · `GET/POST /account/addresses` · `PATCH/DELETE /account/addresses/:id` · `GET /account/wishlist` · `POST/DELETE /account/wishlist/:productId` · `GET /account/recently-viewed` · `GET /account/notifications` · `POST /account/notifications/read` · `POST/DELETE /account/devices` (FCM tokens) · `GET /account/loyalty` · `GET /account/referrals` · `GET /account/coupons` · `POST/DELETE /account/deletion-request` |
| Reviews | `GET /reviews/mine` · `POST /reviews` (verified purchase only) · `DELETE /reviews/:id` |
| Support | `POST /support/contact` · `GET /support/tickets` · `POST /support/tickets` · `GET /support/tickets/:id` · `POST /support/tickets/:id/messages` |
| Uploads | `POST /uploads/return-image` · `POST /uploads/avatar` (multipart; type sniffed from file bytes, re-encoded) |

## Delivery partner (`x-nds-app: delivery`)

`POST /delivery/register` · `GET/PATCH /delivery/me` (vehicle, bank/UPI — encrypted at rest) ·
`POST /delivery/documents` · `POST /delivery/status` (online/offline) · `POST /delivery/location` ·
`GET /delivery/offers` · `GET /delivery/assignments/active` · `GET /delivery/assignments/history` ·
`GET /delivery/assignments/:id` · `POST /delivery/assignments/:id/accept|reject|arrived|pickup|start` ·
`POST /delivery/assignments/:id/deliver` (customer OTP; COD amount confirmation) · `GET /delivery/earnings`

## Console (`/admin/*`, staff only, every route permission-checked)

| Area | Endpoints (prefix `/admin`) | Permission |
|---|---|---|
| Dashboard & reports | `GET /dashboard` · `GET /reports/:type` (sales, orders, products, inventory, customers, coupons, delivery, gst; `?from&to`, `?format=csv` needs `reports.export`) | `dashboard.view`, `analytics.view`, `reports.export` |
| Orders | `GET /orders` · `GET /orders/:id` · `POST /orders/:id/status` · `POST /orders/:id/notes` · `POST /orders/:id/assign` · `POST /orders/:id/refunds` · `POST /orders/refunds/:refundId/sync` · `POST /orders/returns/:returnId/decision` | `orders.*`, `refunds.manage` |
| Payments | `GET /payments` · `GET /payments/refunds` · `GET /payments/returns` | `payments.view` |
| Catalogue | `GET/POST /catalog/products` · `GET/PUT /catalog/products/:id` · `PATCH /catalog/products/:id/flags` · `POST /catalog/products/:id/archive\|restore` · `GET/POST/PUT/DELETE /catalog/categories[/:id]` · `GET/POST/PUT/DELETE /catalog/collections[/:id]` | `products.*`, `categories.manage` |
| Inventory | `GET /inventory/stock` · `GET /inventory/variants/:variantId` · `PATCH /inventory/variants/:variantId/threshold` · `POST /inventory/batches` · `POST /inventory/adjust` · `GET /inventory/batches/expiring` · `GET /inventory/transactions` · `GET/POST /inventory/purchases` · `GET/POST/PUT /inventory/suppliers[/:id]` | `inventory.*`, `suppliers.manage` |
| Marketing & content | `/marketing/coupons` (CRUD, `PATCH …/active`, `GET …/:id/usage`) · `/marketing/banners` · `/marketing/home-sections` (+ `reorder`) · `/marketing/pages/:slug` · `/marketing/faqs` · `POST /marketing/notifications/broadcast` | `coupons.manage`, `content.manage`, `notifications.send` |
| People | `/people/customers` (+ `status`, `points`, `anonymize`) · `/people/staff` (+ `password`) · `/people/roles` · `/people/partners` (+ `live`, `status`, document review & secure file download, `settle`) · `/people/reviews` (+ `moderate`) · `/people/tickets` (+ messages, update) | `customers.*`, `staff.manage`, `roles.manage`, `partners.manage`, `reviews.moderate`, `support.*` |
| Uploads | `POST /uploads/image` (8 MB) · `POST /uploads/video` (50 MB) | `products.manage`, `content.manage` (images also `categories.manage`) |
| Settings & audit | `GET /settings` · `PUT /settings/:key` · `GET/PUT /store` · `/zones` (CRUD) · `GET /audit` · `GET /notification-logs` · `GET /me/notifications` · `POST /me/notifications/read` | `settings.manage`, `audit.view` |

## Socket.IO events

Connect to the API origin with `auth: { token }` from `GET /auth/socket-token`.

| Event | Direction | Payload / when |
|---|---|---|
| `order:subscribe` / `order:unsubscribe` | client → server | `{ orderId }` — join an order room (owner, assigned partner, or staff) |
| `order:status` | server → order room / user | status changed |
| `order:updated` | server → order room | order details changed (assignment, payment) |
| `tracking:location` | server → order room | partner GPS point while the order is on its way |
| `notification:new` | server → user | new in-app notification |
| `admin:order:new` / `admin:order:updated` | server → staff | console order board and new-order chime |
| `partner:location` | server → staff | live partner map |
| `delivery:offer` / `delivery:offer:withdrawn` | server → partner | dispatch offer with expiry / offer no longer available |
| `delivery:assignment:updated` | server → partner | assignment changed by the store |
