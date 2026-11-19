# Security

## Authentication

* **Firebase Authentication, email + password only.** Sign-up, sign-in, email verification,
  password reset ("Forgot password" emails a Firebase reset link) and email change (confirmation link
  to the new address, after re-entering the password) all run through the Firebase SDK. NAAMDEV never
  sees or stores passwords.
* The browser sends the short-lived Firebase **ID token** as `Authorization: Bearer …`. The API
  verifies it with the Firebase Admin SDK on every request, then loads the NAAMDEV profile and role.
  A Firebase account without a profile can only complete its profile — nothing else.
* **App gating**: the console only admits active staff; the partner app only delivery partners;
  a storefront account can't be turned into a partner account.
* **Sign out everywhere** and staff password resets revoke Firebase refresh tokens and set
  `tokensValidAfter`, so ID tokens issued earlier are rejected even before they expire. Suspending a
  customer or deactivating staff also disables the Firebase account.
* Roles are mirrored into Firebase custom claims (`role`, `staff`, `partner`) for the security rules;
  the client can never choose its own role.

## No cookies, no CSRF surface

Authentication uses bearer tokens, not cookies, so cross-site requests can't act as the user. The apps
set no cookies (the language choice is kept in local storage). Guest carts use a random token in a request header
(`x-cart-token`), stored in the browser's local storage and merged into the account at sign-in.

## Firestore & Storage security rules

* All business data is read and written by the API with the Admin SDK. The rules
  (`firebase/firestore.rules`) **deny every client read and write** except the four kinds of "live"
  signal documents, each readable only by its audience (the order's customer / assigned rider / staff;
  a user's own notifications; a rider's own offers; staff-only order feed). Clients can never write.
* Uploaded files are written only by the API. On the free plan photos live in the server-only `media`
  collection and are served by the API at `/media/<id>.webp`; private partner documents (KYC) live in
  `privateMedia` and are only streamed by the API to staff with `partners.manage`. With Cloud Storage
  (paid plan) the Storage rules deny all client access and public images use download-token URLs.

## XSS and headers

* React escapes all output. CMS pages are Markdown with raw HTML disabled; JSON-LD is serialised with
  `<` escaped. The UPI QR code is an SVG generated on the server from the shop's own UPI link.
* Firebase Hosting sends a Content-Security-Policy for the three apps (allowing only the app itself, the
  API, Firebase, Razorpay and Google Maps — see `firebase.json`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` and HSTS;
  the API uses Helmet with a deny-all CSP. Firebase Hosting serves everything over HTTPS.
* CORS allows only the three app origins (plus the Android apps, which load those same sites).

## Authorisation (RBAC)

* Permissions in `packages/shared/src/permissions.ts` are grouped into system roles: Super admin,
  Store owner, Store manager, Order manager, Inventory manager, Packing staff, Support agent,
  Delivery partner, Customer. Super admins (`roles.manage`) can create custom roles in the console.
  Re-running the seed never removes permissions an owner took away.
* Every console route is guarded server-side (`requirePermission` / `requireAnyPermission`); the UI
  hides what a role cannot do but is never the enforcement point.
* Customer data access is always scoped to the signed-in user; riders see only their own assignments.

## Payments

* No card or bank data is collected or stored. Razorpay Checkout handles card/UPI/netbanking entry.
* Totals are calculated on the server; the client cannot submit prices or payment status.
* **Razorpay**: an order is confirmed only after a valid signature **and** a server-side fetch of the
  payment (status, order id, amount), or a signed webhook.
* **Direct UPI (to the shop's UPI ID)**: there is no gateway, so nothing proves payment automatically.
  The customer's UPI reference number is treated only as a hint: the order stays on hold until staff
  with `payments.verify` confirm the money in the shop's UPI account. Each reference can be claimed by
  one order only; confirmations are audit-logged with the staff member's name.
* Refunds for UPI and cash orders are recorded as *pending* until staff enter the transfer reference.
* Idempotency keys prevent duplicate orders; transactional status guards and webhook event
  de-duplication prevent double processing.

## Abuse protection

Rate limits per IP and server instance: 600 requests/min overall, 30 auth calls/10 min,
120 writes/min, 60 uploads/10 min. Firebase Authentication applies its own sign-in throttling.

## Uploads

* Size limits (images 8 MB, videos 50 MB); type detected from the file bytes, not the name. Images are
  decoded and re-encoded with `sharp` (strips metadata, defeats polyglot files) and resized.
* Files get random IDs (Firestore on the free plan, served from `/media/…`; Cloud Storage on the paid plan). Avatars must point at our own uploads; private rider documents have no public address.

## Data protection

* Partner bank account numbers are encrypted at rest with AES-256-GCM (`ENCRYPTION_KEY`, a server
  environment variable); APIs only return the last four digits.
* Customers can request account deletion; staff anonymise the account (addresses, devices, wishlist,
  history removed; name/email/phone scrubbed; Firebase login deleted) while keeping order records
  required for tax.
* Logs redact authorization headers and any `password`, `token` or `razorpay_signature` fields.
* The seed creates fictional demo accounts only outside production; the first super admin comes from
  the `NAAMDEV_ADMIN_EMAIL` / `NAAMDEV_ADMIN_PASSWORD` deploy secrets.

## Audit trail

Staff actions that change data (orders, payments verified, refunds, catalogue, prices, stock, coupons,
content, settings, roles, staff, partners, customer status) are written to `auditLogs` with actor, entity,
a summary, IP and user agent — viewable under *Console → Audit log* (`audit.view`).

## Secrets

Server secrets (`ENCRYPTION_KEY`, `JOBS_SECRET`, Razorpay, SMTP, and the API's Firebase service-account
key, rotated on every deploy) are environment variables on the Render service — never in the code or the
static apps. GitHub deploys to Firebase keylessly (Workload Identity Federation, limited to this
repository). The API refuses to start in production with the example encryption key or
without a jobs secret. The Firebase *web* config in the apps is public by design — access is enforced by
Firebase Auth and the security rules. The deploy service-account key lives only in GitHub secrets.

## Reporting

Please report vulnerabilities privately to the store's security contact rather than opening a public issue.
