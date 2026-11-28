const { pool, withTransaction } = require('../db/pool');
const { badRequest, conflict, forbidden, notFound } = require('./errors');
const trackService = require('./trackService');
const mediaTokenService = require('./mediaTokenService');

function accessCondition(alias = 'p') {
  return `(
    ${alias}.user_id = $1
    OR ${alias}.visibility = 'public'
    OR EXISTS (
      SELECT 1 FROM playlist_shares ps
      WHERE ps.playlist_id = ${alias}.id AND ps.user_id = $1
    )
  )`;
}

function relationshipExpression(alias = 'p') {
  return `CASE
    WHEN ${alias}.user_id = $1 THEN 'owner'
    WHEN EXISTS (
      SELECT 1 FROM playlist_shares ps
      WHERE ps.playlist_id = ${alias}.id AND ps.user_id = $1
    ) THEN 'shared'
    ELSE 'public'
  END`;
}

function roleExpression(alias = 'p') {
  return `CASE
    WHEN ${alias}.user_id = $1 THEN 'owner'
    WHEN EXISTS (
      SELECT 1 FROM playlist_shares ps
      WHERE ps.playlist_id = ${alias}.id AND ps.user_id = $1
    ) THEN (
      SELECT ps.role FROM playlist_shares ps
      WHERE ps.playlist_id = ${alias}.id AND ps.user_id = $1
      LIMIT 1
    )
    ELSE 'viewer'
  END`;
}

const playlistProjection = (alias = 'p') => `
  ${alias}.*,
  owner.display_name AS owner_name,
  count(pt.track_id)::int AS track_count,
  COALESCE(sum(t.duration_seconds), 0) AS duration_seconds,
  (SELECT count(*)::int FROM playlist_shares ps
    WHERE ps.playlist_id = ${alias}.id) AS share_count,
  (SELECT pt2.track_id
     FROM playlist_tracks pt2
     JOIN tracks t2 ON t2.id = pt2.track_id
    WHERE pt2.playlist_id = ${alias}.id AND t2.artwork_path IS NOT NULL
    ORDER BY pt2.position ASC, pt2.added_at ASC
    LIMIT 1) AS artwork_track_id,
  ${relationshipExpression(alias)} AS relationship,
  ${roleExpression(alias)} AS my_role`;

function presentPlaylist(row, tracks = null, baseUrl = '', userId = null) {
  const artworkUrl =
    tracks?.find((track) => track.artworkUrl)?.artworkUrl ||
    (row.artwork_track_id
      ? `${baseUrl}${mediaTokenService.signedPath('artwork', 'library', row.artwork_track_id)}`
      : null);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    visibility: row.visibility || 'private',
    ownerId: row.user_id,
    ownerName: row.owner_name || null,
    relationship: row.relationship || 'owner',
    myRole: row.my_role || 'viewer',
    canEditTracks:
      Boolean(userId) &&
      (row.user_id === userId || row.my_role === 'editor'),
    canManage: Boolean(userId) && row.user_id === userId,
    canEdit: Boolean(userId) && row.user_id === userId,
    revision: Number(row.revision || 0),
    shareCount: Number(row.share_count || 0),
    trackCount: Number(row.track_count || (tracks ? tracks.length : 0)),
    durationSeconds: Number(row.duration_seconds || 0),
    artworkUrl,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(tracks ? { tracks } : {}),
  };
}

async function list(userId) {
  const { rows } = await pool.query(
    `SELECT ${playlistProjection('p')}
     FROM playlists p
     JOIN users owner ON owner.id = p.user_id
     LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
     LEFT JOIN tracks t ON t.id = pt.track_id
     WHERE ${accessCondition('p')}
     GROUP BY p.id, owner.id, owner.display_name
     ORDER BY
       CASE WHEN p.user_id = $1 THEN 0 ELSE 1 END,
       p.updated_at DESC`,
    [userId],
  );
  return rows.map((row) => presentPlaylist(row, null, '', userId));
}

async function getRow(userId, playlistId, db = pool) {
  const { rows } = await db.query(
    `SELECT ${playlistProjection('p')}
     FROM playlists p
     JOIN users owner ON owner.id = p.user_id
     LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
     LEFT JOIN tracks t ON t.id = pt.track_id
     WHERE p.id = $2 AND ${accessCondition('p')}
     GROUP BY p.id, owner.id, owner.display_name`,
    [userId, playlistId],
  );
  return rows[0] || null;
}

