const path = require('path');
const fs = require('fs/promises');
const env = require('../config/env');
const { pool } = require('../db/pool');

function resolveMediaPath(relativePath) {
  if (!relativePath) return null;
  const root = path.resolve(env.MEDIA_ROOT);
  const absolute = path.resolve(root, relativePath);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    return null;
  }
  return absolute;
}

async function pruneEmptyParents(start, root = env.MEDIA_ROOT) {
  const boundary = path.resolve(root);
  let current = path.resolve(start);
  while (current !== boundary && current.startsWith(`${boundary}${path.sep}`)) {
    const entries = await fs.readdir(current).catch(() => null);
    if (entries === null || entries.length > 0) return;
    await fs.rmdir(current).catch(() => {});
    current = path.dirname(current);
  }
}

async function removeTrackFiles(track) {
  const files = [track.file_path, track.artwork_path].filter(Boolean);
  let trackDirectory = null;
  for (const file of files) {
    const absolute = resolveMediaPath(file);
    if (!absolute) continue;
    if (!trackDirectory) trackDirectory = path.dirname(absolute);
    await fs.unlink(absolute).catch(() => {});
  }
  if (trackDirectory) {
    await fs.rm(trackDirectory, { recursive: true, force: true }).catch(() => {});
    await pruneEmptyParents(path.dirname(trackDirectory));
  }
}

async function removeTrackArtwork(track) {
  if (!track.artwork_path) return;
  const absolute = resolveMediaPath(track.artwork_path);
  if (!absolute) return;
  await fs.unlink(absolute).catch(() => {});
  await pruneEmptyParents(path.dirname(absolute));
}

async function resolveTrackAudio(track) {
  if (track.storage_kind === 'external' && track.library_source_id) {
    const { rows } = await pool.query(
      'SELECT root_path FROM library_sources WHERE id = $1',
      [track.library_source_id],
    );
    if (!rows[0]) return null;
    const root = path.resolve(rows[0].root_path);
    const absolute = path.resolve(root, track.file_path);
    if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
      return null;
    }
    return absolute;
  }
  return resolveMediaPath(track.file_path);
}

module.exports = {
  resolveMediaPath,
  resolveTrackAudio,
  removeTrackFiles,
  removeTrackArtwork,
  pruneEmptyParents,
};
