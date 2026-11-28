#!/usr/bin/env bash
# Local end-to-end test. Nothing here touches a real Firebase project or Shadowfax:
# it uses the "demo-sf360" emulator project and e2e/mock-shadowfax.mjs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export SF360_ALLOWED_EMAILS="owner@example.com"
export SF360_SHADOWFAX_ENV="staging"
export SF360_FIREBASE_PROJECT_ID="demo-sf360"
node scripts/prepare-deploy.mjs

# Emulator-only secrets and the fake Shadowfax address (both files are git-ignored).
printf 'SHADOWFAX_API_TOKEN=test-token\nSF_WEBHOOK_KEY=test-webhook-key\n' > functions/.secret.local
printf 'SF360_MOCK_SHADOWFAX_URL=http://127.0.0.1:4010\n' > functions/.env.local
npm --prefix functions run build

VITE_USE_EMULATORS=true VITE_FIREBASE_API_KEY=fake-api-key VITE_FIREBASE_PROJECT_ID=demo-sf360 \
  VITE_FIREBASE_AUTH_DOMAIN=demo-sf360.firebaseapp.com VITE_FIREBASE_APP_ID=1:1:web:1 \
  npx --prefix web vite build web --outDir dist-e2e --emptyOutDir

node e2e/mock-shadowfax.mjs > /tmp/sf360-mock.log 2>&1 &
MOCK_PID=$!
(cd web && npx vite preview --outDir dist-e2e --port 4173 --strictPort --host 127.0.0.1) > /tmp/sf360-preview.log 2>&1 &
PREVIEW_PID=$!
trap 'kill $MOCK_PID $PREVIEW_PID 2>/dev/null || true' EXIT

npx --prefix e2e firebase emulators:exec --project demo-sf360 --only auth,firestore,functions "node e2e/flow.mjs"
