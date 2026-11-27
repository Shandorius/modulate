#!/usr/bin/env bash
set -euo pipefail

# Run from the project root:
#   SERVER_USER=shandorv SERVER_HOST=49.12.202.30 \
#   REMOTE_PATH=/home/shandorv/myapp ENV_FILE=.env.server \
#   ./scripts/deploy.sh
#
# Optional:
#   SUDO_PASSWORD  Remote sudo password. When set, it is piped to `sudo -S`
#                  over SSH so the script works without an interactive terminal.
#   DOCKER_SUDO    Command prefix for docker compose on the server.
#                  Default: sudo. Set DOCKER_SUDO= (empty) when the server user
#                  is in the docker group and does not need sudo.
#   SSH_TTY        Set to 0 to skip `ssh -t`. Use this only when remote sudo is
#                  passwordless or DOCKER_SUDO is empty.
#   SSH_OPTS       Extra ssh options, for example "-p 2222".

: "${SERVER_USER:?Set SERVER_USER}"
: "${SERVER_HOST:?Set SERVER_HOST}"
: "${REMOTE_PATH:?Set REMOTE_PATH}"
: "${ENV_FILE:?Set ENV_FILE to the production env file}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing environment file: $ENV_FILE" >&2
  exit 1
fi

SSH_OPTS="${SSH_OPTS:-}"
DOCKER_SUDO="${DOCKER_SUDO-sudo}"
SSH_TTY="${SSH_TTY:-1}"

SSH_ARGS=()
if [ -n "$SSH_OPTS" ]; then
  # Deliberate word splitting so SSH_OPTS can hold several flags.
  # shellcheck disable=SC2206
  SSH_ARGS=($SSH_OPTS)
fi

RSYNC_SSH="ssh"
if [ -n "$SSH_OPTS" ]; then
  RSYNC_SSH="ssh $SSH_OPTS"
fi

if [ -n "$DOCKER_SUDO" ] && [ -z "${SUDO_PASSWORD:-}" ] && [ "$SSH_TTY" != "0" ] && [ ! -t 0 ]; then
  cat >&2 <<'MSG'
Remote sudo needs a terminal or a password, and this shell has no TTY.

Choose one:
  1. Run the script from an interactive terminal.
  2. export SUDO_PASSWORD='your-server-sudo-password'
  3. Configure passwordless sudo for docker on the server.
  4. Set DOCKER_SUDO= (empty) if the server user can run docker without sudo.
  5. Set SSH_TTY=0 only if remote sudo is already passwordless.
MSG
  exit 1
fi

echo "[deploy] syncing files to ${SERVER_USER}@${SERVER_HOST}:${REMOTE_PATH}"

ssh "${SSH_ARGS[@]}" "$SERVER_USER@$SERVER_HOST" "mkdir -p '$REMOTE_PATH'"

rsync -avz --delete -e "$RSYNC_SSH" \
  --exclude 'node_modules/' \
  --exclude 'web/node_modules/' \
  --exclude 'web/dist/' \
  --exclude 'web/.angular/' \
  --exclude 'web/android/.gradle/' \
  --exclude 'web/android/build/' \
  --exclude 'web/android/app/build/' \
  --exclude 'web/android/local.properties' \
  --exclude 'tests/' \
  --exclude 'docs/' \
  --exclude '.git/' \
  --exclude '.env' \
  --exclude '.env.server' \
  --exclude '*.apk' \
  --exclude 'backups/' \
  ./ "$SERVER_USER@$SERVER_HOST:$REMOTE_PATH/"

rsync -avz -e "$RSYNC_SSH" "$ENV_FILE" "$SERVER_USER@$SERVER_HOST:$REMOTE_PATH/.env"

COMPOSE="docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d"

echo "[deploy] starting containers"

if [ -n "$DOCKER_SUDO" ]; then
  if [ -n "${SUDO_PASSWORD:-}" ]; then
    # -S reads the password from stdin; -p '' hides the prompt text.
    printf '%s\n' "$SUDO_PASSWORD" | ssh "${SSH_ARGS[@]}" "$SERVER_USER@$SERVER_HOST" \
      "cd '$REMOTE_PATH' && $DOCKER_SUDO -S -p '' $COMPOSE"
  else
    TTY_ARGS=()
    if [ "$SSH_TTY" != "0" ]; then
      TTY_ARGS=(-t)
    fi
    ssh "${TTY_ARGS[@]}" "${SSH_ARGS[@]}" "$SERVER_USER@$SERVER_HOST" \
      "cd '$REMOTE_PATH' && $DOCKER_SUDO $COMPOSE"
  fi
else
  ssh "${SSH_ARGS[@]}" "$SERVER_USER@$SERVER_HOST" \
    "cd '$REMOTE_PATH' && $COMPOSE"
fi

echo "[deploy] done"
