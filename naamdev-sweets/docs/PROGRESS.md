# Progress checklist

Status of every area in the original brief. ✅ built and covered by automated tests ·
☑️ built, exercised manually / by type checks only · ⏳ needs your credentials or content ·
➖ not built (see *Known limitations*).

## Customer storefront (`apps/web`)

- ✅ Home feed configurable from the console (hero banners, categories, bestsellers, collections, offers, announcement bar)
- ✅ Full menu on the home page: every product grouped by category, with a sticky category bar to jump between sections (a "Full menu" home section — the owner can move or hide it in Content → Home page)
- ✅ Design system: Martel (headings) + Mukta (text) with matching Devanagari, flat brand colours, small radii, borders instead of shadows, no gradients/glass/float effects — shared by the storefront, console and partner app (`packages/ui/src/styles/theme.css`)
- ✅ Categories, category pages with filters (veg/egg, price, in stock, offers) and sorting
- ✅ Typo-tolerant search with suggestions, trending searches, ingredient/category matching
- ✅ Product page: variants (weight/pack) with server prices, MRP savings, stock, ingredients, shelf life, allergens, reviews, JSON-LD
- ✅ Cart (guest + signed-in with merge), save for later, coupon apply/remove with clear reasons
- ✅ Checkout: addresses (form + optional GPS pin), delivery estimate/serviceability by PIN code, coupons, reward points, COD
- ✅ Direct UPI payment to the shop's UPI ID (default `paytmqr6rgzn2@ptys`): UPI-app button on phones, QR code on computers, exact amount and order number pre-filled, reference submission, staff confirmation before the order is accepted, live status update
- ⏳ Online payment via Razorpay Checkout (UPI, cards, netbanking, wallets) — code complete and API-tested with a mock; needs keys
- ✅ Order placed page, live tracking (status timeline, partner location, delivery OTP), cancel, reorder, returns with photos, invoice
- ✅ Email + password sign-up/login with Firebase Authentication, email verification, forgot password (reset email), change password/email, sign out everywhere
- ✅ Account: profile, addresses, orders, wishlist, saved items, coupons, rewards & tiers, referrals, reviews, notifications, communication preferences, support tickets, account deletion request
- ✅ English / हिन्दी, light/dark theme, skeletons, empty and error states, accessible components
- ✅ SEO: metadata, Open Graph, canonical URLs, sitemap.xml, robots.txt, structured data
- ⏳ Browser push notifications (needs Firebase) · ⏳ Google Maps pin/map (needs key)

## Console (`apps/admin`) — super admin, store owner, managers, staff, support

- ✅ Dashboard: revenue (today/7/30 days/all-time, AOV), revenue and orders charts, sales by category, order pipeline, bestsellers, low stock, expiring batches, customers
- ✅ Orders: filters/search, detail with timeline, status changes by permission, notes, partner assignment (auto/manual), refunds (full/partial, gateway/manual with pending → sent), packing slip, new-order chime
- ✅ UPI payment checks: dashboard list of payments to verify, *Payment received* / *Not found* on the order (permission `payments.verify`), UPI settings
- ✅ Kitchen board for packing staff
- ✅ Products: create/edit with unlimited variants, images/video, Hindi fields, flags, archive/restore; categories; collections
- ✅ Inventory: stock by variant, batches with expiry (FEFO), purchases, suppliers, adjustments (damage/wastage/correction), movement history, low-stock and expiry alerts
- ✅ Customers (detail, block/unblock, points adjustment, anonymise), reviews moderation, support tickets, returns
- ✅ Delivery partners: verification of documents, approve/suspend, live map, earnings and settlements
- ✅ Coupons (usage reports), banners, home sections, content pages, FAQs, promotional broadcast
- ✅ Staff accounts (Firebase logins created from the console), custom roles and permissions, audit log, settings (checkout, delivery, loyalty, business profile, returns, alerts, store location, delivery zones), integrations status and notification log
- ✅ Reports with CSV export (sales, orders, products, inventory, customers, coupons, delivery, GST)
- ✅ Change own password

## Delivery partner app (`apps/delivery`)

