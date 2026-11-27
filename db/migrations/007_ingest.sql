-- 007: yt-dlp ingestion jobs ------------------------------------------------

CREATE TABLE IF NOT EXISTS ingest_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_url    text NOT NULL,
  source_kind   text NOT NULL DEFAULT 'auto'
                CHECK (source_kind IN ('auto', 'track', 'playlist')),
  status        text NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  stage         text NOT NULL DEFAULT 'Waiting',
  progress      smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  title         text,
  item_count    integer NOT NULL DEFAULT 0,
  result_count  integer NOT NULL DEFAULT 0,
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  finished_at   timestamptz
);

CREATE INDEX IF NOT EXISTS ingest_jobs_user_created_idx
  ON ingest_jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ingest_jobs_status_idx
  ON ingest_jobs (status, created_at);
