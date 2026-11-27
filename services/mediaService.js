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
  }
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

module.exports = { resolveMediaPath, resolveTrackAudio, removeTrackFiles };
