#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

APP_SLUG="${APP_SLUG:-modulate}"
DB_USER="${POSTGRES_USER:-modulate}"
DB_NAME="${POSTGRES_DB:-modulate}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

umask 077
mkdir -p backups

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="backups/${APP_SLUG}-${STAMP}.dump"

sudo docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$FILE"

find backups -type f -name "${APP_SLUG}-*.dump" -mtime +"$RETENTION_DAYS" -delete

echo "[backup] wrote $FILE"
