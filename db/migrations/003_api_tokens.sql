-- 003: portable mobile bearer tokens ---------------------------------------
-- auth/mobile/setup_db.js can also create this table for standalone copies.

CREATE TABLE IF NOT EXISTS api_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  token_hint    varchar(24),
  label         varchar(100),
  platform      varchar(20),
  device_id     varchar(200),
  last_used_at  timestamptz,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_tokens_user_active_idx
  ON api_tokens (user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS api_tokens_device_idx
  ON api_tokens (user_id, device_id)
  WHERE revoked_at IS NULL;
