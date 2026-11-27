const path = require('path');
const fs = require('fs/promises');
const env = require('../config/env');
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

module.exports = { resolveMediaPath, removeTrackFiles };
