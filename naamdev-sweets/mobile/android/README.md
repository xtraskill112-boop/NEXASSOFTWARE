# NAAMDEV Android apps

One Android project, two apps:

| App | Package | Opens |
|---|---|---|
| **NAAMDEV SWEETS** (customers) | `com.naamdevsweets.app` | the storefront (`apps/web`) |
| **NAAMDEV Partner** (delivery riders) | `com.naamdevsweets.partner` | the partner site (`apps/delivery`) |

Both are native shells around the live websites, so every feature, price and fix on the site appears
in the app immediately, with no app update. The shell adds what a browser tab can't:

- camera or gallery picker for uploads (partner KYC documents, return photos, profile photo);
- location permission prompts for the address pin and live delivery tracking;
- hand-off to UPI apps, the phone dialer, WhatsApp and Google Maps;
- Razorpay payment pop-ups (bank and 3-D Secure pages) inside the app;
- printing or saving invoices as PDF;
- an offline screen that retries automatically; light and dark theme following the phone;
- **Partner app only:** a foreground location service that keeps sending the rider's position
  while they are online, even while they navigate in Google Maps. It shows a "You're online"
  notification. Sharing stops when they go offline or sign out.

## Get the APKs

GitHub Actions builds both apps on every change to this folder (workflow
`.github/workflows/naamdev-android.yml`). Open the repository's **Actions** tab → *NAAMDEV Android
apps* → the latest run → **Artifacts**, and download `naamdev-android-apks-1.0.N` (a zip containing
both APKs and their SHA-256 checksums).

To install on a phone, allow "Install unknown apps" for your browser or file manager, then open the APK.

### Which site the app opens

- **Not set (default):** on first launch the app asks for the store address, for example
  `https://naamdevsweets.com`, or `http://192.168.1.20:3000` to test against a computer on the same
  Wi-Fi. It checks that the address really is the NAAMDEV storefront (or partner site) before
  saving it. "Change store address" appears on the offline screen.
- **Fixed (production):** run the workflow manually (*Run workflow*) and enter the storefront and
  partner addresses, or save them once as repository variables `NAAMDEV_CUSTOMER_URL` and
  `NAAMDEV_PARTNER_URL` (*Settings → Secrets and variables → Actions → Variables*). These builds
  skip the setup screen and only allow HTTPS.

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
- Google Play needs an App Bundle: `./gradlew bundleCustomerRelease bundlePartnerRelease`.

## Build locally

Requires JDK 17+ and the Android SDK (Android Studio installs both). Open this folder in Android
Studio, or:

```bash
cd naamdev-sweets/mobile/android
./gradlew assembleCustomerDebug assemblePartnerDebug          # debug builds (ask for the address)
NAAMDEV_CUSTOMER_URL=https://naamdevsweets.com \
NAAMDEV_PARTNER_URL=https://partner.naamdevsweets.com \
NAAMDEV_KEYSTORE_FILE=/path/naamdev-release.keystore NAAMDEV_KEYSTORE_PASSWORD=… \
NAAMDEV_KEY_ALIAS=naamdev NAAMDEV_KEY_PASSWORD=… \
./gradlew assembleCustomerRelease assemblePartnerRelease
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
