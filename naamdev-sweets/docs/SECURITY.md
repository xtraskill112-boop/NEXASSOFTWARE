# Security

## Authentication & sessions

* **Customers** sign in with a mobile OTP (6 digits, stored only as a SHA-256 hash, 10-minute
  expiry, 5 attempts, 30 s resend cool-down, 6 per hour, single use with an atomic consume) or with
  email/phone + password. New numbers finish sign-up with a short-lived registration token.
* **Passwords** are hashed with **argon2id** (`@node-rs/argon2`); minimum 8 characters with a letter
  and a digit. Changing or resetting a password revokes other sessions.
* **Sessions** are random 256-bit tokens; only their SHA-256 hash is stored (`Session`). Cookies are
  `HttpOnly`, `SameSite=Lax`, `Secure` in production (`COOKIE_SECURE=true`), and **separate per
  app** (`nds_sid_web`, `nds_sid_admin`, `nds_sid_delivery`), so a storefront session can never be
  used in the console. Users can list and revoke their sessions (*Account → Security*).
* **App gating**: the console only admits staff roles; the partner app only delivery partners;
  OTP sign-in to the console is refused.
* Socket.IO uses a separate signed JWT (audience `socket`) issued only to an authenticated session.

## CSRF, XSS, headers

* Double-submit CSRF: the `nds_csrf` cookie must match the `x-csrf-token` header on every state-
  changing request (constant-time compare). The Razorpay webhook is exempt and is authenticated by
  its HMAC signature instead.
* React escapes all output. CMS pages are Markdown rendered with raw HTML disabled; JSON-LD is
  serialised with `<` escaped. No user content is injected as HTML.
* Next.js apps send a Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy` and `Permissions-Policy`; the API uses Helmet with a deny-all CSP. Caddy adds
  HSTS (2 years, preload-ready).
* CORS allows only the three configured app origins, with credentials.

## Authorisation (RBAC)

* 29 permissions (`packages/shared/src/permissions.ts`) grouped into 9 system roles: Super admin,
  Store owner, Store manager, Order manager, Inventory manager, Packing staff, Support agent,
  Delivery partner, Customer. Super admins (`roles.manage`) can create custom roles
  from the console.
* Every console route is guarded server-side (`requirePermission` / `requireAnyPermission`); the UI
  hides what a role cannot do but is never the enforcement point. Example: packing staff can move
  orders through kitchen steps only; the delivery OTP is visible only with `orders.manage`.
* Customer data access is always scoped to `req.auth.user.id`; partners only see their own
  assignments; order rooms in Socket.IO check ownership before joining.

## Payments

* No card, UPI or bank data is collected or stored: Razorpay Checkout handles it.
* Totals are calculated on the server; the client cannot submit prices or payment status.
* An order is confirmed only after **both** a valid signature and a server-side fetch of the payment
  from Razorpay (status and order id), or a signed webhook. Late or duplicate payments are handled
  idempotently and refunded when the order can no longer be fulfilled.
* Idempotency keys + per-user advisory locks prevent duplicate orders; unique gateway ids and
  webhook event de-duplication prevent double processing.

## Abuse protection

Rate limits per IP: 600 requests/min overall, 30 logins/10 min, 8 OTP requests/10 min, 120 writes/
min, 60 uploads/10 min — plus per-number OTP limits above. `TRUST_PROXY` must match the number of
proxies in front of the API so limits use the real client IP (2 in the Docker setup: Caddy → Next.js).

## Uploads

* Size limits (images 8 MB, videos 50 MB), MIME type determined from file bytes (`file-type`), not
  the extension or header. Images are decoded and re-encoded with `sharp` (strips metadata, defeats
  polyglot files) and resized.
* Local files get random names; static serving denies dot-files. Partner KYC documents are stored
  in a private directory (never on the public path or a public bucket) and served only through an
  authorised endpoint for staff with `partners.manage`.

## Data protection

* Partner bank account numbers are encrypted at rest with AES-256-GCM (`ENCRYPTION_KEY`); APIs only
  ever return the last four digits.
* Customers can request account deletion from the app; staff can anonymise a customer (removes
  addresses, devices, sessions, wishlist, history; scrubs name/email/phone) while keeping order
  records required for tax.
* Logs (pino, JSON in production) redact cookies, authorization headers and any `password`, `otp`,
  `token` or `razorpay_signature` fields.
* The seed contains only fictional demo accounts and is disabled in production unless explicitly
  enabled; the first super admin password comes from `SEED_ADMIN_PASSWORD`.

## Audit trail

Staff actions that change data (orders, refunds, catalogue, prices, stock adjustments, coupons,
content, settings, roles, staff, partners, customer status) are written to `AuditLog` with actor,
entity id, a metadata summary of what changed, IP and user agent — viewable under *Console → Audit log*
(`audit.view`).

## Secrets

All secrets live in environment variables; `.env*` files are git-ignored. In production `JWT_SECRET` (≥ 32 chars)
and `ENCRYPTION_KEY` (64 hex chars) are required, and the API refuses to start with the example
values or with `OTP_DEV_ECHO=true`. Email/SMS default to `none` in production, never to the
log-only `console` provider.

## Reporting

Please report vulnerabilities privately to the store's security contact rather than opening a
public issue.