- ✅ Registration with documents, pending-verification state, profile with vehicle and bank/UPI (encrypted)
- ✅ Online/offline with live GPS, offers with countdown, accept/reject
- ✅ Pickup flow, navigation link, customer call, OTP delivery, COD cash confirmation
- ✅ Active deliveries, history, earnings with daily incentive

## Android apps (`mobile/android`)

- ☑️ Customer and partner APKs (native WebView shells): camera/gallery uploads, location prompts, UPI/phone/maps hand-off, Razorpay pop-ups, invoice printing, offline screen; they open the Firebase Hosting sites directly (no address to type)
- ☑️ Partner app: foreground location service that keeps sharing the rider's position while they navigate in other apps (authenticates with the rider's Firebase credentials, memory only)
- ✅ Built and signed by GitHub Actions (`.github/workflows/naamdev-android.yml`)
- ➖ Native Android push notifications (the apps show in-app/live alerts while open)

## Backend & platform

- ✅ Runs on free plans: Express 5 API on Render (Docker), static apps on Firebase Hosting, Cloud Firestore data layer (photos stored in Firestore), Firebase Auth (email/password), real-time updates through Firestore live documents, in-process background jobs (Firestore leases when running several servers)
- ✅ Server-side pricing, idempotent checkout, FEFO stock reservation, order state machine
- ✅ Razorpay: signature + server-side payment fetch, webhooks, duplicate protection, automatic refunds for late payments
- ✅ Security: Firebase ID-token verification, revocation, RBAC with custom claims, deny-by-default Firestore/Storage rules, rate limits, secure uploads, encryption at rest, audit log, production startup guards
- ⏳ SMS (MSG91/Twilio), order emails (SMTP), web push (FCM VAPID key) — implemented, need credentials
- ✅ Tests: 37 unit, 66 API integration on the Firebase emulators, 7-step Playwright journey across all three apps (see [TESTING.md](TESTING.md))
- ☑️ One-click free deploy (`.github/workflows/naamdev-deploy.yml`): Firestore, Auth, Hosting ×3 on Firebase Spark + the API on Render free, with a keep-alive — parts tested locally (static builds, Docker image, Render API calls against a stand-in), deployed and checked live on 2026-11-19 (NAAMDEV live check: 5 / 5)
- ✅ CI workflow (typecheck, unit, API and end-to-end tests on emulators)
- ✅ Documentation (this folder)

## Known limitations

- The shop is deployed on the live Firebase project (`naamdevseets`, addresses `naamdevsweets…web.app`)
  and checked by *NAAMDEV live check*; real orders and UPI payments on the live shop have not been
  exercised by automated tests. No third-party provider (Razorpay, SMTP, SMS, push, Maps) has been
  tested for real; follow the checklists in [INTEGRATIONS.md](INTEGRATIONS.md).
- **Direct UPI payments need a person to confirm them** (there is no callback from UPI apps). Use
  Razorpay if you want automatic confirmation.
- **Console lists scan the latest 2,000 records** (orders, tickets, audit log search) and filter in
  memory — fine for one shop; very large histories would need dedicated Firestore queries per filter.
- **Imagery is generated SVG artwork**, not photography. Upload real product photos from the console.
- **Android apps are native shells around the websites** (see mobile/android/README.md); there is no
  iOS build and no offline browsing of the catalogue.
- **Push notifications are wired for the storefront only**; the console and partner app alert through
  Firestore live updates while open (the partner app vibrates and beeps on new offers).
- **Single store**: the schema has a `Store` model and orders reference a store, but checkout,
  dispatch and the console assume one default store.
- **Hindi** covers the storefront UI and catalogue; the console and partner app are English.
- Rate limits are per server instance (in memory), not global.
- **Free-plan limits**: Firestore 50k reads / 20k writes per day; no product videos (no Cloud Storage); the Render server needs the keep-alive to avoid a one-minute wake-up.
- GST e-invoicing (IRN) and accounting exports beyond CSV reports are not integrated.
- Legal pages (privacy, terms, refund, shipping) are sensible starting drafts — have them reviewed
  for your business before going live.
