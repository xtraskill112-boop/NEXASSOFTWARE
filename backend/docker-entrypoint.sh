#!/bin/sh
set -e

echo "[stocksense] Applying database migrations..."
./node_modules/.bin/prisma migrate deploy

if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "[stocksense] Seeding demo data (skipped automatically if data already exists)..."
  node dist/prisma/seed.js
fi

echo "[stocksense] Starting API server..."
exec node dist/src/server.js
