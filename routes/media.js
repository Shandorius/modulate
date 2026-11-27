const express = require('express');
const fs = require('fs');
const path = require('path');
const { pool } = require('../db/pool');
const mediaTokenService = require('../services/mediaTokenService');
const mediaService = require('../services/mediaService');

const router = express.Router();

async function signedTrack(req, kind) {
  const { trackId } = req.params;
  const { exp, sig } = req.query;
  const { rows } = await pool.query(
    'SELECT id, file_path, artwork_path, mime_type FROM tracks WHERE id = $1',
    [trackId],
  );
  const track = rows[0];
  if (!track) return null;
  if (!mediaTokenService.verify(kind, 'library', track.id, exp, sig)) {
    return null;
  }
  return track;
}

router.get('/stream/:trackId', async (req, res, next) => {
  try {
    const track = await signedTrack(req, 'stream');
    if (!track) {
      return res
        .status(403)
        .json({ error: { code: 'INVALID_STREAM', message: 'This media link has expired.' } });
    }
    const absolute = mediaService.resolveMediaPath(track.file_path);
    if (!absolute || !fs.existsSync(absolute)) {
      return res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'Audio file not found.' } });
    }
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    return res.sendFile(absolute, {
      headers: { 'Content-Type': track.mime_type || 'audio/mp4' },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/artwork/:trackId', async (req, res, next) => {
  try {
    const track = await signedTrack(req, 'artwork');
    if (!track || !track.artwork_path) {
      return res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'Artwork not found.' } });
    }
    const absolute = mediaService.resolveMediaPath(track.artwork_path);
    if (!absolute || !fs.existsSync(absolute)) {
      return res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'Artwork not found.' } });
    }
    const extension = path.extname(absolute).toLowerCase();
    const type =
      extension === '.png'
        ? 'image/png'
        : extension === '.webp'
          ? 'image/webp'
          : 'image/jpeg';
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.sendFile(absolute, { headers: { 'Content-Type': type } });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
