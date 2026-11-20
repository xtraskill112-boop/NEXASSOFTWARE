# Integrations

Server credentials are **environment variables on the Render API service**, set by the deploy
workflow from GitHub repository secrets and variables (see [DEPLOYMENT.md](DEPLOYMENT.md#optional-integrations));
locally they live in `apps/api/.env`. None are stored in Firestore or editable from the console, and only
values that are public by design (`NEXT_PUBLIC_*`, the Firebase web config, the Razorpay *key id*) ever
reach a browser. *Console → Settings → Integrations* shows what the running server detected.

Status: the code paths below are covered by the automated tests against the Firebase emulators and a
local Razorpay mock. **None has been tested against the live `naamdevseets` project or a real provider
from this repository yet** — run each checklist after the first deploy.

## Firebase (required)

Firestore, Authentication (email/password) and Hosting are set up by the deploy workflow (free Spark plan);
the API runs on Render's free plan. The web config in `packages/api-client/src/firebase.ts` is the `naamdevseets`
web app's public config; override it with `NEXT_PUBLIC_FIREBASE_*` build variables if you move projects.

Checklist after deploy: sign up on the storefront → verification email arrives; *Forgot password* →
reset email arrives and the new password works; sign in to the console with `NAAMDEV_ADMIN_EMAIL`;
upload a product photo; place a COD order and watch the console's new-order chime.

Customise the sign-in emails (sender name, wording, Hindi) in Firebase console → Authentication →
Templates.

## UPI — direct to the shop's UPI ID (built in)

*Console → Settings → UPI payments*: UPI ID (default `paytmqr6rgzn2@ptys`), payee name (default
RAKESH TAILOR), note (`ORDER #{ORDER_NUMBER}`) and the time a customer has to pay (30 minutes).

At checkout the customer taps **Proceed to pay** and NAAMDEV's own payment sheet opens (shop name and
total at the top; options **UPI** — recommended — and **Cash on Delivery**, plus cards/netbanking only
when Razorpay keys are set). Choosing UPI places the order and shows a compact UPI step in the same
sheet: pay button (phone) or QR code (computer), the shop's UPI ID and payee name with a copy button,
and the reference-number box. The sheet is branded NAAMDEV SWEETS on purpose — it never shows another
company's name or logo, because the money goes straight to the shop's UPI ID.

The storefront builds the standard UPI link for each order, e.g.
`upi://pay?pa=paytmqr6rgzn2%40ptys&pn=RAKESH%20TAILOR&am=450.50&cu=INR&tn=ORDER%20%23ND261119-0042` —
the amount is always the server-calculated order total. On phones the button opens the customer's
UPI app (the Android app hands the link to installed UPI apps); on computers a QR code is shown.

**No UPI app or bank tells the server that a payment arrived**, so confirmation is manual and the order
waits: after paying, the customer enters the 12-digit UPI reference (UTR); staff with *Confirm direct
UPI payments* find that payment in the shop's account (e.g. Paytm for Business → payment history) and
click **Payment received** (the order goes to the kitchen) or **Not found** (the customer is asked to
re-check or pay again). The console dashboard lists every payment waiting to be checked. Refunds for
UPI orders are sent back by staff and recorded with the transfer reference.

Want automatic confirmation instead? Use Razorpay (below), which can also accept UPI.

Checklist: pay a small test order from a real UPI app → the amount and note are pre-filled → enter the
UTR → find it in Paytm for Business → *Payment received* → customer sees *Paid*.

## Razorpay (optional online payments)

1. Razorpay dashboard → *Account & Settings → API Keys* (**Test mode** first).
2. GitHub secrets `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`; re-run the deploy.
3. *Webhooks* → URL `<API address>/api/v1/payments/razorpay/webhook` (the Render address shown in the
   deploy summary), a strong secret →
   GitHub secret `RAZORPAY_WEBHOOK_SECRET`, events **payment.captured, payment.failed, order.paid,
   refund.processed, refund.failed**.

How it works: `place-order` computes the total on the server, reserves stock and creates a Razorpay
order for exactly that amount; Razorpay Checkout collects card/UPI details (never our servers);
`/payments/razorpay/verify` checks the HMAC signature and fetches the payment from Razorpay before
confirming; the webhook (HMAC verified, de-duplicated) is the safety net; late payments for cancelled
orders are refunded automatically.

Checklist (test mode): successful payment → *Confirmed*; failed payment → stays *Pending* with retry;
close the tab after paying → webhook confirms; full and partial refunds; replayed webhook ignored.

## Order emails — SMTP (optional)

Repository variables `SMTP_HOST`, `SMTP_PORT` (587 STARTTLS), `SMTP_USER`, `EMAIL_FROM` and secret
`SMTP_PASS`. Works with Amazon SES, SendGrid, Zoho, Google Workspace relay, etc. Configure SPF, DKIM and
DMARC. Used for order confirmations/status updates and staff alerts. Sign-in emails don't need it.

## SMS (optional)

Order-update SMS through MSG91 (`SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_FLOW_TEMPLATE_ID` — a DLT
registered Flow template with a `message` variable) or Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_FROM`), set on the `naamdev-api` Render service. Sign-in never uses SMS.

## Push notifications — Firebase Cloud Messaging (optional)

1. Firebase console → Project settings → Cloud Messaging → *Web Push certificates* → generate →
   repository variable `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.
2. Set `PUSH_ENABLED=true` on the `naamdev-api` Render service (it sends with the API's service
   account; no key file needed). Re-run the deploy.

Customers opt in from *Account → Notifications*. The console and partner app get live in-app alerts
through Firestore listeners while open.

## Google Maps (optional)

A browser key restricted to your sites with **Maps JavaScript API** and **Geocoding API** → repository
variable `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. It enables the draggable address pin and the live tracking
map. Distances for fees, serviceability and dispatch are computed on the server, independent of Google.

## Notification delivery log

Every email/SMS/push attempt is recorded (`notificationDeliveries`) with provider and result — `SENT`,
`FAILED` (with the provider's error) or `SKIPPED` (not configured or opted out) — under
*Console → Settings → Integrations*.
