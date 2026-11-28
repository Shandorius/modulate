/**
 * OpenSubsonic-compatible read API.
 *
 * Music Assistant, Symfonium, Feishin and other Subsonic clients browse the
 * shared library through this service. Authentication is the OpenSubsonic API
 * key extension (`apiKey`), because Modulate stores Argon2 password hashes and
 * cannot compute the legacy md5(password + salt) token.
 */
const { pool } = require('../db/pool');

const API_VERSION = '1.16.1';
const SERVER_TYPE = 'modulate';
const IGNORED_ARTICLES = 'The El La Los Las Le Les';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALBUM_ARTIST = `COALESCE(NULLIF(t.album_artist, ''), NULLIF(t.artist, ''), 'Unknown artist')`;
const ALBUM_NAME = `COALESCE(NULLIF(t.album, ''), 'Singles')`;

function encodeAlbumId(albumArtist, album) {
  const raw = Buffer.from(`${albumArtist}\u0001${album}`, 'utf8');
  return `al-${raw.toString('base64url')}`;
}

function decodeAlbumId(value) {
  if (typeof value !== 'string' || !value.startsWith('al-')) return null;
  try {
    const raw = Buffer.from(value.slice(3), 'base64url').toString('utf8');
    const separator = raw.indexOf('\u0001');
    if (separator < 0) return null;
    return {
      albumArtist: raw.slice(0, separator),
      album: raw.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

function encodeArtistId(name) {
  return `ar-${Buffer.from(String(name), 'utf8').toString('base64url')}`;
}

function decodeArtistId(value) {
  if (typeof value !== 'string' || !value.startsWith('ar-')) return null;
  try {
    return Buffer.from(value.slice(3), 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function iso(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function suffixFor(mimeType) {
  const type = String(mimeType || '').toLowerCase();
  if (type.includes('mpeg') || type.includes('mp3')) return 'mp3';
  if (type.includes('flac')) return 'flac';
  if (type.includes('ogg') || type.includes('opus')) return 'opus';
  if (type.includes('wav')) return 'wav';
  if (type.includes('aac')) return 'aac';
  return 'm4a';
}

function presentChild(row) {
  const albumArtist = row.album_artist || row.artist || 'Unknown artist';
  const album = row.album || 'Singles';
  const albumIdentifier = encodeAlbumId(albumArtist, album);
  return {
    id: row.id,
    parent: albumIdentifier,
    isDir: false,
    title: row.title,
    album,
    albumId: albumIdentifier,
    artist: row.artist || 'Unknown artist',
    artistId: encodeArtistId(row.artist || 'Unknown artist'),
    track: row.track_number ?? undefined,
    year: row.release_year ?? undefined,
    genre: row.genre ?? undefined,
    coverArt: row.artwork_path ? albumIdentifier : undefined,
    size: Number(row.file_size_bytes) || undefined,
    contentType: row.mime_type || undefined,
    suffix: suffixFor(row.mime_type),
    duration: Math.round(Number(row.duration_seconds) || 0),
    created: iso(row.created_at),
    starred: row.starred_at ? iso(row.starred_at) : undefined,
  };
}

function presentAlbum(row) {
  const albumArtist = row.album_artist || 'Unknown artist';
  const albumIdentifier = encodeAlbumId(albumArtist, row.album);
  return {
    id: albumIdentifier,
    name: row.album,
    artist: albumArtist,
    artistId: encodeArtistId(albumArtist),
    coverArt: row.artwork_path ? albumIdentifier : undefined,
    songCount: Number(row.song_count) || 0,
    duration: Math.round(Number(row.duration) || 0),
    created: iso(row.created) || new Date(0).toISOString(),
    year: row.year ?? undefined,
    genre: row.genre ?? undefined,
    playCount: Number(row.play_count) || undefined,
  };
}

function presentPlaylist(row) {
  return {
    id: row.id,
    name: row.name,
    comment: row.description || undefined,
    owner: row.owner_name || row.owner_email || undefined,
    public: row.visibility === 'public',
    coverArt: row.id,
    songCount: Number(row.song_count) || 0,
    duration: Math.round(Number(row.duration) || 0),
    created: iso(row.created_at) || new Date(0).toISOString(),
    changed: iso(row.updated_at) || iso(row.created_at) || new Date(0).toISOString(),
  };
}

function albumsCte() {
  return `
    WITH albums AS (
      SELECT
        ${ALBUM_ARTIST} AS album_artist,
        ${ALBUM_NAME} AS album,
        count(*)::int AS song_count,
        COALESCE(sum(t.duration_seconds), 0)::int AS duration,
        min(t.created_at) AS created,
        max(t.release_year) AS year,
        max(t.genre) AS genre,
        max(t.artwork_path) AS artwork_path,
        count(f.track_id)::int AS starred_count,
        COALESCE(sum(plays.total), 0)::int AS play_count,
        max(plays.last_played) AS last_played
      FROM tracks t
      LEFT JOIN track_favorites f
        ON f.track_id = t.id AND f.user_id = $1
      LEFT JOIN (
        SELECT track_id, count(*)::int AS total, max(played_at) AS last_played
        FROM play_history
        WHERE user_id = $1
        GROUP BY track_id
      ) plays ON plays.track_id = t.id
      GROUP BY 1, 2
    )
  `;
}

const ALBUM_ORDERS = {
  alphabeticalByName: 'lower(album) ASC, lower(album_artist) ASC',
  alphabeticalByArtist:
    'lower(album_artist) ASC, lower(album) ASC, year ASC NULLS LAST',
  newest: 'created DESC, lower(album) ASC',
  random: 'random()',
  frequent: 'play_count DESC NULLS LAST, lower(album) ASC',
  recent: 'last_played DESC NULLS LAST, lower(album) ASC',
  starred: 'lower(album) ASC',
  byYear: 'year DESC NULLS LAST, lower(album) ASC',
  byGenre: 'lower(album) ASC',
  highest: 'play_count DESC NULLS LAST, lower(album) ASC',
};

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.trunc(number), min), max);
}

async function listAlbums(userId, input = {}) {
  const type = ALBUM_ORDERS[input.type] ? input.type : 'alphabeticalByName';
  const values = [userId];
  const where = [];
  const add = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (type === 'starred') {
    where.push('starred_count > 0');
  } else if (type === 'byYear') {
    const from = Number(input.fromYear) || 0;
    const to = Number(input.toYear) || 9999;
    where.push(`year BETWEEN ${add(from)} AND ${add(to)}`);
  } else if (type === 'byGenre') {
    where.push(`lower(genre) = lower(${add(String(input.genre || ''))})`);
  }

  const limit = clamp(input.size, 1, 500, 50);
  const offset = clamp(input.offset, 0, 5000, 0);
  const limitIndex = add(limit);
  const offsetIndex = add(offset);

  const { rows } = await pool.query(
    `${albumsCte()}
     SELECT * FROM albums
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY ${ALBUM_ORDERS[type]}
     LIMIT ${limitIndex} OFFSET ${offsetIndex}`,
    values,
  );
  return rows.map(presentAlbum);
}

async function getAlbum(userId, id) {
  const key = decodeAlbumId(id);
  if (!key) return null;
  const { rows: aggregate } = await pool.query(
    `${albumsCte()}
     SELECT * FROM albums
     WHERE album_artist = $2 AND album = $3
     LIMIT 1`,
    [userId, key.albumArtist, key.album],
  );
  const { rows } = await pool.query(
    `SELECT t.*, (f.track_id IS NOT NULL) AS is_starred,
            f.created_at AS starred_at
     FROM tracks t
     LEFT JOIN track_favorites f
       ON f.track_id = t.id AND f.user_id = $1
     WHERE ${ALBUM_ARTIST} = $2 AND ${ALBUM_NAME} = $3
     ORDER BY t.track_number ASC NULLS LAST, lower(t.title) ASC`,
    [userId, key.albumArtist, key.album],
  );
  if (!aggregate[0] && !rows.length) return null;
  const album = presentAlbum(
    aggregate[0] || {
      album_artist: key.albumArtist,
      album: key.album,
      song_count: rows.length,
      duration: rows.reduce(
        (total, row) => total + Number(row.duration_seconds || 0),
        0,
      ),
      created: rows[0]?.created_at,
      year: rows[0]?.release_year,
      genre: rows[0]?.genre,
      artwork_path: rows.find((row) => row.artwork_path)?.artwork_path,
    },
  );
  album.song = rows.map(presentChild);
  return album;
}

function indexFor(name) {
  const first = String(name || '').trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : '#';
}

async function listArtists() {
  const { rows } = await pool.query(
    `SELECT t.artist AS name,
            count(DISTINCT (${ALBUM_ARTIST}, ${ALBUM_NAME}))::int AS album_count
     FROM tracks t
     WHERE NULLIF(trim(t.artist), '') IS NOT NULL
     GROUP BY t.artist
     ORDER BY lower(t.artist) ASC`,
  );
  const buckets = new Map();
  for (const row of rows) {
    const name = indexFor(row.name);
    if (!buckets.has(name)) buckets.set(name, []);
    buckets.get(name).push({
      id: encodeArtistId(row.name),
      name: row.name,
      albumCount: Number(row.album_count) || 0,
    });
  }
  const index = [...buckets.entries()]
    .sort(([left], [right]) => {
      if (left === '#') return 1;
      if (right === '#') return -1;
      return left.localeCompare(right);
    })
    .map(([name, artist]) => ({ name, artist }));

  return { ignoredArticles: IGNORED_ARTICLES, index };
}

async function getArtist(userId, id) {
  const name = decodeArtistId(id);
  if (!name) return null;
  const { rows } = await pool.query(
    `${albumsCte()}
     SELECT * FROM albums
     WHERE album_artist = $2
     ORDER BY lower(album) ASC, year ASC NULLS LAST`,
    [userId, name],
  );
  if (!rows.length) return null;
  return {
    id,
    name,
    albumCount: rows.length,
    album: rows.map(presentAlbum),
  };
}

async function getSong(userId, id) {
  if (!isUuid(id)) return null;
  const { rows } = await pool.query(
    `SELECT t.*, (f.track_id IS NOT NULL) AS is_starred,
            f.created_at AS starred_at
     FROM tracks t
     LEFT JOIN track_favorites f
       ON f.track_id = t.id AND f.user_id = $1
     WHERE t.id = $2`,
    [userId, id],
  );
  return rows[0] ? presentChild(rows[0]) : null;
}

async function search(userId, input = {}) {
  const query = String(input.query || '').trim();
  const pattern = `%${query}%`;

  const { rows: artists } = await pool.query(
    `SELECT t.artist AS name,
            count(DISTINCT (${ALBUM_ARTIST}, ${ALBUM_NAME}))::int AS album_count
     FROM tracks t
     WHERE t.artist ILIKE $1
     GROUP BY t.artist
     ORDER BY lower(t.artist) ASC
     LIMIT $2 OFFSET $3`,
    [
      pattern,
      clamp(input.artistCount, 0, 500, 20),
      clamp(input.artistOffset, 0, 5000, 0),
    ],
  );

  const { rows: albums } = await pool.query(
    `${albumsCte()}
     SELECT * FROM albums
     WHERE album ILIKE $2 OR album_artist ILIKE $2
     ORDER BY lower(album) ASC, lower(album_artist) ASC
     LIMIT $3 OFFSET $4`,
    [
      userId,
      pattern,
      clamp(input.albumCount, 0, 500, 20),
      clamp(input.albumOffset, 0, 5000, 0),
    ],
  );

  const { rows: songs } = await pool.query(
    `SELECT t.*, (f.track_id IS NOT NULL) AS is_starred,
            f.created_at AS starred_at
     FROM tracks t
     LEFT JOIN track_favorites f
       ON f.track_id = t.id AND f.user_id = $1
     WHERE t.title ILIKE $2
        OR t.artist ILIKE $2
        OR COALESCE(t.album, '') ILIKE $2
     ORDER BY lower(t.title) ASC
     LIMIT $3 OFFSET $4`,
    [
      userId,
      pattern,
      clamp(input.songCount, 0, 500, 20),
      clamp(input.songOffset, 0, 5000, 0),
    ],
  );

  return {
    artist: artists.map((row) => ({
      id: encodeArtistId(row.name),
      name: row.name,
      albumCount: Number(row.album_count) || 0,
    })),
    album: albums.map(presentAlbum),
    song: songs.map(presentChild),
  };
}

const PLAYLIST_ACCESS = `(
  p.user_id = $1
  OR p.visibility = 'public'
  OR EXISTS (
    SELECT 1 FROM playlist_shares ps
    WHERE ps.playlist_id = p.id AND ps.user_id = $1
  )
)`;

const PLAYLIST_SELECT = `
  SELECT p.id, p.name, p.description, p.visibility,
         p.created_at, p.updated_at,
         owner.display_name AS owner_name,
         owner.email AS owner_email,
         count(pt.track_id)::int AS song_count,
         COALESCE(sum(t.duration_seconds), 0)::int AS duration
  FROM playlists p
  JOIN users owner ON owner.id = p.user_id
  LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
  LEFT JOIN tracks t ON t.id = pt.track_id
`;

async function listPlaylists(userId) {
  const { rows } = await pool.query(
    `${PLAYLIST_SELECT}
     WHERE ${PLAYLIST_ACCESS}
     GROUP BY p.id, owner.id
     ORDER BY lower(p.name) ASC`,
    [userId],
  );
  return rows.map(presentPlaylist);
}

async function getPlaylist(userId, id) {
  if (!isUuid(id)) return null;
  const { rows } = await pool.query(
    `${PLAYLIST_SELECT}
     WHERE p.id = $2 AND ${PLAYLIST_ACCESS}
     GROUP BY p.id, owner.id`,
    [userId, id],
  );
  if (!rows[0]) return null;
  const playlist = presentPlaylist(rows[0]);

  const { rows: tracks } = await pool.query(
    `SELECT t.*, (f.track_id IS NOT NULL) AS is_starred,
            f.created_at AS starred_at
     FROM playlist_tracks pt
     JOIN tracks t ON t.id = pt.track_id
     LEFT JOIN track_favorites f
       ON f.track_id = t.id AND f.user_id = $1
     WHERE pt.playlist_id = $2
     ORDER BY pt.position ASC, pt.added_at ASC`,
    [userId, id],
  );
  playlist.entry = tracks.map(presentChild);
  return playlist;
}

async function starred(userId) {
  const { rows: songs } = await pool.query(
    `SELECT t.*, (f.track_id IS NOT NULL) AS is_starred,
            f.created_at AS starred_at
     FROM track_favorites f
     JOIN tracks t ON t.id = f.track_id
     WHERE f.user_id = $1
     ORDER BY f.created_at DESC
     LIMIT 500`,
    [userId],
  );

  const { rows: albums } = await pool.query(
    `${albumsCte()}
     SELECT * FROM albums
     WHERE starred_count > 0
     ORDER BY lower(album) ASC
     LIMIT 500`,
    [userId],
  );

  const { rows: artists } = await pool.query(
    `SELECT t.artist AS name,
            count(DISTINCT (${ALBUM_ARTIST}, ${ALBUM_NAME}))::int AS album_count
     FROM track_favorites f
     JOIN tracks t ON t.id = f.track_id
     WHERE f.user_id = $1
     GROUP BY t.artist
     ORDER BY lower(t.artist) ASC
     LIMIT 500`,
    [userId],
  );

  return {
    song: songs.map(presentChild),
    album: albums.map(presentAlbum),
    artist: artists.map((row) => ({
      id: encodeArtistId(row.name),
      name: row.name,
      albumCount: Number(row.album_count) || 0,
    })),
  };
}

/** Resolve a cover art id (album id, track uuid, or playlist uuid). */
async function coverArtPath(id) {
  const album = decodeAlbumId(id);
  if (album) {
    const { rows } = await pool.query(
      `SELECT artwork_path FROM tracks t
       WHERE ${ALBUM_ARTIST} = $1 AND ${ALBUM_NAME} = $2
         AND artwork_path IS NOT NULL
       LIMIT 1`,
      [album.albumArtist, album.album],
    );
    return rows[0]?.artwork_path || null;
  }
  if (!isUuid(id)) return null;

  const { rows: trackRows } = await pool.query(
    'SELECT artwork_path FROM tracks WHERE id = $1',
    [id],
  );
  if (trackRows[0]?.artwork_path) return trackRows[0].artwork_path;

  // Playlist covers use the first track that has artwork.
  const { rows: playlistRows } = await pool.query(
    `SELECT t.artwork_path
     FROM playlist_tracks pt
     JOIN tracks t ON t.id = pt.track_id
     WHERE pt.playlist_id = $1 AND t.artwork_path IS NOT NULL
     ORDER BY pt.position ASC
     LIMIT 1`,
    [id],
  );
  return playlistRows[0]?.artwork_path || null;
}

async function streamTrack(id) {
  if (!isUuid(id)) return null;
  const { rows } = await pool.query(
    `SELECT id, file_path, artwork_path, mime_type, storage_kind,
            library_source_id
     FROM tracks WHERE id = $1`,
    [id],
  );
  return rows[0] || null;
}

module.exports = {
  API_VERSION,
  SERVER_TYPE,
  encodeAlbumId,
  encodeArtistId,
  listAlbums,
  getAlbum,
  listArtists,
  getArtist,
  getSong,
  search,
  listPlaylists,
  getPlaylist,
  starred,
  coverArtPath,
  streamTrack,
};
