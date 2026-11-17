# Progress checklist

Status of every area in the original brief. ✅ built and covered by automated tests ·
☑️ built, exercised manually / by type checks only · ⏳ needs your credentials or content ·
➖ not built (see *Known limitations*).

## Customer storefront (`apps/web`)

- ✅ Home feed configurable from the console (hero banners, categories, bestsellers, collections, offers, announcement bar)
- ✅ Categories, category pages with filters (veg/egg, price, in stock, offers) and sorting
- ✅ Typo-tolerant search with suggestions, trending searches, ingredient/category matching
- ✅ Product page: variants (weight/pack) with server prices, MRP savings, stock, ingredients, shelf life, allergens, reviews, JSON-LD
- ✅ Cart (guest + signed-in with merge), save for later, coupon apply/remove with clear reasons
- ✅ Checkout: addresses (form + optional GPS pin), delivery estimate/serviceability by PIN code, coupons, reward points, COD
- ⏳ Online payment via Razorpay Checkout (UPI, cards, netbanking, wallets) — code complete and API-tested with a mock; needs keys
- ✅ Order placed page, live tracking (status timeline, partner location, delivery OTP), cancel, reorder, returns with photos, invoice
- ✅ OTP sign-up/login, password login, forgot password, sessions management
- ✅ Account: profile, addresses, orders, wishlist, saved items, coupons, rewards & tiers, referrals, reviews, notifications, communication preferences, support tickets, account deletion request
- ✅ English / हिन्दी, light/dark theme, skeletons, empty and error states, accessible components
- ✅ SEO: metadata, Open Graph, canonical URLs, sitemap.xml, robots.txt, structured data
- ⏳ Browser push notifications (needs Firebase) · ⏳ Google Maps pin/map (needs key)

## Console (`apps/admin`) — super admin, store owner, managers, staff, support

- ✅ Dashboard: revenue (today/7/30 days/all-time, AOV), revenue and orders charts, sales by category, order pipeline, bestsellers, low stock, expiring batches, customers
- ✅ Orders: filters/search, detail with timeline, status changes by permission, notes, partner assignment (auto/manual), refunds (full/partial, gateway/manual), packing slip, new-order chime
- ✅ Kitchen board for packing staff
- ✅ Products: create/edit with unlimited variants, images/video, Hindi fields, flags, archive/restore; categories; collections
- ✅ Inventory: stock by variant, batches with expiry (FEFO), purchases, suppliers, adjustments (damage/wastage/correction), movement history, low-stock and expiry alerts
- ✅ Customers (detail, block/unblock, points adjustment, anonymise), reviews moderation, support tickets, returns
- ✅ Delivery partners: verification of documents, approve/suspend, live map, earnings and settlements
- ✅ Coupons (usage reports), banners, home sections, content pages, FAQs, promotional broadcast
- ✅ Staff accounts, custom roles and permissions, audit log, settings (checkout, delivery, loyalty, business profile, returns, alerts, store location, delivery zones), integrations status and notification log
- ✅ Reports with CSV export (sales, orders, products, inventory, customers, coupons, delivery, GST)
- ✅ Change own password

## Delivery partner app (`apps/delivery`)

- ✅ Registration with documents, pending-verification state, profile with vehicle and bank/UPI (encrypted)
- ✅ Online/offline with live GPS, offers with countdown, accept/reject
- ✅ Pickup flow, navigation link, customer call, OTP delivery, COD cash confirmation
- ✅ Active deliveries, history, earnings with daily incentive

## Android apps (`mobile/android`)

- ☑️ Customer and partner APKs (native WebView shells): camera/gallery uploads, location prompts, UPI/phone/maps hand-off, Razorpay pop-ups, invoice printing, offline screen, first-launch site setup or fixed site address
- ☑️ Partner app: foreground location service that keeps sharing the rider's position while they navigate in other apps
- ✅ Built and signed by GitHub Actions (`.github/workflows/naamdev-android.yml`)
- ➖ Native push notifications (needs a Firebase project)

## Backend & platform

- ✅ Express 5 API, Socket.IO realtime, PostgreSQL + Prisma (59 models), scheduler with advisory locks
- ✅ Server-side pricing, idempotent checkout, FEFO stock reservation, order state machine
- ✅ Razorpay: signature + server-side payment fetch, webhooks, duplicate protection, automatic refunds for late payments
- ✅ Security: argon2id, hashed sessions per app, CSRF, RBAC, rate limits, secure uploads, encryption at rest, audit log, production startup guards
- ⏳ SMS (MSG91/Twilio), email (SMTP), push (FCM), Cloudinary — implemented, need credentials
- ✅ Tests: 34 unit, 52 API integration, Playwright journey across all three apps (see [TESTING.md](TESTING.md))
- ✅ Docker images (API, Next.js ×3), Compose stack with Caddy HTTPS and daily backups, CI workflow
- ✅ Documentation (this folder)

## Known limitations

- **No third-party service has been tested against the real provider yet** — follow the checklists
  in [INTEGRATIONS.md](INTEGRATIONS.md) in test mode before launch.
- **Imagery is generated SVG artwork**, not photography. Upload real product photos from the console.
- **Android apps are native shells around the websites** (see mobile/android/README.md); there is no
  iOS build and no offline browsing of the catalogue.
- **Push notifications are wired for the storefront only**; the console and partner app alert via
  Socket.IO while open (the partner app vibrates and beeps on new offers).
- **Single store**: the schema has a `Store` model and orders reference a store, but checkout,
  dispatch and the console assume one default store.
- **Hindi** covers the storefront UI and catalogue; the console and partner app are English.
- Horizontal scaling of Socket.IO needs a Redis adapter (not included); see DEPLOYMENT.md.
- GST e-invoicing (IRN) and accounting exports beyond CSV reports are not integrated.
- Legal pages (privacy, terms, refund, shipping) are sensible starting drafts — have them reviewed
  for your business before going live.
