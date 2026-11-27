const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const env = require('../config/env');
const { pool } = require('../db/pool');
const { conflict } = require('./errors');

const execFileAsync = promisify(execFile);

const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.m4a',
  '.flac',
  '.ogg',
  '.opus',
  '.wav',
  '.aac',
  '.webm',
  '.mp4',
]);
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const SIDECAR_NAMES = ['cover', 'folder', 'front', 'album'];

function presentSource(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    rootPath: row.root_path,
    status: row.scan_status,
    error: row.scan_error,
    total: row.scan_total,
    processed: row.scan_processed,
    trackCount: row.track_count,
    addedCount: row.added_count,
    updatedCount: row.updated_count,
    missingCount: row.missing_count,
    lastScanAt: row.last_scan_at,
  };
}

async function ensureSource(userId) {
  await pool.query(
    `INSERT INTO library_sources (name, root_path, created_by)
     VALUES ('Music folder', $1, $2)
     ON CONFLICT (root_path) DO NOTHING`,
    [env.MUSIC_ROOT, userId],
  );
  const { rows } = await pool.query(
    'SELECT * FROM library_sources WHERE root_path = $1',
    [env.MUSIC_ROOT],
  );
  return rows[0];
}

async function getStatus() {
  const source = await ensureSource(null);
  return presentSource(source);
}

async function startScan(userId) {
  const source = await ensureSource(userId);
  if (source.scan_status === 'running') {
    throw conflict('A library scan is already running.');
  }
  await pool.query(
    `UPDATE library_sources
     SET scan_status = 'running', scan_error = NULL, scan_total = 0,
         scan_processed = 0, added_count = 0, updated_count = 0,
         missing_count = 0
     WHERE id = $1`,
    [source.id],
  );
  void runScan(source).catch((error) => {
    console.error('[library] scan failed:', error.message);
  });
  return presentSource({
    ...source,
    scan_status: 'running',
    scan_error: null,
    scan_total: 0,
    scan_processed: 0,
    added_count: 0,
    updated_count: 0,
    missing_count: 0,
  });
}

function normalizeTag(tags, key) {
  if (!tags) return null;
  const found = Object.entries(tags).find(
    ([name]) => name.toLowerCase() === key.toLowerCase(),
  );
  return found ? String(found[1]) : null;
}

function parseNumber(value) {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : null;
}

function parseYear(value) {
  const match = String(value || '').match(/(\d{4})/);
  if (!match) return null;
  const year = Number(match[1]);
  return year >= 1000 && year <= 3000 ? year : null;
}

function mimeType(extension) {
  if (extension === '.mp3') return 'audio/mpeg';
  if (extension === '.flac') return 'audio/flac';
  if (extension === '.ogg' || extension === '.opus') return 'audio/ogg';
  if (extension === '.wav') return 'audio/wav';
  if (extension === '.aac') return 'audio/aac';
  if (extension === '.webm') return 'audio/webm';
  return 'audio/mp4';
}

async function probe(filePath) {
  try {
    const { stdout } = await execFileAsync(
      env.FFPROBE_PATH,
      [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        filePath,
      ],
      { timeout: 20_000, maxBuffer: 4 * 1024 * 1024 },
    );
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

async function copyArtwork(source, relativePath, trackId, info) {
  const absolute = path.join(source.root_path, relativePath);
  const directory = path.dirname(absolute);
  const base = path.basename(absolute, path.extname(absolute));
  const candidates = [];
  for (const name of SIDECAR_NAMES) {
    for (const extension of IMAGE_EXTENSIONS) {
      candidates.push(path.join(directory, `${name}${extension}`));
    }
  }
  for (const extension of IMAGE_EXTENSIONS) {
    candidates.push(path.join(directory, `${base}${extension}`));
  }

  const artDirectory = path.join(
    env.MEDIA_ROOT,
    'external-art',
    source.id,
  );
  await fs.mkdir(artDirectory, { recursive: true, mode: 0o750 });

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (!stat.isFile()) continue;
      const extension = path.extname(candidate).toLowerCase();
      const target = path.join(artDirectory, `${trackId}${extension}`);
      await fs.copyFile(candidate, target);
      return path.posix.join(
        'external-art',
        source.id,
        `${trackId}${extension}`,
      );
    } catch {
      // Try the next candidate.
    }
  }

  // No sidecar artwork: try to extract embedded cover art.
  const tags = info?.format?.tags;
  const hasImageStream =
    Array.isArray(info?.streams) &&
    info.streams.some((stream) => stream.codec_type === 'video');
  if (hasImageStream) {
    const target = path.join(artDirectory, `${trackId}.jpg`);
    try {
      await execFileAsync(
        env.FFMPEG_PATH,
        [
          '-y',
          '-v',
          'error',
          '-i',
          absolute,
          '-map',
          '0:v:0',
          '-frames:v',
          '1',
          '-q:v',
          '2',
          target,
        ],
        { timeout: 20_000 },
      );
      return path.posix.join('external-art', source.id, `${trackId}.jpg`);
    } catch {
      await fs.unlink(target).catch(() => {});
    }
  }
  void tags;
  return null;
}

