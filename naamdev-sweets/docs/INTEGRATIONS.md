# Integrations

All credentials are **server environment variables** (`apps/api/.env` locally, `.env` for Docker
Compose). None are stored in the database or editable from the console, and only the values that
are public by design (`NEXT_PUBLIC_*`, the Razorpay *key id*) ever reach a browser. After changing
them restart the API; *Console → Settings → Integrations* shows what the running server detected.

Status today: **none of these services has been connected or tested against the real provider in
this repository.** Razorpay is exercised end-to-end against a local mock that implements the same
REST endpoints and signatures; the other providers are verified only up to "not configured →
behaves honestly". Before launch, run each checklist below in the provider's test mode.

## Razorpay (online payments)

1. In the Razorpay dashboard create API keys (**Test mode** first): *Account & Settings → API Keys*.
2. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
3. Add a webhook: *Account & Settings → Webhooks →* URL
   `https://<API_DOMAIN>/api/v1/payments/razorpay/webhook`, a strong secret →
   `RAZORPAY_WEBHOOK_SECRET`, events **payment.captured, payment.failed, order.paid,
   refund.processed, refund.failed**.
4. Nothing to configure for capture: orders are created with `payment_capture: 1`, so Razorpay
   captures successful payments automatically.

How it works:

* `place-order` computes the total on the server, reserves stock and creates a Razorpay **order**
  for exactly that amount. The browser opens Razorpay Checkout with the order id; card/UPI details
  go straight to Razorpay and never touch our servers.
* `POST /payments/razorpay/verify` checks the HMAC signature, then **fetches the payment from
  Razorpay** and requires matching order id and a `captured`/`authorized` status before confirming.
* The webhook (raw body, HMAC verified, de-duplicated by event id) is the safety net when the
  customer closes the tab after paying. Processing failures return 500 so Razorpay retries.
* Payment after the reservation expired or the order was cancelled → automatic full refund.
* Refunds from the console call the Razorpay Refunds API; `refund.processed`/`failed` webhooks (or
  *Sync* in the console) settle them. COD refunds are recorded as manual (UPI/bank transfer).

Test checklist (test mode): successful UPI/card payment → order *Confirmed*; failed payment →
order stays *Pending* with retry; close the tab after paying → webhook confirms it; full and
partial refund from the console; replay a webhook from the dashboard → ignored as duplicate.

## SMS / OTP — MSG91 (recommended in India) or Twilio

Indian regulations (TRAI DLT) require a registered sender id and registered templates.

* **MSG91**: `SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_OTP_TEMPLATE_ID` (an OTP template with
  an `##OTP##` variable, used for every login/verification code) and `MSG91_FLOW_TEMPLATE_ID`
  (a Flow template with a `message` variable, for order updates). Without the flow template,
  transactional SMS are recorded as *skipped*; OTPs still work.
* **Twilio**: `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`.
* **console** (development only): messages are written to the API log.

If the provider is missing or rejects the message, the OTP request fails with *"We couldn't send
an OTP…"* (HTTP 503) instead of pretending it was sent. Customers with a password can still sign in.

## Email — SMTP

`EMAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT` (587 STARTTLS or 465 with `SMTP_SECURE=true`),
`SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`. Works with Amazon SES, SendGrid, Zoho, Google Workspace
relay, etc. Configure SPF, DKIM and DMARC for the sending domain. Used for order confirmations and
status updates, password reset and email verification codes, staff alerts (*Alert emails* in
Console → Settings → Alerts).

## Push notifications — Firebase Cloud Messaging

1. Create a Firebase project → add a **Web app**; copy its config to the storefront build variables
   `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`,
   `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`.
2. *Project settings → Cloud Messaging → Web Push certificates* → generate a key pair →
   `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.
3. *Project settings → Service accounts* → generate a private key; base64-encode the JSON
   (`base64 -w0 service-account.json`) → `FIREBASE_SERVICE_ACCOUNT_BASE64` on the API.

Customers opt in from *Account → Notifications*; tokens are stored per device and removed when FCM
reports them invalid. Push is implemented on the storefront; the console and partner app use
realtime Socket.IO alerts while open.

## Google Maps (optional)

Create a browser key restricted by HTTP referrer to your domains with **Maps JavaScript API** and
**Geocoding API** enabled → `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (storefront and console builds).
It enables the draggable address pin, "use my current location" and the live tracking map. Without
it, addresses are entered by form (with an optional GPS pin) and tracking shows a schematic route.

Distances for delivery fees, serviceability and partner dispatch are computed on the server with
the haversine formula from stored coordinates, so they do not depend on Google.

## Cloudinary (optional media storage)

`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, optional
`CLOUDINARY_FOLDER`. Without it uploads are stored in `UPLOAD_DIR` and served by the API from
`/uploads` (keep that directory on a persistent volume and back it up). Partner KYC documents are
always stored privately and are only downloadable by staff with `partners.manage`.

## Notification delivery log

Every email/SMS/push attempt is recorded (`NotificationDelivery`) with the provider and result —
`SENT`, `FAILED` (with the provider's error) or `SKIPPED` (provider not configured or customer
opted out). Review it under *Console → Settings → Integrations*.
