#!/bin/sh
# Daily compressed PostgreSQL backups with retention. Runs inside the `backup` compose service.
# Restore: gunzip -c naamdev-YYYYmmdd-HHMMSS.sql.gz | psql "$DATABASE_URL"
set -eu
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
mkdir -p /backups
while true; do
  ts="$(date +%Y%m%d-%H%M%S)"
  file="/backups/naamdev-${ts}.sql.gz"
  if pg_dump --no-owner --format=plain "$DATABASE_URL" | gzip -9 > "${file}.tmp"; then
    mv "${file}.tmp" "$file"
    echo "[backup] wrote $file ($(du -h "$file" | cut -f1))"
  else
    rm -f "${file}.tmp"
    echo "[backup] FAILED at $ts" >&2
  fi
  find /backups -name 'naamdev-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
  sleep "$INTERVAL"
done
