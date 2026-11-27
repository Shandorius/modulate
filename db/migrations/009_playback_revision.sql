-- 009: distinguish remote control changes from position reports -------------

ALTER TABLE playback_state
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;

ALTER TABLE playback_state
  ADD COLUMN IF NOT EXISTS last_action text;
