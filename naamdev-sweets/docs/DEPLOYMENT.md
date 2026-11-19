# Deployment (free plans)

Everything runs on **free plans — no billing account, no card**:

| Part | Where | Free plan |
|---|---|---|
| Data, live updates | Cloud Firestore (Firebase project **`naamdevseets`**, Spark plan) | 1 GiB stored, 50,000 reads / 20,000 writes per day |
| Sign-in (email + password) | Firebase Authentication (Spark) | free |
| Storefront, console, partner app | Firebase Hosting (Spark), 3 sites of static files | 10 GB stored, 360 MB/day transfer |
| API (orders, payments, stock, uploads) | **Render** free web service (`naamdev-api`, Singapore) | 750 hours/month, 512 MB, sleeps after 15 min idle |

```
 Customer / Rider / Staff (browser or Android app)
      │ https://naamdevseets.web.app · naamdevseets-admin.web.app · naamdevseets-partner.web.app
      ▼
 Firebase Hosting (static pages) ──► the browser calls the API ──► Render: naamdev-api (Express) ──► Firestore · Firebase Auth
                                     and listens to Firestore live documents for real-time updates
 GitHub Actions "NAAMDEV keep-alive" ── pings the API every 10 minutes so it doesn't fall asleep
```

## One-time setup

1. **Firebase** — Authentication → *Get started* → enable **Email/Password**. (The workflow also tries.)
2. **Let GitHub deploy to Firebase without a key** — open
   [Cloud Shell](https://console.cloud.google.com/?cloudshell=true&project=naamdevseets), paste the contents of
   `scripts/setup-keyless-deploy.sh`, press Enter (click *Authorize* if asked). It allows only this repository.
3. **Render (free)** — sign up at https://dashboard.render.com/register with **GitHub**. Then *Account
   settings → API keys → Create API key*, and add it to GitHub (repository → Settings → Secrets and
   variables → Actions → *New repository secret*) as **`RENDER_API_KEY`**.
4. **Your console login** — GitHub secrets **`NAAMDEV_ADMIN_EMAIL`** (your email) and, optionally,
   **`NAAMDEV_ADMIN_PASSWORD`** (otherwise Firebase emails you a link to set the password).
5. **Deploy** — GitHub → Actions → **NAAMDEV deploy (free plans)** → *Run workflow*.

The workflow enables the free Firebase APIs, creates the Firestore database, turns on email sign-in,
creates the API server on Render (or updates it), seeds the data, builds the three apps as static files,
deploys them to Firebase Hosting with the security rules and indexes, and prints the live addresses.
The first Render build takes 5–15 minutes.

To check the live shop at any time, run **NAAMDEV live check** (Actions tab): it opens the storefront,
console and partner app in a real browser, checks the menu loads from the API without errors and that the
demo logins (if created) can sign in. It creates no data.

After it's live, sign in to the console and set your shop address (Settings → Store location), delivery
PIN codes, UPI ID (Settings → UPI payments, default `paytmqr6rgzn2@ptys`) and staff logins.

### Demo logins for testing

Tick **Create demo logins** when running the workflow: `owner@`, `manager@`, `orders@`, `inventory@`,
`packing@`, `support@` (console), `rider@` / `rider2@` (partner app) and `customer@` (storefront), all
`@naamdevsweets.local`, using **your `NAAMDEV_ADMIN_PASSWORD`** (the development demo password is public
in the code and is never used on a live shop). Run again with **Remove demo logins** ticked when done.

### Keep-alive

Render's free server sleeps after 15 minutes without visitors; the next visit then waits about a minute.
The **NAAMDEV keep-alive** workflow pings it every 10 minutes (one always-on service fits in the 750 free
hours a month). Scheduled workflows only run from the `main` branch, and GitHub pauses them after 60 days
without repository activity — re-enable it under Actions if that happens.

## Free-plan limits to know

* **Firestore: 50,000 reads and 20,000 writes per day.** The API is tuned for this (catalogue cached in
  memory and refreshed incrementally, background jobs once a minute without lease writes). A small shop
  stays well inside; if the quota runs out, the shop stops working until midnight Pacific time.
* **No Cloud Storage on Firebase's free plan**, so uploaded photos are re-encoded and stored in Firestore
  (under 900 KB each) and served by the API from `/media/…`; private rider documents likewise.
  **Product videos can't be uploaded** on the free plan.
* **Render free server**: 512 MB memory and a small shared CPU; it sleeps when idle (the keep-alive
  prevents that). Use a paid plan for heavy traffic.
* **Sitemap** is built at deploy time: products added later appear in it after the next deploy.

## Optional integrations

Add as repository **secrets** (S) or **variables** (V) and re-run the deploy:

| Integration | Settings |
|---|---|
| Razorpay | S `RAZORPAY_KEY_ID`, S `RAZORPAY_KEY_SECRET`, S `RAZORPAY_WEBHOOK_SECRET`. Webhook URL: `<API address>/api/v1/payments/razorpay/webhook` (shown in the deploy summary) |
| Order emails (SMTP) | V `SMTP_HOST`, V `SMTP_PORT`, V `SMTP_USER`, S `SMTP_PASS`, V `EMAIL_FROM` |
| Google Maps | V `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (restrict it to your sites' domains) |

Sign-up verification and password-reset emails are sent by Firebase Authentication (free).

## What the workflow creates

| Resource | Name |
|---|---|
| Firestore (native) | `(default)` in asia-south1, rules `firebase/firestore.rules`, indexes `firebase/firestore.indexes.json` |
| Firebase Hosting | sites `naamdevseets`, `naamdevseets-admin`, `naamdevseets-partner` with the rewrites/headers in `firebase.json` (regenerate with `node scripts/hosting-config.mjs` after adding a dynamic page) |
| Service account | `naamdev-run@…` (Firestore user, Firebase Auth admin); its key is rotated on every deploy and stored only as a Render environment variable |
| Render | web service `naamdev-api` (Docker, `infra/docker/api.Dockerfile`, free plan, health check `/healthz`); environment variables include `ENCRYPTION_KEY` and `JOBS_SECRET`, generated once and kept across deploys |

## Operations

* **Logs** — Render dashboard → `naamdev-api` → Logs.
* **Health** — `<API address>/health` (checks Firestore) and `/healthz` (no database read).
* **Usage** — Firebase console → Firestore → Usage, to watch the daily reads/writes.
* **Backups** — export Firestore from the console when needed (scheduled backups need the paid plan).
* **Rollback** — Render → Events → *Rollback* to a previous deploy; Firebase Hosting → release history.

## Moving to paid plans later

Nothing is locked in: with Firebase's Blaze plan you can set `STORAGE_DRIVER=firebase` on the API for
Cloud Storage uploads (videos), and run the API anywhere that runs a Docker image.

## Android apps

Run **NAAMDEV Android apps** after the first deploy. The APKs open `https://naamdevseets.web.app`
(customer), `https://naamdevseets-partner.web.app` (partner) and `https://naamdevseets-admin.web.app`
(admin) directly — download them from the repository's **Releases** page; the partner app's background
location goes to the API address handed over by the partner site.
