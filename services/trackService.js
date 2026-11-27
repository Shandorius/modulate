const { pool, withTransaction } = require('../db/pool');
const { badRequest, forbidden, notFound } = require('./errors');
const mediaTokenService = require('./mediaTokenService');
const mediaService = require('./mediaService');

const SORTS = new Map([
  ['recent', 't.created_at DESC'],
  ['title', 'lower(t.title) ASC, lower(t.artist) ASC'],
  ['artist', 'lower(t.artist) ASC, lower(t.title) ASC'],
  [
    'album',
    'lower(t.album) ASC NULLS LAST, t.track_number ASC NULLS LAST, lower(t.title) ASC',
  ],
]);

function presentTrack(row, baseUrl = '') {
  if (!row) return null;
  const streamUrl = mediaTokenService.signedPath('stream', 'library', row.id);
  const artworkUrl = row.artwork_path
    ? mediaTokenService.signedPath('artwork', 'library', row.id)
    : null;

  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    albumArtist: row.album_artist,
    trackNumber: row.track_number,
    releaseYear: row.release_year,
    durationSeconds: Number(row.duration_seconds || 0),
    genre: row.genre,
    mimeType: row.mime_type,
    fileSizeBytes: Number(row.file_size_bytes || 0),
    isFavorite: Boolean(row.is_favorite),
    createdBy: row.created_by,
    storageKind: row.storage_kind || 'managed',
    sourceUrl: row.source_url,
    sourceKind: row.source_kind,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    streamUrl: `${baseUrl}${streamUrl}`,
    artworkUrl: artworkUrl ? `${baseUrl}${artworkUrl}` : null,
  };
}

async function getRawRow(trackId, db = pool) {
  const { rows } = await db.query('SELECT * FROM tracks WHERE id = $1', [
    trackId,
  ]);
  return rows[0] || null;
}

async function get(userId, trackId, baseUrl = '') {
  const { rows } = await pool.query(
    `SELECT t.*,
            EXISTS (
              SELECT 1 FROM track_favorites f
              WHERE f.track_id = t.id AND f.user_id = $2
            ) AS is_favorite
     FROM tracks t WHERE t.id = $1`,
    [trackId, userId],
  );
  if (!rows[0]) throw notFound('Track not found.');
  return presentTrack(rows[0], baseUrl);
}

async function list(userId, input = {}, baseUrl = '') {
  const limit = Math.min(Math.max(Number(input.limit) || 100, 1), 200);
  const offset = Math.max(Number(input.offset) || 0, 0);
  const query = String(input.q || '').trim();
  const favorite =
    input.favorite === true || String(input.favorite) === 'true'
      ? true
      : input.favorite === false || String(input.favorite) === 'false'
        ? false
        : null;
  const sort = SORTS.has(input.sort) ? input.sort : 'recent';

  const values = [userId];
  const where = ['$1::uuid IS NOT NULL'];

  if (query) {
    values.push(`%${query}%`);
    const index = values.length;
    where.push(
      `(t.title ILIKE $${index} OR t.artist ILIKE $${index} OR COALESCE(t.album, '') ILIKE $${index})`,
    );
  }
  if (favorite !== null) {
    values.push(favorite);
    where.push(
      `EXISTS (
         SELECT 1 FROM track_favorites f
         WHERE f.track_id = t.id AND f.user_id = $1
       ) = $${values.length}`,
    );
  }

  values.push(limit);
  const limitIndex = values.length;
  values.push(offset);
  const offsetIndex = values.length;

  const { rows } = await pool.query(
    `SELECT t.*,
            EXISTS (
              SELECT 1 FROM track_favorites f
              WHERE f.track_id = t.id AND f.user_id = $1
            ) AS is_favorite
     FROM tracks t
     WHERE ${where.join(' AND ')}
     ORDER BY ${SORTS.get(sort)}
     LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values,
  );

  const countValues = values.slice(0, values.length - 2);
  const { rows: countRows } = await pool.query(
    `SELECT count(*)::int AS total FROM tracks t WHERE ${where.join(' AND ')}`,
    countValues,
  );

  return {
    tracks: rows.map((row) => presentTrack(row, baseUrl)),
    total: countRows[0]?.total || 0,
  };
}

async function albums(userId, baseUrl = '') {
  const { rows } = await pool.query(
    `SELECT album,
            COALESCE(album_artist, artist, 'Unknown artist') AS artist,
            count(*)::int AS track_count,
            COALESCE(sum(duration_seconds), 0) AS duration_seconds,
            (array_agg(id ORDER BY track_number NULLS LAST, created_at))[1] AS sample_track_id,
            (array_remove(array_agg(artwork_path ORDER BY artwork_path NULLS LAST), NULL))[1] AS artwork_path,
            max(created_at) AS created_at
     FROM tracks
     WHERE album IS NOT NULL AND btrim(album) <> ''
     GROUP BY album, COALESCE(album_artist, artist, 'Unknown artist')
     ORDER BY max(created_at) DESC`,
  );
  return rows.map((row) => ({
    album: row.album,
    artist: row.artist,
    trackCount: row.track_count,
    durationSeconds: Number(row.duration_seconds),
    sampleTrackId: row.sample_track_id,
    artworkUrl: row.artwork_path
      ? `${baseUrl}${mediaTokenService.signedPath('artwork', 'library', row.sample_track_id)}`
      : null,
    createdAt: row.created_at,
  }));
}

async function byAlbum(userId, album, baseUrl = '') {
  const { rows } = await pool.query(
    `SELECT t.*,
            EXISTS (
              SELECT 1 FROM track_favorites f
              WHERE f.track_id = t.id AND f.user_id = $2
            ) AS is_favorite
     FROM tracks t
     WHERE t.album = $1
     ORDER BY t.track_number ASC NULLS LAST, lower(t.title) ASC`,
    [album, userId],
  );
  return rows.map((row) => presentTrack(row, baseUrl));
}

async function update(userId, trackId, input, isAdmin = false) {
  const row = await getRawRow(trackId);
  if (!row) throw notFound('Track not found.');

  const canEditMetadata =
    isAdmin || (row.created_by && row.created_by === userId);
  const metadataKeys = [
    'title',
    'artist',
    'album',
    'albumArtist',
    'trackNumber',
    'releaseYear',
    'genre',
  ];
  const hasMetadata = metadataKeys.some((key) => input[key] !== undefined);
  if (hasMetadata && !canEditMetadata) {
    throw forbidden('Only the importer or an administrator can edit this track.');
  }

  await withTransaction(async (client) => {
    if (input.isFavorite !== undefined) {
      if (input.isFavorite) {
        await client.query(
          `INSERT INTO track_favorites (user_id, track_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [userId, trackId],
        );
      } else {
        await client.query(
          'DELETE FROM track_favorites WHERE user_id = $1 AND track_id = $2',
          [userId, trackId],
        );
      }
    }

    if (hasMetadata) {
      const mapping = {
        title: 'title',
        artist: 'artist',
        album: 'album',
        albumArtist: 'album_artist',
        trackNumber: 'track_number',
        releaseYear: 'release_year',
        genre: 'genre',
      };
      const sets = [];
      const values = [];
      for (const [key, column] of Object.entries(mapping)) {
        if (input[key] !== undefined) {
          values.push(input[key]);
          sets.push(`${column} = $${values.length}`);
        }
      }
      if (sets.length) {
        values.push(trackId);
        await client.query(
          `UPDATE tracks SET ${sets.join(', ')}
           WHERE id = $${values.length}`,
          values,
        );
      }
    }
  });

  return get(userId, trackId);
}