async function importFile(source, relativePath, userId) {
  const absolute = path.join(source.root_path, relativePath);
  const stat = await fs.stat(absolute).catch(() => null);
  if (!stat?.isFile()) return { added: 0, updated: 0 };

  const extension = path.extname(absolute).toLowerCase();
  if (!AUDIO_EXTENSIONS.has(extension)) return { added: 0, updated: 0 };

  const info = await probe(absolute);
  const tags = info?.format?.tags || {};
  const fallbackTitle = path.basename(absolute, extension);
  const title = String(normalizeTag(tags, 'title') || fallbackTitle).slice(0, 500);
  const artist = String(
    normalizeTag(tags, 'artist') ||
      normalizeTag(tags, 'album_artist') ||
      'Unknown artist',
  ).slice(0, 500);
  const album = normalizeTag(tags, 'album');
  const albumArtist = normalizeTag(tags, 'album_artist');
  const trackNumber = parseNumber(normalizeTag(tags, 'track'));
  const releaseYear = parseYear(
    normalizeTag(tags, 'date') || normalizeTag(tags, 'year'),
  );
  const genre = normalizeTag(tags, 'genre');
  const duration = Number(info?.format?.duration) || 0;
  const sourceId = `local:${crypto
    .createHash('sha256')
    .update(relativePath)
    .digest('hex')
    .slice(0, 40)}`;

  const existing = await pool.query(
    'SELECT id FROM tracks WHERE source_id = $1 LIMIT 1',
    [sourceId],
  );
  const trackId = existing.rows[0]?.id || crypto.randomUUID();
  const artworkPath = await copyArtwork(
    source,
    relativePath,
    trackId,
    info,
  );

  const { rows } = await pool.query(
    `INSERT INTO tracks (
       id, created_by, title, artist, album, album_artist, track_number,
       release_year, duration_seconds, genre, file_path, mime_type,
       file_size_bytes, artwork_path, source_url, source_id, source_kind,
       library_source_id, storage_kind
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
       'local',$17,'external'
     )
     ON CONFLICT (source_id) WHERE source_id IS NOT NULL
     DO UPDATE SET
       title = EXCLUDED.title,
       artist = EXCLUDED.artist,
       album = EXCLUDED.album,
       album_artist = EXCLUDED.album_artist,
       track_number = EXCLUDED.track_number,
       release_year = EXCLUDED.release_year,
       duration_seconds = EXCLUDED.duration_seconds,
       genre = EXCLUDED.genre,
       file_path = EXCLUDED.file_path,
       mime_type = EXCLUDED.mime_type,
       file_size_bytes = EXCLUDED.file_size_bytes,
       artwork_path = COALESCE(EXCLUDED.artwork_path, tracks.artwork_path),
       library_source_id = EXCLUDED.library_source_id,
       storage_kind = 'external'
     RETURNING id, (xmax = 0) AS inserted`,
    [
      trackId,
      userId,
      title,
      artist,
      album,
      albumArtist,
      trackNumber,
      releaseYear,
      duration,
      genre,
      relativePath,
      mimeType(extension),
      stat.size,
      artworkPath,
      `library:${relativePath}`,
      sourceId,
      source.id,
    ],
  );
  return rows[0]?.inserted
    ? { added: 1, updated: 0 }
    : { added: 0, updated: 1 };
}

async function walk(root, directory, files) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(root, absolute, files);
    } else if (entry.isFile()) {
      const extension = path.extname(entry.name).toLowerCase();
      if (AUDIO_EXTENSIONS.has(extension)) {
        files.push(path.relative(root, absolute).split(path.sep).join('/'));
      }
    }
  }
}

async function runScan(source) {
  try {
    const stat = await fs.stat(source.root_path).catch(() => null);
    if (!stat?.isDirectory()) {
      throw new Error(
        `Music folder ${source.root_path} is not mounted or is not a directory.`,
      );
    }

    const files = [];
    await walk(source.root_path, source.root_path, files);
    files.sort();

    await pool.query(
      `UPDATE library_sources
       SET scan_total = $1, scan_processed = 0
       WHERE id = $2`,
      [files.length, source.id],
    );

    let added = 0;
    let updated = 0;
    for (let index = 0; index < files.length; index += 1) {
      const result = await importFile(source, files[index], source.created_by);
      added += result.added;
      updated += result.updated;
      if ((index + 1) % 10 === 0 || index === files.length - 1) {
        await pool.query(
          `UPDATE library_sources
           SET scan_processed = $1, added_count = $2, updated_count = $3
           WHERE id = $4`,
          [index + 1, added, updated, source.id],
        );
      }
    }

    const { rows: known } = await pool.query(
      `SELECT file_path FROM tracks
       WHERE library_source_id = $1 AND storage_kind = 'external'`,
      [source.id],
    );
    const seen = new Set(files);
    const missing = known.filter((row) => !seen.has(row.file_path)).length;

    await pool.query(
      `UPDATE library_sources
       SET scan_status = 'completed', scan_error = NULL,
           scan_processed = $1, track_count = $2, added_count = $3,
           updated_count = $4, missing_count = $5,
           last_scan_at = now()
       WHERE id = $6`,
      [files.length, files.length, added, updated, missing, source.id],
    );
    console.log(
      `[library] scan complete: ${files.length} files, ${added} added, ${updated} updated, ${missing} missing`,
    );
  } catch (error) {
    await pool.query(
      `UPDATE library_sources
       SET scan_status = 'failed', scan_error = $1
       WHERE id = $2`,
      [String(error.message || error).slice(0, 1000), source.id],
    ).catch(() => {});
    throw error;
  }
}

module.exports = {
  presentSource,
  getStatus,
  startScan,
  runScan,
  AUDIO_EXTENSIONS,
};
