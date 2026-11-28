-- 012: shuffle-aware queue ordering -----------------------------------------

ALTER TABLE playback_queue
  ADD COLUMN IF NOT EXISTS original_position integer;

UPDATE playback_queue
SET original_position = position
WHERE original_position IS NULL;

CREATE INDEX IF NOT EXISTS playback_queue_original_idx
  ON playback_queue (user_id, original_position);
