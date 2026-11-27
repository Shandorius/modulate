#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

DUMP="${1:-}"
TARGET="${2:-restore_check}"

if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "Usage: $0 backups/<dump-file> [target-database]" >&2
  exit 1
fi

DB_USER="${POSTGRES_USER:-modulate}"
DB_NAME="${POSTGRES_DB:-modulate}"

sudo docker compose -f docker-compose.prod.yml exec -T db \
  dropdb --if-exists -U "$DB_USER" "$TARGET"
sudo docker compose -f docker-compose.prod.yml exec -T db \
  createdb -U "$DB_USER" "$TARGET"
sudo docker compose -f docker-compose.prod.yml exec -T db \
  pg_restore -U "$DB_USER" -d "$TARGET" < "$DUMP"

echo "[restore] $DUMP restored into $TARGET"
echo "[restore] verify with:"
echo "  sudo docker compose -f docker-compose.prod.yml exec -T db psql -U $DB_USER -d $TARGET -c '\\dt'"
echo "  source database: $DB_NAME"
