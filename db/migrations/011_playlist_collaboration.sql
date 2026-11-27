-- 011: collaborative playlist roles and revisioning -------------------------

ALTER TABLE playlist_shares
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'viewer'
  CHECK (role IN ('viewer', 'editor'));

ALTER TABLE playlists
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;
