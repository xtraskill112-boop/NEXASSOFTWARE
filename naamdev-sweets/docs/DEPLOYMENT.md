# Deployment (Firebase)

Everything runs in the Firebase project **`naamdevseets`** (Blaze plan), region **asia-south1 (Mumbai)**.
A GitHub Actions workflow does the whole deploy; you only add three secrets and press *Run workflow*.

```
 Customer / Rider / Staff (browser or Android app)
        │ https://naamdevseets.web.app · naamdevseets-admin.web.app · naamdevseets-partner.web.app
        ▼
 Firebase Hosting ── /api/**, /static/** ──▶ Cloud Run: naamdev-api (Express) ──▶ Firestore · Firebase Auth · Storage · FCM
        │                                         ▲
        └── everything else ──▶ Cloud Run: naamdev-web / naamdev-admin / naamdev-partner (Next.js)
                                                  │
 Cloud Scheduler (every minute) ── POST /internal/jobs/tick (secret header)
 Browsers ── Firestore listeners on "live" documents (order status, rider position, offers, new orders)
```

## One-time setup

1. **Blaze plan** — Firebase console → ⚙ Usage and billing → keep the project on Blaze (Cloud Run,
   Cloud Scheduler and Secret Manager need billing). Set a budget alert while you're there.
2. **Service account key for GitHub** — Google Cloud console → IAM & Admin → Service accounts →
   *Create service account* (e.g. `github-deploy`) → role **Owner** → Keys → *Add key* → JSON.
   In GitHub: repository → Settings → Secrets and variables → Actions → *New repository secret*:
   - `FIREBASE_SERVICE_ACCOUNT` — paste the whole JSON file.
   - `NAAMDEV_ADMIN_EMAIL` — your email for the console (super admin). On the first deploy Firebase
     emails you a link to set your password (or use *Forgot password?* on the console login page).
   - Optional `NAAMDEV_ADMIN_PASSWORD` — set the password directly instead (8+ characters, letters and numbers).

   Owner is the simplest choice because the workflow enables APIs, creates the Firestore database,
   a runtime service account, secrets, Cloud Run services, Hosting sites and the scheduler. Delete the
   key (or downgrade the account) whenever you like; deploys need it again only when you re-run them.
3. **Run the deploy** — GitHub → Actions → **NAAMDEV deploy to Firebase** → *Run workflow*.
   Leave *load the sample sweets catalogue* ticked on the first run if you want a ready-made menu to
   edit; untick it to start with empty categories.

The run summary lists the live addresses. Set your password from the email, sign in to the console
with `NAAMDEV_ADMIN_EMAIL`, then:

- **Settings → Store location**: your real shop address, phone, hours and map position.
- **Settings → Delivery zones**: the PIN codes you deliver to (the sample seed adds Jaipur ones).
- **Settings → UPI payments**: the shop UPI ID and payee name (defaults: `paytmqr6rgzn2@ptys`, RAKESH TAILOR).
- **Staff & roles**: add your team (each gets an email + password login; give the people who can see
  the shop's Paytm/UPI account the *Confirm direct UPI payments* permission — Store owner, Store
  manager and Order manager roles have it).
- **Products**: edit prices, photos and stock, or archive the sample products.

### Demo logins for testing

Tick **Create demo logins** when running the workflow to try every role on the live shop:
`owner@`, `manager@`, `orders@`, `inventory@`, `packing@`, `support@` (console), `rider@` (partner app,
approved), `rider2@` (partner app, pending) and `customer@` (storefront) — all `@naamdevsweets.local`.
They use **your `NAAMDEV_ADMIN_PASSWORD` secret** (the development password in the code is public, so it
is never used on a live shop). When you've finished testing, run the workflow again with
**Remove demo logins** ticked: the logins are deleted; orders they placed stay for your records.

### If a step asks for a click in the Firebase console

Two Firebase features are normally switched on in the console. The workflow tries to do it for you and
stops with a clear message if it can't:

- *Authentication → Get started → Sign-in method → Email/Password → Enable.*
- *Storage → Get started → location asia-south1.*

Then re-run the workflow. Re-running is always safe: the seed never overwrites what you edited in the
console (existing categories, products, settings and role permissions are left alone).

### Site names

