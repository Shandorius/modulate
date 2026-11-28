const express = require('express');
const fs = require('fs');
const path = require('path');
const mediaService = require('../services/mediaService');
const subsonic = require('../services/subsonicService');
const { APP_NAME } = require('../config/env');

const router = express.Router();

function envelope(payload = {}) {
  return {
    'subsonic-response': {
      status: 'ok',
      version: subsonic.API_VERSION,
      type: subsonic.SERVER_TYPE,
      serverVersion: '1.0.0',
      openSubsonic: true,
      ...payload,
    },
  };
}

function failure(res, code, message) {
  return res.status(200).json({
    'subsonic-response': {
      status: 'failed',
      version: subsonic.API_VERSION,
      type: subsonic.SERVER_TYPE,
      serverVersion: '1.0.0',
      openSubsonic: true,
      error: { code, message },
    },
  });
}

function readParams(req) {
  return { ...(req.query || {}), ...(req.body || {}) };
}

async function resolveUser(req, params) {
  const mobile = req.app?.locals?.auth?.mobile;
  if (!mobile?.repository?.findActiveByHash) {
    return { error: { code: 0, message: 'Bearer tokens are unavailable.' } };
  }

  const apiKey = params.apiKey;
  if (Array.isArray(apiKey)) {
    return {
      error: { code: 43, message: 'Multiple conflicting authentication mechanisms provided.' },
    };
  }
  if (!apiKey) {
    return {
      error: {
        code: 44,
        message:
          'An API key is required. Create one in Modulate under Settings → Integrations.',
      },
    };
  }
  if (params.u !== undefined) {
    return {
      error: { code: 43, message: 'API keys cannot be combined with a username.' },
    };
  }
  if (params.t !== undefined || params.s !== undefined || params.p !== undefined) {
    return {
      error: {
        code: 43,
        message: 'Provide either an API key or a username and password, not both.',
      },
    };
  }

  const found = await mobile.repository.findActiveByHash(
    mobile.tokens.hashToken(String(apiKey)),
  );
  if (!found?.user?.id) {
    return {
      error: {
        code: 44,
        message:
          'Invalid or expired API key. Create a new one in Modulate under Settings → Integrations.',
      },
    };
  }
  return { user: found.user };
}

function sendArtwork(res, absolute) {
  const extension = path.extname(absolute).toLowerCase();
  const type =
    extension === '.png'
      ? 'image/png'
      : extension === '.webp'
        ? 'image/webp'
        : 'image/jpeg';
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return res.sendFile(absolute, { headers: { 'Content-Type': type } });
}

async function sendStream(res, track) {
  const absolute = await mediaService.resolveTrackAudio(track);
  if (!absolute || !fs.existsSync(absolute)) {
    return failure(res, 70, 'Audio file not found.');
  }
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
  return res.sendFile(absolute, {
    headers: { 'Content-Type': track.mime_type || 'audio/mp4' },
  });
}

router.all('/:method', async (req, res) => {
  const params = readParams(req);
  const method = String(req.params.method || '').replace(/\.view$/, '');

  let authenticated;
  try {
    authenticated = await resolveUser(req, params);
  } catch (error) {
    console.error('[subsonic] authentication failed:', error.message);
    return failure(res, 0, `${APP_NAME} could not verify that API key.`);
  }
  if (authenticated.error) {
    return failure(res, authenticated.error.code, authenticated.error.message);
  }
  const user = authenticated.user;
  const userId = user.id;

  try {
    if (method === 'ping') {
      return res.json(envelope());
    }

    if (method === 'getLicense') {
      return res.json(envelope({ license: { valid: true } }));
    }

    if (method === 'getOpenSubsonicExtensions') {
      return res.json(
        envelope({
          openSubsonicExtensions: [
            { name: 'apiKeyAuthentication', versions: [1] },
          ],
        }),
      );
    }

    if (method === 'getMusicFolders') {
      return res.json(
        envelope({
          musicFolders: {
            musicFolder: [{ id: 1, name: 'Shared library' }],
          },
        }),
      );
    }

    if (method === 'getArtists') {
      return res.json(envelope({ artists: await subsonic.listArtists() }));
    }

    if (method === 'getArtist') {
      const artist = await subsonic.getArtist(userId, params.id);
      if (!artist) return failure(res, 70, 'Artist not found.');
      return res.json(envelope({ artist }));
    }

    if (method === 'getArtistInfo2') {
      return res.json(envelope({ artistInfo2: {} }));
    }

    if (method === 'getAlbum') {
      const album = await subsonic.getAlbum(userId, params.id);
      if (!album) return failure(res, 70, 'Album not found.');
      return res.json(envelope({ album }));
    }

    if (method === 'getAlbumInfo2') {
      return res.json(envelope({ albumInfo: {} }));
    }

    if (method === 'getAlbumList2') {
      return res.json(
        envelope({
          albumList2: { album: await subsonic.listAlbums(userId, params) },
        }),
      );
    }

    if (method === 'getSong') {
      const song = await subsonic.getSong(userId, params.id);
      if (!song) return failure(res, 70, 'Song not found.');
      return res.json(envelope({ song }));
    }

    if (method === 'search3') {
      return res.json(
        envelope({ searchResult3: await subsonic.search(userId, params) }),
      );
    }

    if (method === 'getPlaylists') {
      return res.json(
        envelope({ playlists: { playlist: await subsonic.listPlaylists(userId) } }),
      );
    }

    if (method === 'getPlaylist') {
      const playlist = await subsonic.getPlaylist(userId, params.id);
      if (!playlist) {
        return failure(res, 50, 'You do not have access to that playlist.');
      }
      return res.json(envelope({ playlist }));
    }

    if (method === 'getLyrics') {
      // Music Assistant's Open Subsonic provider probes the legacy lyrics
      // endpoint while parsing a track. It only tolerates a not-found answer
      // (code 70); a generic error aborts playback. Modulate has no lyrics
      // store, so "not found" is the honest response.
      return failure(res, 70, 'Lyrics not found.');
    }

    if (method === 'getLyricsBySongId') {
      return res.json(envelope({ lyricsList: { structuredLyrics: [] } }));
    }

    if (method === 'getStarred2') {
      return res.json(envelope({ starred2: await subsonic.starred(userId) }));
    }

    if (method === 'getTopSongs') {
      return res.json(envelope({ topSongs: {} }));
    }

    if (method === 'getSimilarSongs') {
      return res.json(envelope({ similarSongs: {} }));
    }

    if (method === 'getCoverArt') {
      const artworkPath = await subsonic.coverArtPath(params.id);
      const absolute = artworkPath
        ? mediaService.resolveMediaPath(artworkPath)
        : null;
      if (!absolute || !fs.existsSync(absolute)) {
        return res.status(404).end();
      }
      return sendArtwork(res, absolute);
    }

    if (method === 'stream') {
      const track = await subsonic.streamTrack(params.id);
      if (!track) return failure(res, 70, 'Song not found.');
      return sendStream(res, track);
    }

    return failure(res, 0, `Endpoint “${method}” is not supported by ${APP_NAME}.`);
  } catch (error) {
    console.error(`[subsonic] ${method} failed:`, error);
    return failure(res, 0, 'The server could not complete this request.');
  }
});

module.exports = router;
