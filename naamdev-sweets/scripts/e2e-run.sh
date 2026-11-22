#!/usr/bin/env bash
# Runs inside `firebase emulators:exec` (see scripts/e2e.sh), which sets the *_EMULATOR_HOST variables.
set -euo pipefail
cd "$(dirname "$0")/.."
export FIREBASE_PROJECT_ID=demo-naamdev METADATA_SERVER_DETECTION=none
# The browser apps talk to the local API and the same emulators (baked into the static builds).
export NEXT_PUBLIC_API_URL=http://localhost:4000 NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-naamdev NEXT_PUBLIC_FIREBASE_API_KEY=demo-key \
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST="$FIREBASE_AUTH_EMULATOR_HOST" \
  NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST="$FIRESTORE_EMULATOR_HOST" \
  NEXT_PUBLIC_STORAGE_EMULATOR_HOST="$FIREBASE_STORAGE_EMULATOR_HOST"
SEED_DEMO_ACCOUNTS=true pnpm --filter @naamdev/db seed > /dev/null
pids=()
# Each server runs in its own process group (setsid) so cleanup also stops npx children.
cleanup() { for p in "${pids[@]}"; do kill -- "-$p" 2>/dev/null || kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT
LOGS="${E2E_LOG_DIR:-${TMPDIR:-/tmp}}"
setsid bash -c "cd apps/api && JOBS_ENABLED=true ENFORCE_STORE_HOURS=false EMAIL_PROVIDER=console SMS_PROVIDER=console exec npx tsx src/index.ts" > "$LOGS/nd-e2e-api.log" 2>&1 & pids+=($!)
# Static production builds, served with firebase.json's rewrites and headers (like Firebase Hosting).
for app in web admin delivery; do
  if [ "${E2E_SKIP_BUILD:-0}" = "1" ] && [ -d "apps/$app/out" ]; then continue; fi
  pnpm --filter "@naamdev/$app" build > "$LOGS/nd-e2e-build-$app.log" 2>&1 || { tail -40 "$LOGS/nd-e2e-build-$app.log"; exit 1; }
done
export CSP_EXTRA="http://localhost:4000 http://$FIREBASE_AUTH_EMULATOR_HOST http://$FIRESTORE_EMULATOR_HOST http://$FIREBASE_STORAGE_EMULATOR_HOST"
setsid node scripts/serve-static.mjs web 3000 > "$LOGS/nd-e2e-web.log" 2>&1 & pids+=($!)
setsid node scripts/serve-static.mjs admin 3001 > "$LOGS/nd-e2e-admin.log" 2>&1 & pids+=($!)
setsid node scripts/serve-static.mjs delivery 3002 > "$LOGS/nd-e2e-delivery.log" 2>&1 & pids+=($!)
for url in http://localhost:4000/health http://localhost:3000 http://localhost:3001/login http://localhost:3002/login; do
  for i in $(seq 1 60); do curl -sf -o /dev/null "$url" && break; sleep 2; done
done
npx playwright test --config tests/e2e/playwright.config.ts --trace off
