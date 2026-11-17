#!/usr/bin/env bash
# One-command end-to-end run: fresh database → API → production builds of all apps → Playwright.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
for port in 4000 3000 3001 3002; do
  if curl -s -o /dev/null -m 2 "http://localhost:$port"; then echo "Port $port is already in use — stop running servers first." >&2; exit 1; fi
done
DB_URL="$(cd apps/api && npx tsx scripts/e2e-db.ts)"
echo "E2E database: ${DB_URL%%\?*}"
pids=()
# Each server runs in its own process group (setsid) so cleanup also stops npx/next children.
cleanup() { for p in "${pids[@]}"; do kill -- "-$p" 2>/dev/null || kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT
LOGS="${E2E_LOG_DIR:-${TMPDIR:-/tmp}}"
setsid bash -c "cd apps/api && DATABASE_URL='$DB_URL' JOBS_ENABLED=true exec npx tsx src/index.ts" > "$LOGS/nd-e2e-api.log" 2>&1 & pids+=($!)
# Always test fresh production builds; E2E_SKIP_BUILD=1 reuses existing .next output.
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
