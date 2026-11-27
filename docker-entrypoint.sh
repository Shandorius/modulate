#!/bin/sh
set -eu

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
DATA_DIR="${DATA_DIR:-/data}"

case "$PUID" in
  ''|*[!0-9]*)
    echo "[entrypoint] PUID must be a numeric UID" >&2
    exit 1
    ;;
esac

case "$PGID" in
  ''|*[!0-9]*)
    echo "[entrypoint] PGID must be a numeric GID" >&2
    exit 1
    ;;
esac

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR/media" "$DATA_DIR/home" "$DATA_DIR/cache"

  export HOME="$DATA_DIR/home"
  export XDG_CACHE_HOME="$DATA_DIR/cache"

  # Only repair ownership when the target user cannot write one of the
  # runtime paths. Subsequent starts are cheap.
  needs_fix=0
  for path in "$DATA_DIR" "$DATA_DIR/media" "$DATA_DIR/home" "$DATA_DIR/cache"; do
    if ! gosu "$PUID:$PGID" test -w "$path" 2>/dev/null; then
      needs_fix=1
      break
    fi
  done

  if [ "$needs_fix" = "0" ]; then
    for file in session-secret stream-secret; do
      if [ -e "$DATA_DIR/$file" ] \
        && ! gosu "$PUID:$PGID" test -w "$DATA_DIR/$file" 2>/dev/null; then
        needs_fix=1
        break
      fi
    done
  fi

  if [ "$needs_fix" = "1" ]; then
    echo "[entrypoint] granting $PUID:$PGID ownership of $DATA_DIR"
    chown -R "$PUID:$PGID" "$DATA_DIR"
    chmod -R u+rwX "$DATA_DIR"
  fi

  exec gosu "$PUID:$PGID" "$@"
fi

# Rootless runtimes may already start us as the right user.
exec "$@"