async function requireOwner(userId, playlistId, db = pool) {
  const { rows } = await db.query(
    `SELECT p.*,
            EXISTS (
              SELECT 1 FROM playlist_shares ps
              WHERE ps.playlist_id = p.id AND ps.user_id = $2
            ) AS is_shared
     FROM playlists p WHERE p.id = $1`,
    [playlistId, userId],
  );
  const playlist = rows[0];
  if (!playlist) throw notFound('Playlist not found.');
  if (playlist.user_id === userId) return playlist;
  if (playlist.visibility === 'public' || playlist.is_shared) {
    throw forbidden('Only the playlist owner can change it.');
  }
  throw notFound('Playlist not found.');
}

async function requireEditor(userId, playlistId, db = pool) {
  const { rows } = await db.query(
    `SELECT p.*, ps.role AS my_role
     FROM playlists p
     LEFT JOIN playlist_shares ps
       ON ps.playlist_id = p.id AND ps.user_id = $2
     WHERE p.id = $1`,
    [playlistId, userId],
  );
  const playlist = rows[0];
  if (!playlist) throw notFound('Playlist not found.');
  if (playlist.user_id === userId) return playlist;
  if (playlist.my_role === 'editor') return playlist;
  if (playlist.visibility === 'public' || playlist.my_role) {
    throw forbidden('Only the owner or an editor can change this playlist.');
  }
  throw notFound('Playlist not found.');
}

async function get(userId, playlistId, baseUrl = '') {
  const playlist = await getRow(userId, playlistId);
  if (!playlist) throw notFound('Playlist not found.');
  const { rows } = await pool.query(
    `SELECT t.*,
            EXISTS (
              SELECT 1 FROM track_favorites f
              WHERE f.track_id = t.id AND f.user_id = $2
            ) AS is_favorite
     FROM playlist_tracks pt
     JOIN tracks t ON t.id = pt.track_id
     WHERE pt.playlist_id = $1
     ORDER BY pt.position ASC, pt.added_at ASC`,
    [playlistId, userId],
  );
  const tracks = rows.map((row) => trackService.presentTrack(row, baseUrl));
  return presentPlaylist(playlist, tracks, baseUrl, userId);
}

async function create(userId, input) {
  const name = String(input.name || '').trim();
  if (!name) throw badRequest('Give the playlist a name.');
  const { rows } = await pool.query(
    `INSERT INTO playlists (user_id, name, description)
     VALUES ($1, $2, $3) RETURNING *`,
    [userId, name, input.description?.trim() || null],
  );
  return get(userId, rows[0].id);
}

async function update(userId, playlistId, input) {
  await requireOwner(userId, playlistId);
  const sets = [];
  const values = [];
  if (input.name !== undefined) {
    const name = String(input.name).trim();
    if (!name) throw badRequest('Give the playlist a name.');
    values.push(name);
    sets.push(`name = $${values.length}`);
  }
  if (input.description !== undefined) {
    values.push(input.description?.trim() || null);
    sets.push(`description = $${values.length}`);
  }
  if (input.visibility !== undefined) {
    if (!['private', 'public'].includes(input.visibility)) {
      throw badRequest('Visibility must be private or public.');
    }
    values.push(input.visibility);
    sets.push(`visibility = $${values.length}`);
  }
  if (!sets.length) throw badRequest('Nothing to update.');
  values.push(playlistId);
  await pool.query(
    `UPDATE playlists
     SET ${sets.join(', ')}, revision = revision + 1, updated_at = now()
     WHERE id = $${values.length}`,
    values,
  );
  return get(userId, playlistId);
}

async function setVisibility(userId, playlistId, visibility) {
  return update(userId, playlistId, { visibility });
}

async function remove(userId, playlistId) {
  await requireOwner(userId, playlistId);
  await pool.query('DELETE FROM playlists WHERE id = $1', [playlistId]);
  return { id: playlistId };
}

async function addTrack(userId, playlistId, trackId) {
  await requireEditor(userId, playlistId);
  const track = await trackService.getRawRow(trackId);
  if (!track) throw notFound('Track not found.');
  await withTransaction(async (client) => {
    const { rows: existing } = await client.query(
      'SELECT 1 FROM playlist_tracks WHERE playlist_id = $1 AND track_id = $2',
      [playlistId, trackId],
    );
    if (existing[0]) throw conflict('That track is already in this playlist.');
    const { rows: positionRows } = await client.query(
      'SELECT COALESCE(max(position), -1) + 1 AS position FROM playlist_tracks WHERE playlist_id = $1',
      [playlistId],
    );
    await client.query(
      `INSERT INTO playlist_tracks (playlist_id, track_id, position)
       VALUES ($1, $2, $3)`,
      [playlistId, trackId, positionRows[0].position],
    );
    await client.query(
      'UPDATE playlists SET revision = revision + 1, updated_at = now() WHERE id = $1',
      [playlistId],
    );
  });
  return get(userId, playlistId);
}