Hosting site IDs are global. If `naamdevseets-admin` or `naamdevseets-partner` is taken, set repository
**variables** `NAAMDEV_ADMIN_SITE` / `NAAMDEV_PARTNER_SITE` (and `NAAMDEV_CUSTOMER_URL` /
`NAAMDEV_PARTNER_URL` for the Android build) to names that are free, then re-run.
Custom domains (e.g. `naamdevsweets.com`) can be connected per site in Firebase console → Hosting →
*Add custom domain*; add the new addresses as `APP_URL_*` and rebuild the Android apps with them.

## Optional integrations

Add these as repository **secrets** (S) or **variables** (V) and re-run the deploy:

| Integration | Settings |
|---|---|
| Razorpay | S `RAZORPAY_KEY_ID`, S `RAZORPAY_KEY_SECRET`, S `RAZORPAY_WEBHOOK_SECRET`. Webhook URL in the Razorpay dashboard: `https://naamdevseets.web.app/api/v1/payments/razorpay/webhook` (events: payment.captured, payment.failed, refund.processed, refund.failed) |
| Order emails (SMTP) | V `SMTP_HOST`, V `SMTP_PORT`, V `SMTP_USER`, S `SMTP_PASS`, V `EMAIL_FROM` |
| Google Maps | V `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (restrict it to your sites' domains) |
| Web push | V `NEXT_PUBLIC_FIREBASE_VAPID_KEY` (Firebase console → Project settings → Cloud Messaging → Web Push certificates), and set `PUSH_ENABLED=true` on the `naamdev-api` service |

Sign-up verification and password-reset emails are sent by Firebase Authentication itself (customise
the templates under Authentication → Templates). No SMTP is needed for those.

## What the workflow creates

| Resource | Name |
|---|---|
| Firestore (native) | `(default)` in asia-south1, rules `firebase/firestore.rules`, indexes `firebase/firestore.indexes.json` |
| Storage rules | `firebase/storage.rules` (deny all — the API serves uploads) |
| Secret Manager | `naamdev-encryption-key` (partner bank details), `naamdev-jobs-secret` (scheduler), Razorpay/SMTP secrets when given |
| Runtime service account | `naamdev-run@…` with Firestore user, Firebase Auth admin, Storage object admin, Secret accessor, FCM admin |
| Artifact Registry | `naamdev` (Docker images, tagged with the commit) |
| Cloud Run | `naamdev-api` (port 4000), `naamdev-web`, `naamdev-admin`, `naamdev-partner` (port 3000); 0–4 instances each |
| Hosting | sites `naamdevseets`, `naamdevseets-admin`, `naamdevseets-partner` rewriting to Cloud Run |
| Cloud Scheduler | `naamdev-jobs`, every minute → expires unpaid orders and delivery offers, retires expired stock batches, stock alerts, clean-up |

## Costs (rough, small shop)

Cloud Run scales to zero and bills per request, Firestore/Hosting/Storage have free daily quotas, and the
scheduler is 1 job (3 free per billing account). Expect a few hundred rupees a month at low traffic;
the first request after a quiet period takes a few seconds while an instance starts. For instant
responses set `--min-instances 1` on `naamdev-api` and `naamdev-web` (roughly ₹1,000 a month each at the minimum size).

## Operations

- **Logs** — Google Cloud console → Cloud Run → service → Logs (the API logs JSON with request IDs).
- **Health** — `https://<api-url>/health` checks Firestore; the deploy smoke test calls each site.
- **Backups** — Firestore → *Disaster recovery*: enable point-in-time recovery and/or scheduled backups
  (`gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=14d`).
- **Rollback** — Cloud Run → service → Revisions → route traffic to the previous revision.
- **Rotate secrets** — add a new version in Secret Manager (`naamdev-jobs-secret` also needs the
  scheduler job header updated — re-running the workflow does that).
- **Background jobs** — the scheduler sends `POST /internal/jobs/tick` with the `x-jobs-secret` header;
  each job holds a lease in `jobRuns/{name}` so overlapping ticks never run it twice.

## Android apps

Run **NAAMDEV Android apps** in GitHub Actions after the first deploy. The APKs open
`https://naamdevseets.web.app` (customer) and `https://naamdevseets-partner.web.app` (partner) directly —
there is no address to enter. Details and Play Store signing: [mobile/android/README.md](../mobile/android/README.md).
