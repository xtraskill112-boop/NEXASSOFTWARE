# NAAMDEV Android apps

One Android project, three apps:

| App | Package | Opens |
|---|---|---|
| **NAAMDEV SWEETS** (customers) | `com.naamdevsweets.app` | the storefront (`apps/web`) |
| **NAAMDEV Partner** (delivery riders) | `com.naamdevsweets.partner` | the partner site (`apps/delivery`) |
| **NAAMDEV Admin** (store owner and staff) | `com.naamdevsweets.admin` | the staff console (`apps/admin`) |

All three are native shells around the live websites, so every feature, price and fix on the site appears
in the app immediately, with no app update. The shell adds what a browser tab can't:

- camera or gallery picker for uploads (partner KYC documents, return photos, profile photo);
- location permission prompts for the address pin and live delivery tracking;
- hand-off to UPI apps, the phone dialer, WhatsApp and Google Maps;
- Razorpay payment pop-ups (bank and 3-D Secure pages) inside the app;
- printing or saving invoices and packing slips as PDF;
- saving downloaded files — console reports (CSV) and riders' documents — through Android's
  *Save to* picker (the page hands the file to the app, which a plain WebView can't download);
- an offline screen that retries automatically; light and dark theme following the phone;
- **Partner app only:** a foreground location service that keeps sending the rider's position
  while they are online, even while they navigate in Google Maps. It shows a "You're online"
  notification. Sharing stops when they go offline or sign out.

## Get the APKs

GitHub Actions builds both apps on every change to this folder (workflow
`.github/workflows/naamdev-android.yml`) and publishes them as a GitHub **release**
(`naamdev-android-v1.0.N`) — open the repository's **Releases** page on the phone and tap the APK to
download it; no GitHub login needed. Each run also keeps them as an artifact zip for 30 days.

Builds without a release signing key (`NAAMDEV_ANDROID_KEYSTORE_*` secrets) use a new temporary key
each time, so **uninstall the previous build before installing a new one**.

To install on a phone, allow "Install unknown apps" for your browser or file manager, then open the APK.

### Which site the app opens

- **GitHub Actions builds (default):** the customer app opens `https://naamdevseets.web.app` and the
  partner app `https://naamdevseets-partner.web.app` and the admin app
  `https://naamdevseets-admin.web.app` — the Firebase Hosting sites created by the
  deploy workflow. There is **no address to type**; the apps only allow HTTPS. Deploy the sites first
  (docs/DEPLOYMENT.md), otherwise the app shows its offline screen.
- **Different addresses** (custom domain, renamed Hosting site): run the workflow manually
  (*Run workflow*) and enter them, or save repository variables `NAAMDEV_CUSTOMER_URL`,
  `NAAMDEV_PARTNER_URL` and `NAAMDEV_ADMIN_URL` (*Settings → Secrets and variables → Actions → Variables*).
- **Local debug builds without an address:** the app asks for one on first launch (e.g.
  `http://192.168.1.20:3000` for a computer on the same Wi-Fi) and checks it really is a NAAMDEV site.

Sign-in inside the apps is the site's own email + password login (Firebase Authentication). For the
partner app's background location, the page hands the rider's Firebase credentials and the API address
to the location service, which keeps them in memory only and stops when the rider goes offline or signs
out. (The API address must be `https`; debug builds also accept a local `http` address.)

### Signing

- Without a release key, each build is signed with a **temporary key** created for that build.
  Android only installs an update signed with the same key, so uninstall the previous test build
  first.
- For real distribution (and Google Play), create one key and keep it safe — losing it means you
  can't update the app:

  ```bash
  keytool -genkeypair -keystore naamdev-release.keystore -alias naamdev -keyalg RSA -keysize 4096 -validity 10000
  base64 -w0 naamdev-release.keystore   # → secret NAAMDEV_ANDROID_KEYSTORE_BASE64
  ```

  Add the repository secrets `NAAMDEV_ANDROID_KEYSTORE_BASE64`, `NAAMDEV_ANDROID_KEYSTORE_PASSWORD`,
  `NAAMDEV_ANDROID_KEY_ALIAS` and `NAAMDEV_ANDROID_KEY_PASSWORD`. Keystores are git-ignored here;
  never commit one.
- Google Play needs an App Bundle: `./gradlew bundleCustomerRelease bundlePartnerRelease bundleAdminRelease`.

## Build locally

Requires JDK 17+ and the Android SDK (Android Studio installs both). Open this folder in Android
Studio, or:

```bash
cd naamdev-sweets/mobile/android
./gradlew assembleCustomerDebug assemblePartnerDebug assembleAdminDebug   # debug builds (ask for the address)
NAAMDEV_CUSTOMER_URL=https://naamdevseets.web.app \
NAAMDEV_PARTNER_URL=https://naamdevseets-partner.web.app \
NAAMDEV_ADMIN_URL=https://naamdevseets-admin.web.app \
NAAMDEV_KEYSTORE_FILE=/path/naamdev-release.keystore NAAMDEV_KEYSTORE_PASSWORD=… \
NAAMDEV_KEY_ALIAS=naamdev NAAMDEV_KEY_PASSWORD=… \
./gradlew assembleCustomerRelease assemblePartnerRelease assembleAdminRelease
```

Debug builds install side by side with release builds (`.debug` package suffix) and allow Chrome
remote debugging of the page (`chrome://inspect`).

Icons are generated from `packages/ui/assets`: `node naamdev-sweets/mobile/android/scripts/generate-icons.mjs`.

## Limitations

- **No push notifications yet.** Android WebView doesn't support web push. Customers get order
  updates in-app, by SMS or by email. Riders get offers in real time while the app is open, and
  the location notification keeps the app alive while they're online. Native push needs a Firebase
  project (`google-services.json`) and is not wired up.
- The location service stops if Android kills the app. Reopening the app resumes sharing while the
  rider is online.
- Requires Android 7.0+ with an up-to-date Android System WebView (Chrome). Taking a photo
  directly inside the upload picker needs Android 10+; older phones choose from the gallery.
- Payments: Razorpay Checkout runs inside the app. UPI "pay with app" opens the installed UPI app.
  As always, an order is confirmed only after the server verifies the payment.
