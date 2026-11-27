const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const env = require('../config/env');
const { pool } = require('../db/pool');

const AUDIO_EXTENSIONS = new Set([
  '.m4a',
  '.mp3',
  '.opus',
  '.ogg',
  '.webm',
  '.flac',
  '.wav',
  '.aac',
]);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

let timer = null;
let running = false;
let stopped = false;

function safeMessage(error) {
  const message = String(error?.message || error || 'Import failed.');
  return message.replace(/\s+/g, ' ').slice(0, 1000);
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });
    let output = '';
    const onData = (chunk) => {
      output += chunk.toString();
      if (output.length > 200_000) output = output.slice(-100_000);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(output.trim().split('\n').slice(-3).join(' ')));
    });
  });
}

async function updateJob(jobId, fields) {
  const mapping = {
    status: 'status',
    stage: 'stage',
    progress: 'progress',
    title: 'title',
    itemCount: 'item_count',
    resultCount: 'result_count',
    errorMessage: 'error_message',
    startedAt: 'started_at',
    finishedAt: 'finished_at',
  };
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(mapping)) {
    if (fields[key] !== undefined) {
      values.push(fields[key]);
      sets.push(`${column} = $${values.length}`);
    }
  }
  if (!sets.length) return;
  values.push(jobId);
  await pool.query(
    `UPDATE ingest_jobs SET ${sets.join(', ')} WHERE id = $${values.length}`,
    values,
  );
}

async function isCancelled(jobId) {
  const { rows } = await pool.query(
    'SELECT status FROM ingest_jobs WHERE id = $1',
    [jobId],
  );
  return rows[0]?.status === 'cancelled';
}

function outputTemplate(directory) {
  return path.join(
    directory,
    '%(playlist_index|00)s-%(id)s.%(ext)s',
  );
}

function yearFrom(value) {
  if (!value) return null;
  const match = String(value).match(/(\d{4})/);
  if (!match) return null;
  const year = Number(match[1]);
  return year >= 1000 && year <= 3000 ? year : null;
}

