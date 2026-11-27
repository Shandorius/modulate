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
APP_SLUG="$(printf '%s' "$APP_SLUG" | tr -c 'A-Za-z0-9_-' '-')"
PROJECT_DIR="$(pwd)"
SERVICE="/etc/systemd/system/${APP_SLUG}-backup.service"
TIMER="/etc/systemd/system/${APP_SLUG}-backup.timer"

sudo tee "$SERVICE" >/dev/null <<EOF
[Unit]
Description=Nightly PostgreSQL backup for ${APP_SLUG}
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
WorkingDirectory=${PROJECT_DIR}
ExecStart=${PROJECT_DIR}/scripts/backup-db.sh
EOF

sudo tee "$TIMER" >/dev/null <<EOF
[Unit]
Description=Nightly PostgreSQL backup timer for ${APP_SLUG}

[Timer]
OnCalendar=*-*-* 03:15:00
RandomizedDelaySec=15m
Persistent=true

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now "${APP_SLUG}-backup.timer"
sudo systemctl list-timers "${APP_SLUG}-backup.timer" --no-pager
