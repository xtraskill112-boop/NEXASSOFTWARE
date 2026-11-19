#!/usr/bin/env bash
# One-command end-to-end run on the Firebase emulators (Auth, Firestore, Storage):
# fresh seeded data → API → production builds of all apps → Playwright. Nothing touches a real project.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
for port in 4000 3000 3001 3002 8080 9099 9199; do
  if curl -s -o /dev/null -m 2 "http://localhost:$port"; then echo "Port $port is already in use — stop running servers first." >&2; exit 1; fi
done
exec npx firebase emulators:exec --project demo-naamdev --only auth,firestore,storage "bash scripts/e2e-run.sh"