async function scanDownloadedFiles(directory, userId, job) {
  const names = await fs.readdir(directory);
  const infoFiles = names.filter((name) => name.endsWith('.info.json'));
  const tracks = [];
  const skipped = [];

  for (const infoFile of infoFiles) {
    const infoPath = path.join(directory, infoFile);
    const info = JSON.parse(await fs.readFile(infoPath, 'utf8'));
    const base = infoFile.slice(0, -'.info.json'.length);
    const audioName = names.find((name) => {
      const extension = path.extname(name).toLowerCase();
      return name.startsWith(base) && AUDIO_EXTENSIONS.has(extension);
    });
    if (!audioName) continue;

    const trackId = crypto.randomUUID();
    const trackDir = path.join(env.MEDIA_ROOT, userId, trackId);
    await fs.mkdir(trackDir, { recursive: true, mode: 0o750 });

    const audioExtension = path.extname(audioName).toLowerCase();
    const audioTarget = path.join(trackDir, `audio${audioExtension}`);
    await fs.rename(path.join(directory, audioName), audioTarget);

    let artworkTarget = null;
    let artworkRelative = null;
    const imageName = names.find((name) => {
      const extension = path.extname(name).toLowerCase();
      return name.startsWith(base) && IMAGE_EXTENSIONS.has(extension);
    });
    if (imageName) {
      const imageExtension = path.extname(imageName).toLowerCase();
      artworkTarget = path.join(trackDir, `cover${imageExtension}`);
      await fs.rename(path.join(directory, imageName), artworkTarget);
      artworkRelative = path.posix.join(
        userId,
        trackId,
        `cover${imageExtension}`,
      );
    }

    const title = String(
      info.track || info.title || info.id || 'Untitled track',
    ).slice(0, 500);
    const artist = String(
      info.artist ||
        info.creator ||
        info.album_artist ||
        info.uploader ||
        'Unknown artist',
    ).slice(0, 500);
    const album = info.album || info.playlist_title || null;
    const albumArtist = info.album_artist || info.playlist_uploader || null;
    const trackNumber =
      Number(info.track_number || info.playlist_index) || null;
    const releaseYear = yearFrom(info.release_year || info.upload_date);
    const duration = Number(info.duration) || 0;
    const sourceId = info.id ? String(info.id) : null;
    const sourceUrl = info.webpage_url || job.source_url;

    const relativeAudio = path.posix.join(
      userId,
      trackId,
      `audio${audioExtension}`,
    );
    const stat = await fs.stat(audioTarget);
    const values = [
      trackId,
      userId,
      title,
      artist,
      album,
      albumArtist,
      trackNumber,
      releaseYear,
      duration,
      relativeAudio,
      audioExtension === '.mp3' ? 'audio/mpeg' : 'audio/mp4',
      stat.size,
      artworkRelative,
      sourceUrl,
      sourceId,
      job.source_kind === 'playlist' ? 'playlist' : 'url',
    ];
    let rows;
    try {
      ({ rows } = await pool.query(
        `INSERT INTO tracks (
           id, created_by, title, artist, album, album_artist, track_number,
           release_year, duration_seconds, file_path, mime_type, file_size_bytes,
           artwork_path, source_url, source_id, source_kind
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
         )
         ON CONFLICT (source_id) WHERE source_id IS NOT NULL
         DO NOTHING
         RETURNING id`,
        values,
      ));
    } catch (error) {
      await fs.rm(trackDir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }

    if (rows[0]) {
      tracks.push({ id: rows[0].id, title });
    } else {
      skipped.push(title);
      await fs.rm(trackDir, { recursive: true, force: true });
    }
  }

  return { tracks, skipped };
}

async function processJob(job) {
  const started = Date.now();
  const tempDir = path.join(
    env.MEDIA_ROOT,
    job.user_id,
    `import-${job.id}`,
  );
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true, mode: 0o750 });

  await updateJob(job.id, {
    status: 'running',
    stage: 'Contacting the source',
    progress: 2,
  });

  const args = [
    '--no-warnings',
    '--newline',
    '--progress',
    '--extract-audio',
    '--audio-format',
    'm4a',
    '--audio-quality',
    '0',
    '--embed-metadata',
    '--write-info-json',
    '--write-thumbnail',
    '--no-overwrites',
    '--restrict-filenames',
    '--playlist-end',
    String(env.MAX_INGEST_ITEMS),
    '-o',
    outputTemplate(tempDir),
  ];
  if (path.isAbsolute(env.FFMPEG_PATH)) {
    args.push('--ffmpeg-location', env.FFMPEG_PATH);
  }
  if (job.source_kind === 'track') args.push('--no-playlist');
  if (job.source_kind === 'playlist') args.push('--yes-playlist');
  args.push(job.source_url);

  let lastUpdate = 0;
  let lastProgress = 2;
  const stdout = await new Promise((resolve, reject) => {
    const child = spawn(env.YTDLP_PATH, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let stderr = '';
    const inspect = (chunk, isError = false) => {
      const text = chunk.toString();
      output += text;
      if (output.length > 300_000) output = output.slice(-150_000);
      if (isError) stderr += text;
      const matches = [...text.matchAll(/\[download\]\s+(\d+(?:\.\d+)?)%/g)];
      const match = matches.at(-1);
      if (match) {
        const percent = Math.min(92, Math.max(3, Number(match[1])));
        if (percent >= lastProgress + 2 || Date.now() - lastUpdate > 1200) {
          lastProgress = percent;
          lastUpdate = Date.now();
          void updateJob(job.id, {
            progress: Math.round(percent),
            stage: 'Downloading audio',
          });
        }
      }
    };
    child.stdout.on('data', (chunk) => inspect(chunk, false));
    child.stderr.on('data', (chunk) => inspect(chunk, true));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(output);
      else {
        reject(
          new Error(
            (stderr || output || 'yt-dlp exited with an error')
              .trim()
              .split('\n')
              .slice(-4)
              .join(' '),
          ),
        );
      }
    });
  });
  void stdout;

  if (await isCancelled(job.id)) {
    await fs.rm(tempDir, { recursive: true, force: true });
    return;
  }

  await updateJob(job.id, {
    progress: 94,
    stage: 'Reading metadata and artwork',
  });

  const { tracks: imported, skipped } = await scanDownloadedFiles(
    tempDir,
    job.user_id,
    job,
  );
  await fs.rm(tempDir, { recursive: true, force: true });

  if (!imported.length) {
    if (skipped.length) {
      await updateJob(job.id, {
        status: 'completed',
        stage: 'Already in the library',
        progress: 100,
        title: skipped.length === 1 ? skipped[0] : `${skipped.length} tracks already present`,
        itemCount: 0,
        resultCount: 0,
        finishedAt: new Date(),
        errorMessage: null,
      });
      return;
    }
    throw new Error('No playable audio was found at that URL.');
  }

  await updateJob(job.id, {
    status: 'completed',
    stage: 'Ready in the library',
    progress: 100,
    title: imported.length === 1 ? imported[0].title : `${imported.length} tracks`,
    itemCount: imported.length,
    resultCount: imported.length,
    finishedAt: new Date(),
    errorMessage: null,
  });

  console.log(
    `[ingest] completed ${job.id} in ${Math.round((Date.now() - started) / 1000)}s (${imported.length} new, ${skipped.length} existing)`,
  );
}

async function claimJob() {
  const { rows } = await pool.query(
    `UPDATE ingest_jobs
     SET status = 'running', started_at = now(), stage = 'Starting',
         progress = 1, error_message = NULL
     WHERE id = (
       SELECT id FROM ingest_jobs
       WHERE status = 'queued'
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
  );
  return rows[0] || null;
}

async function tick() {
  if (running || stopped) return;
  running = true;
  try {
    const job = await claimJob();
    if (!job) return;
    try {
      await processJob(job);
    } catch (error) {
      console.error(`[ingest] job ${job.id} failed:`, safeMessage(error));
      await updateJob(job.id, {
        status: 'failed',
        stage: 'Could not import',
        errorMessage: safeMessage(error),
        finishedAt: new Date(),
      }).catch(() => {});
    }
  } catch (error) {
    console.error('[ingest] worker error:', safeMessage(error));
  } finally {
    running = false;
  }
}

async function start() {
  if (!env.INGEST_WORKER_ENABLED) return;
  await fs.mkdir(env.MEDIA_ROOT, { recursive: true, mode: 0o750 }).catch(() => {});
  await pool
    .query(
      `UPDATE ingest_jobs
       SET status = 'queued', stage = 'Waiting to resume', progress = 0
       WHERE status = 'running'
         AND started_at < now() - interval '30 minutes'`,
    )
    .catch(() => {});
  stopped = false;
  timer = setInterval(() => void tick(), 2500);
  void tick();
  console.log('[ingest] worker started');
}

async function stop() {
  stopped = true;
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick, processJob };
