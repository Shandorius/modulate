-- 006: canonical player state, queue, presence, and announcements -----------

CREATE TABLE IF NOT EXISTS playback_state (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_track_id uuid REFERENCES tracks(id) ON DELETE SET NULL,
  position_seconds numeric(12, 3) NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
  volume           numeric(4, 3) NOT NULL DEFAULT 0.8 CHECK (volume >= 0 AND volume <= 1),
  is_playing       boolean NOT NULL DEFAULT false,
  repeat_mode      text NOT NULL DEFAULT 'off'
                   CHECK (repeat_mode IN ('off', 'all', 'one')),
  shuffle          boolean NOT NULL DEFAULT false,
  context_type     text CHECK (context_type IS NULL OR context_type IN ('track', 'playlist', 'album', 'queue')),
  context_id       uuid,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS playback_state_set_updated_at ON playback_state;
CREATE TRIGGER playback_state_set_updated_at
  BEFORE UPDATE ON playback_state
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS playback_queue (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id   uuid NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position   integer NOT NULL CHECK (position >= 0),
  added_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS playback_queue_user_order_idx
  ON playback_queue (user_id, position, added_at);

CREATE INDEX IF NOT EXISTS playback_queue_track_idx
  ON playback_queue (track_id);

CREATE TABLE IF NOT EXISTS player_sessions (
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id    text NOT NULL,
  platform     text NOT NULL DEFAULT 'web',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_id)
);

CREATE INDEX IF NOT EXISTS player_sessions_seen_idx
  ON player_sessions (last_seen_at);

CREATE TABLE IF NOT EXISTS announcements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message         text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1000),
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  acknowledged_at timestamptz
);

CREATE INDEX IF NOT EXISTS announcements_pending_idx
  ON announcements (user_id, expires_at DESC)
  WHERE acknowledged_at IS NULL;
