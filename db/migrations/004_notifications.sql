-- 004: local notification preferences and test log --------------------------

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  push_enabled     boolean NOT NULL DEFAULT true,
  morning_plan     boolean NOT NULL DEFAULT true,
  morning_time     time NOT NULL DEFAULT '08:00',
  quiet_start      time NOT NULL DEFAULT '21:00',
  quiet_end        time NOT NULL DEFAULT '07:00',
  day_end          time NOT NULL DEFAULT '21:00',
  max_per_day      smallint NOT NULL DEFAULT 2
                   CHECK (max_per_day BETWEEN 1 AND 2),
  hide_details     boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS notification_preferences_set_updated_at
  ON notification_preferences;
CREATE TRIGGER notification_preferences_set_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS notification_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            text NOT NULL,
  title           text,
  body            text,
  data            jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key      text NOT NULL UNIQUE,
  local_date      date,
  scheduled_for   timestamptz,
  sent_at         timestamptz,
  status          text NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled', 'sent', 'skipped', 'failed')),
  skip_reason     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_log_user_date_idx
  ON notification_log (user_id, local_date, status);
