-- 005: personal music library ------------------------------------------------
-- Replaces the disposable Items demo. Existing local skeleton databases are
-- upgraded safely by dropping the old table.

DROP TABLE IF EXISTS items;

CREATE TABLE IF NOT EXISTS tracks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title             text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 500),
  artist            text NOT NULL DEFAULT 'Unknown artist'
                    CHECK (char_length(artist) BETWEEN 1 AND 500),
  album             text,
  album_artist      text,
  track_number      integer CHECK (track_number IS NULL OR track_number > 0),
  release_year      integer CHECK (release_year IS NULL OR release_year BETWEEN 1000 AND 3000),
  duration_seconds  numeric(12, 3) NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  genre             text,
  file_path         text NOT NULL,
  mime_type         text NOT NULL DEFAULT 'audio/mp4',
  file_size_bytes   bigint NOT NULL DEFAULT 0 CHECK (file_size_bytes >= 0),
  artwork_path      text,
  source_url        text,
  source_id         text,
  source_kind       text NOT NULL DEFAULT 'url'
                    CHECK (source_kind IN ('url', 'playlist', 'local')),
  is_favorite       boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, file_path)
);

CREATE UNIQUE INDEX IF NOT EXISTS tracks_user_source_unique
  ON tracks (user_id, source_id)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tracks_user_created_idx
  ON tracks (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tracks_user_artist_idx
  ON tracks (user_id, lower(artist), lower(title));

CREATE INDEX IF NOT EXISTS tracks_user_album_idx
  ON tracks (user_id, lower(album), track_number);

CREATE INDEX IF NOT EXISTS tracks_user_favorite_idx
  ON tracks (user_id, is_favorite, created_at DESC);

DROP TRIGGER IF EXISTS tracks_set_updated_at ON tracks;
CREATE TRIGGER tracks_set_updated_at
  BEFORE UPDATE ON tracks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS playlists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 180),
  description text CHECK (description IS NULL OR char_length(description) <= 1000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS playlists_user_created_idx
  ON playlists (user_id, created_at DESC);

DROP TRIGGER IF EXISTS playlists_set_updated_at ON playlists;
CREATE TRIGGER playlists_set_updated_at
  BEFORE UPDATE ON playlists
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id uuid NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id    uuid NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position    integer NOT NULL CHECK (position >= 0),
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (playlist_id, track_id)
);

CREATE INDEX IF NOT EXISTS playlist_tracks_order_idx
  ON playlist_tracks (playlist_id, position, added_at);

CREATE INDEX IF NOT EXISTS playlist_tracks_track_idx
  ON playlist_tracks (track_id);

CREATE TABLE IF NOT EXISTS play_history (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id         uuid REFERENCES tracks(id) ON DELETE SET NULL,
  played_at        timestamptz NOT NULL DEFAULT now(),
  position_seconds numeric(12, 3) NOT NULL DEFAULT 0,
  completed        boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS play_history_user_time_idx
  ON play_history (user_id, played_at DESC);

CREATE INDEX IF NOT EXISTS play_history_track_idx
  ON play_history (track_id);