async function removeTrack(userId, playlistId, trackId) {
  await requireEditor(userId, playlistId);
  const { rowCount } = await pool.query(
    'DELETE FROM playlist_tracks WHERE playlist_id = $1 AND track_id = $2',
    [playlistId, trackId],
  );
  if (!rowCount) throw notFound('That track is not in this playlist.');
  await pool.query(
    'UPDATE playlists SET revision = revision + 1, updated_at = now() WHERE id = $1',
    [playlistId],
  );
  return get(userId, playlistId);
}

async function reorder(userId, playlistId, trackIds, expectedRevision = null) {
  const playlist = await requireEditor(userId, playlistId);
  if (
    expectedRevision !== null &&
    Number(expectedRevision) !== Number(playlist.revision || 0)
  ) {
    throw conflict(
      'This playlist changed while you were editing. Reload it and try again.',
    );
  }
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT track_id FROM playlist_tracks WHERE playlist_id = $1',
      [playlistId],
    );
    const current = new Set(rows.map((row) => row.track_id));
    if (
      trackIds.length !== current.size ||
      trackIds.some((id) => !current.has(id)) ||
      new Set(trackIds).size !== trackIds.length
    ) {
      throw badRequest('The new order must contain every track exactly once.');
    }
    for (let index = 0; index < trackIds.length; index += 1) {
      await client.query(
        'UPDATE playlist_tracks SET position = $1 WHERE playlist_id = $2 AND track_id = $3',
        [index, playlistId, trackIds[index]],
      );
    }
    await client.query(
      'UPDATE playlists SET revision = revision + 1, updated_at = now() WHERE id = $1',
      [playlistId],
    );
  });
  return get(userId, playlistId);
}

async function availableTracks(userId, playlistId, input = {}, baseUrl = '') {
  await requireEditor(userId, playlistId);
  return trackService.list(
    userId,
    { ...input, excludePlaylistId: playlistId },
    baseUrl,
  );
}

async function trackIds(userId, playlistId) {
  const playlist = await getRow(userId, playlistId);
  if (!playlist) throw notFound('Playlist not found.');
  const { rows } = await pool.query(
    `SELECT pt.track_id FROM playlist_tracks pt
     WHERE pt.playlist_id = $1
     ORDER BY pt.position ASC, pt.added_at ASC`,
    [playlistId],
  );
  return rows.map((row) => row.track_id);
}

async function listShares(userId, playlistId) {
  await requireOwner(userId, playlistId);
  const { rows } = await pool.query(
    `SELECT u.id, u.display_name, u.email, ps.role, ps.created_at
     FROM playlist_shares ps
     JOIN users u ON u.id = ps.user_id
     WHERE ps.playlist_id = $1
     ORDER BY lower(COALESCE(u.display_name, u.email))`,
    [playlistId],
  );
  return rows.map((row) => ({
    userId: row.id,
    displayName: row.display_name,
    email: row.email,
    role: row.role || 'viewer',
    sharedAt: row.created_at,
  }));
}

async function share(userId, playlistId, targetUserId, role = 'viewer') {
  await requireOwner(userId, playlistId);
  if (!['viewer', 'editor'].includes(role)) {
    throw badRequest('Share role must be viewer or editor.');
  }
  if (String(targetUserId) === String(userId)) {
    throw badRequest('You already own this playlist.');
  }
  const { rows: target } = await pool.query(
    'SELECT id FROM users WHERE id = $1',
    [targetUserId],
  );
  if (!target[0]) throw notFound('User not found.');
  await pool.query(
    `INSERT INTO playlist_shares (playlist_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (playlist_id, user_id)
     DO UPDATE SET role = EXCLUDED.role`,
    [playlistId, targetUserId, role],
  );
  return listShares(userId, playlistId);
}

async function updateShareRole(userId, playlistId, targetUserId, role) {
  await requireOwner(userId, playlistId);
  if (!['viewer', 'editor'].includes(role)) {
    throw badRequest('Share role must be viewer or editor.');
  }
  const { rowCount } = await pool.query(
    `UPDATE playlist_shares SET role = $1
     WHERE playlist_id = $2 AND user_id = $3`,
    [role, playlistId, targetUserId],
  );
  if (!rowCount) throw notFound('That user does not have access to this playlist.');
  return listShares(userId, playlistId);
}

async function unshare(userId, playlistId, targetUserId) {
  await requireOwner(userId, playlistId);
  await pool.query(
    'DELETE FROM playlist_shares WHERE playlist_id = $1 AND user_id = $2',
    [playlistId, targetUserId],
  );
  return listShares(userId, playlistId);
}

module.exports = {
  list,
  get,
  create,
  update,
  setVisibility,
  remove,
  addTrack,
  removeTrack,
  reorder,
  trackIds,
  availableTracks,
  listShares,
  share,
  updateShareRole,
  unshare,
  presentPlaylist,
};
