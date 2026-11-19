#!/usr/bin/env bash
# Runs inside `firebase emulators:exec` (see scripts/e2e.sh), which sets the *_EMULATOR_HOST variables.
set -euo pipefail
cd "$(dirname "$0")/.."
export FIREBASE_PROJECT_ID=demo-naamdev METADATA_SERVER_DETECTION=none
# The browser apps talk to the same emulators (baked into the builds below).
export NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-naamdev NEXT_PUBLIC_FIREBASE_API_KEY=demo-key \
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST="$FIREBASE_AUTH_EMULATOR_HOST" \
  NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST="$FIRESTORE_EMULATOR_HOST" \
  NEXT_PUBLIC_STORAGE_EMULATOR_HOST="$FIREBASE_STORAGE_EMULATOR_HOST"
SEED_DEMO_ACCOUNTS=true pnpm --filter @naamdev/db seed > /dev/null
pids=()
# Each server runs in its own process group (setsid) so cleanup also stops npx/next children.
cleanup() { for p in "${pids[@]}"; do kill -- "-$p" 2>/dev/null || kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT
LOGS="${E2E_LOG_DIR:-${TMPDIR:-/tmp}}"
setsid bash -c "cd apps/api && JOBS_ENABLED=true EMAIL_PROVIDER=console SMS_PROVIDER=console exec npx tsx src/index.ts" > "$LOGS/nd-e2e-api.log" 2>&1 & pids+=($!)
# Always test fresh production builds; E2E_SKIP_BUILD=1 reuses existing (emulator) builds.
for app in web admin delivery; do
  if [ "${E2E_SKIP_BUILD:-0}" = "1" ] && [ -d "apps/$app/.next" ]; then continue; fi
  (cd "apps/$app" && npx next build)
done
setsid bash -c "cd apps/web && exec npx next start -p 3000" > "$LOGS/nd-e2e-web.log" 2>&1 & pids+=($!)
setsid bash -c "cd apps/admin && exec npx next start -p 3001" > "$LOGS/nd-e2e-admin.log" 2>&1 & pids+=($!)
setsid bash -c "cd apps/delivery && exec npx next start -p 3002" > "$LOGS/nd-e2e-delivery.log" 2>&1 & pids+=($!)
for url in http://localhost:4000/health http://localhost:3000 http://localhost:3001/login http://localhost:3002/login; do
  for i in $(seq 1 60); do curl -sf -o /dev/null "$url" && break; sleep 2; done
done
npx playwright test --config tests/e2e/playwright.config.ts --trace off
