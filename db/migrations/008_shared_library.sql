-- 008: shared household library, per-user favourites, playlist access -------

CREATE TABLE IF NOT EXISTS track_favorites (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id   uuid NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, track_id)
);

CREATE INDEX IF NOT EXISTS track_favorites_track_idx
  ON track_favorites (track_id);

INSERT INTO track_favorites (user_id, track_id)
SELECT user_id, id FROM tracks WHERE is_favorite
ON CONFLICT DO NOTHING;

ALTER TABLE tracks
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;

UPDATE tracks SET created_by = user_id WHERE created_by IS NULL;

DROP INDEX IF EXISTS tracks_user_source_unique;
DROP INDEX IF EXISTS tracks_user_created_idx;
DROP INDEX IF EXISTS tracks_user_artist_idx;
DROP INDEX IF EXISTS tracks_user_album_idx;
DROP INDEX IF EXISTS tracks_user_favorite_idx;

ALTER TABLE tracks
  DROP CONSTRAINT IF EXISTS tracks_user_id_file_path_key;

ALTER TABLE tracks DROP COLUMN IF EXISTS user_id;
ALTER TABLE tracks DROP COLUMN IF EXISTS is_favorite;

ALTER TABLE tracks
  ADD CONSTRAINT tracks_file_path_key UNIQUE (file_path);

CREATE UNIQUE INDEX IF NOT EXISTS tracks_source_unique
  ON tracks (source_id)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tracks_created_idx
  ON tracks (created_at DESC);

CREATE INDEX IF NOT EXISTS tracks_artist_idx
  ON tracks (lower(artist), lower(title));

CREATE INDEX IF NOT EXISTS tracks_album_idx
  ON tracks (lower(album), track_number);

CREATE INDEX IF NOT EXISTS tracks_created_by_idx
  ON tracks (created_by);

ALTER TABLE playlists
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private'
  CHECK (visibility IN ('private', 'public'));

CREATE INDEX IF NOT EXISTS playlists_visibility_idx
  ON playlists (visibility, updated_at DESC);

CREATE TABLE IF NOT EXISTS playlist_shares (
  playlist_id uuid NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (playlist_id, user_id)
);

CREATE INDEX IF NOT EXISTS playlist_shares_user_idx
  ON playlist_shares (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS instance_settings (
  id                 boolean PRIMARY KEY DEFAULT true CHECK (id),
  allow_registration boolean NOT NULL DEFAULT false,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

INSERT INTO instance_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS instance_settings_set_updated_at ON instance_settings;
CREATE TRIGGER instance_settings_set_updated_at
  BEFORE UPDATE ON instance_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Existing installations get an admin. Fresh installations promote their
-- first registration in the auth route.
UPDATE users
SET user_type = 'admin'
WHERE id = (
  SELECT id FROM users ORDER BY created_at ASC LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM users WHERE user_type = 'admin');
