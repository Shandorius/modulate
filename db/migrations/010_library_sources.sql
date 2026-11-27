-- 010: read-only external library sources -----------------------------------

CREATE TABLE IF NOT EXISTS library_sources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL DEFAULT 'Music folder',
  root_path       text NOT NULL UNIQUE,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  scan_status     text NOT NULL DEFAULT 'idle'
                  CHECK (scan_status IN ('idle', 'running', 'completed', 'failed')),
  scan_error      text,
  scan_total      integer NOT NULL DEFAULT 0,
  scan_processed  integer NOT NULL DEFAULT 0,
  track_count     integer NOT NULL DEFAULT 0,
  added_count     integer NOT NULL DEFAULT 0,
  updated_count   integer NOT NULL DEFAULT 0,
  missing_count   integer NOT NULL DEFAULT 0,
  last_scan_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS library_sources_set_updated_at ON library_sources;
CREATE TRIGGER library_sources_set_updated_at
  BEFORE UPDATE ON library_sources
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE tracks
  ADD COLUMN IF NOT EXISTS library_source_id uuid REFERENCES library_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS storage_kind text NOT NULL DEFAULT 'managed'
    CHECK (storage_kind IN ('managed', 'external'));

CREATE INDEX IF NOT EXISTS tracks_library_source_idx
  ON tracks (library_source_id);

CREATE INDEX IF NOT EXISTS tracks_storage_kind_idx
  ON tracks (storage_kind, created_at DESC);