async function remove(userId, trackId, isAdmin = false) {
  const row = await getRawRow(trackId);
  if (!row) throw notFound('Track not found.');
  if (!isAdmin && row.created_by && row.created_by !== userId) {
    throw forbidden('Only the importer or an administrator can delete this track.');
  }
  if (!isAdmin && !row.created_by) {
    throw forbidden('Only an administrator can delete this library track.');
  }
  if (row.storage_kind === 'external' && !isAdmin) {
    throw forbidden('Only an administrator can remove scanned library tracks.');
  }
  await pool.query('DELETE FROM tracks WHERE id = $1', [trackId]);
  if (row.storage_kind === 'external') {
    // Remove only the copied artwork. The read-only source audio stays.
    await mediaService.removeTrackArtwork(row);
  } else {
    await mediaService.removeTrackFiles(row);
  }
  return { id: trackId, storageKind: row.storage_kind || 'managed' };
}

async function summary(userId, baseUrl = '') {
  const [{ rows: counts }, { rows: recent }, { rows: favorites }] =
    await Promise.all([
      pool.query(
        `SELECT
           (SELECT count(*)::int FROM tracks) AS tracks,
           (SELECT count(*)::int FROM playlists WHERE user_id = $1) AS playlists,
           (SELECT count(DISTINCT (lower(album), lower(COALESCE(album_artist, artist))))::int
              FROM tracks
             WHERE album IS NOT NULL AND btrim(album) <> '') AS albums,
           (SELECT count(*)::int FROM track_favorites WHERE user_id = $1) AS favorites,
           (SELECT COALESCE(sum(duration_seconds), 0) FROM tracks) AS duration_seconds`,
        [userId],
      ),
      pool.query(
        `SELECT t.*,
                EXISTS (
                  SELECT 1 FROM track_favorites f
                  WHERE f.track_id = t.id AND f.user_id = $1
                ) AS is_favorite
         FROM tracks t ORDER BY t.created_at DESC LIMIT 8`,
        [userId],
      ),
      pool.query(
        `SELECT t.*, true AS is_favorite
         FROM track_favorites f
         JOIN tracks t ON t.id = f.track_id
         WHERE f.user_id = $1
         ORDER BY f.created_at DESC LIMIT 8`,
        [userId],
      ),
    ]);
  return {
    counts: {
      tracks: counts[0]?.tracks || 0,
      playlists: counts[0]?.playlists || 0,
      albums: counts[0]?.albums || 0,
      favorites: counts[0]?.favorites || 0,
      durationSeconds: Number(counts[0]?.duration_seconds || 0),
    },
    recentlyAdded: recent.map((row) => presentTrack(row, baseUrl)),
    favorites: favorites.map((row) => presentTrack(row, baseUrl)),
  };
}

module.exports = {
  get,
  getRawRow,
  list,
  albums,
  byAlbum,
  update,
  remove,
  summary,
  presentTrack,
};
