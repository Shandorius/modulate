const { pool, withTransaction } = require('../db/pool');
const { badRequest, conflict, notFound } = require('./errors');
const trackService = require('./trackService');
const playlistService = require('./playlistService');

const ACTIVE_WINDOW_SECONDS = 45;

async function ensureState(userId, db = pool) {
  await db.query(
    `INSERT INTO playback_state (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
  const { rows } = await db.query(
    'SELECT * FROM playback_state WHERE user_id = $1',
    [userId],
  );
  return rows[0];
}

async function queueRows(userId, db = pool) {
  const { rows } = await db.query(
    `SELECT q.id AS queue_id, q.position, t.*
     FROM playback_queue q
     JOIN tracks t ON t.id = q.track_id
     WHERE q.user_id = $1
     ORDER BY q.position ASC, q.added_at ASC`,
    [userId],
  );
  return rows;
}

async function getState(userId, baseUrl = '') {
  const state = await ensureState(userId);
  const rows = await queueRows(userId);
  const queue = rows.map((row) => ({
    queueId: row.queue_id,
    position: row.position,
    track: trackService.presentTrack(row, baseUrl),
  }));
  const index = queue.findIndex(
    (item) => item.track.id === state.current_track_id,
  );
  const current =
    queue.find((item) => item.track.id === state.current_track_id)?.track ||
    (state.current_track_id
      ? await trackService
          .get(userId, state.current_track_id, baseUrl)
          .catch(() => null)
      : null);

  const { rows: sessions } = await pool.query(
    `SELECT count(*)::int AS active
     FROM player_sessions
     WHERE user_id = $1 AND last_seen_at > now() - make_interval(secs => $2)`,
    [userId, ACTIVE_WINDOW_SECONDS],
  );
  const { rows: announcements } = await pool.query(
    `SELECT id, message, created_at, expires_at
     FROM announcements
     WHERE user_id = $1
       AND acknowledged_at IS NULL
       AND expires_at > now()
     ORDER BY created_at ASC LIMIT 1`,
    [userId],
  );

  return {
    state: {
      currentTrackId: state.current_track_id,
      positionSeconds: Number(state.position_seconds),
      volume: Number(state.volume),
      isPlaying: state.is_playing,
      repeatMode: state.repeat_mode,
      shuffle: state.shuffle,
      contextType: state.context_type,
      contextId: state.context_id,
      updatedAt: state.updated_at,
    },
    current,
    queue,
    queueIndex: index,
    activePlayers: sessions[0]?.active || 0,
    announcement: announcements[0]
      ? {
          id: announcements[0].id,
          message: announcements[0].message,
          createdAt: announcements[0].created_at,
          expiresAt: announcements[0].expires_at,
        }
      : null,
    serverTime: new Date().toISOString(),
  };
}

async function presence(userId, clientId, platform = 'web') {
  if (!clientId || String(clientId).length > 200) {
    throw badRequest('clientId is required.');
  }
  await pool.query(
    `INSERT INTO player_sessions (user_id, client_id, platform, last_seen_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id, client_id)
     DO UPDATE SET platform = EXCLUDED.platform, last_seen_at = now()`,
    [userId, String(clientId), String(platform || 'web').slice(0, 40)],
  );
  await pool.query(
    `DELETE FROM player_sessions
     WHERE user_id = $1 AND last_seen_at < now() - interval '2 hours'`,
    [userId],
  );
  return { clientId, active: true };
}

async function clearPresence(userId, clientId) {
  await pool.query(
    'DELETE FROM player_sessions WHERE user_id = $1 AND client_id = $2',
    [userId, clientId],
  );
  return { clientId, active: false };
}

async function recordPlay(userId, trackId, db = pool) {
  if (!trackId) return;
  await db.query(
    `INSERT INTO play_history (user_id, track_id) VALUES ($1, $2)`,
    [userId, trackId],
  );
}

async function replaceQueue(client, userId, trackIds) {
  await client.query('DELETE FROM playback_queue WHERE user_id = $1', [userId]);
  const unique = [];
  const seen = new Set();
  for (const id of trackIds) {
    if (!seen.has(id)) {
      seen.add(id);
      unique.push(id);
    }
  }
  for (let index = 0; index < unique.length; index += 1) {
    await client.query(
      `INSERT INTO playback_queue (user_id, track_id, position)
       VALUES ($1, $2, $3)`,
      [userId, unique[index], index],
    );
  }
  return unique;
}

async function queuePosition(client, userId, trackId) {
  const { rows } = await client.query(
    `SELECT position FROM playback_queue
     WHERE user_id = $1 AND track_id = $2
     ORDER BY position ASC LIMIT 1`,
    [userId, trackId],
  );
  return rows[0]?.position ?? -1;
}

async function queueAt(client, userId, position) {
  const { rows } = await client.query(
    `SELECT q.id, q.track_id, t.duration_seconds
     FROM playback_queue q
     JOIN tracks t ON t.id = q.track_id
     WHERE q.user_id = $1 AND q.position = $2
     LIMIT 1`,
    [userId, position],
  );
  return rows[0] || null;
}

async function setTrack(client, userId, trackId, position = 0, playing = true) {
  const { rows } = await client.query(
    'SELECT duration_seconds FROM tracks WHERE id = $1',
    [trackId],
  );
  if (!rows[0]) throw notFound('Track not found.');
  const positionSeconds = Math.min(
    Math.max(Number(position) || 0, 0),
    Number(rows[0].duration_seconds) || 0,
  );
  await client.query(
    `UPDATE playback_state
     SET current_track_id = $1, position_seconds = $2, is_playing = $3
     WHERE user_id = $4`,
    [trackId, positionSeconds, playing, userId],
  );
  await recordPlay(userId, trackId, client);
}

async function action(userId, input, baseUrl = '') {
  await ensureState(userId);
  const actionName = String(input.action || '').trim();

  if (actionName === 'report') {
    const current = await pool.query(
      'SELECT duration_seconds FROM tracks WHERE id = (SELECT current_track_id FROM playback_state WHERE user_id = $1)',
      [userId],
    );
    const duration = Number(current.rows[0]?.duration_seconds) || 0;
    const position = Math.min(
      Math.max(Number(input.positionSeconds) || 0, 0),
      duration,
    );
    await pool.query(
      `UPDATE playback_state
       SET position_seconds = $1,
           is_playing = COALESCE($2, is_playing)
       WHERE user_id = $3`,
      [position, input.isPlaying === undefined ? null : Boolean(input.isPlaying), userId],
    );
    return getState(userId, baseUrl);
  }

  if (actionName === 'announce') {
    const message = String(input.message || '').trim();
    if (!message) throw badRequest('Announcement message is required.');
    const ttl = Math.min(Math.max(Number(input.ttlSeconds) || 300, 10), 3600);
    const { rows } = await pool.query(
      `INSERT INTO announcements (user_id, message, expires_at)
       VALUES ($1, $2, now() + make_interval(secs => $3))
       RETURNING id, message, created_at, expires_at`,
      [userId, message.slice(0, 1000), ttl],
    );
    return {
      announcement: rows[0],
      ...(await getState(userId, baseUrl)),
    };
  }

  if (actionName === 'ack_announcement') {
    const id = String(input.announcementId || '');
    if (id) {
      await pool.query(
        `UPDATE announcements SET acknowledged_at = now()
         WHERE id = $1 AND user_id = $2 AND acknowledged_at IS NULL`,
        [id, userId],
      );
    }
    return getState(userId, baseUrl);
  }

  if (actionName === 'presence_clear') {
    if (input.clientId) await clearPresence(userId, input.clientId);
    return getState(userId, baseUrl);
  }

  await withTransaction(async (client) => {
    const { rows: stateRows } = await client.query(
      'SELECT * FROM playback_state WHERE user_id = $1 FOR UPDATE',
      [userId],
    );
    const state = stateRows[0];

    if (actionName === 'pause') {
      await client.query(
        'UPDATE playback_state SET is_playing = false WHERE user_id = $1',
        [userId],
      );
      return;
    }

    if (actionName === 'play') {
      if (state.current_track_id) {
        await client.query(
          'UPDATE playback_state SET is_playing = true WHERE user_id = $1',
          [userId],
        );
        return;
      }
      const { rows: first } = await client.query(
        `SELECT track_id FROM playback_queue
         WHERE user_id = $1 ORDER BY position ASC LIMIT 1`,
        [userId],
      );
      if (first[0]) {
        await setTrack(client, userId, first[0].track_id, 0, true);
        return;
      }
      const { rows: latest } = await client.query(
        'SELECT id FROM tracks ORDER BY created_at DESC LIMIT 1',
      );
      if (latest[0]) await setTrack(client, userId, latest[0].id, 0, true);
      return;
    }

    if (actionName === 'next' || actionName === 'previous') {
      if (!state.current_track_id) return;
      const position = await queuePosition(
        client,
        userId,
        state.current_track_id,
      );
      if (position < 0) {
        await client.query(
          'UPDATE playback_state SET is_playing = false WHERE user_id = $1',
          [userId],
        );
        return;
      }
      if (actionName === 'previous' && Number(state.position_seconds) > 5) {
        await client.query(
          'UPDATE playback_state SET position_seconds = 0 WHERE user_id = $1',
          [userId],
        );
        return;
      }
      let nextPosition = actionName === 'next' ? position + 1 : position - 1;
      const { rows: maxRows } = await client.query(
        'SELECT COALESCE(max(position), 0) AS max FROM playback_queue WHERE user_id = $1',
        [userId],
      );
      const max = Number(maxRows[0].max);
      if (state.repeat_mode === 'all') {
        if (nextPosition > max) nextPosition = 0;
        if (nextPosition < 0) nextPosition = max;
      }
      if (nextPosition < 0 || nextPosition > max) {
        await client.query(
          'UPDATE playback_state SET is_playing = false, position_seconds = 0 WHERE user_id = $1',
          [userId],
        );
        return;
      }
      const next = await queueAt(client, userId, nextPosition);
      if (next) await setTrack(client, userId, next.track_id, 0, true);
      return;
    }

    if (actionName === 'seek') {
      if (!state.current_track_id) return;
      const { rows } = await client.query(
        'SELECT duration_seconds FROM tracks WHERE id = $1',
        [state.current_track_id],
      );
      const position = Math.min(
        Math.max(Number(input.positionSeconds) || 0, 0),
        Number(rows[0]?.duration_seconds) || 0,
      );
      await client.query(
        'UPDATE playback_state SET position_seconds = $1 WHERE user_id = $2',
        [position, userId],
      );
      return;
    }

    if (actionName === 'volume') {
      const volume = Math.min(
        Math.max(Number(input.volume) || 0, 0),
        1,
      );
      await client.query(
        'UPDATE playback_state SET volume = $1 WHERE user_id = $2',
        [volume, userId],
      );
      return;
    }

    if (actionName === 'set_repeat') {
      const mode = ['off', 'all', 'one'].includes(input.repeatMode)
        ? input.repeatMode
        : 'off';
      await client.query(
        'UPDATE playback_state SET repeat_mode = $1 WHERE user_id = $2',
        [mode, userId],
      );
      return;
    }

    if (actionName === 'play_track' || actionName === 'play_playlist') {
      let trackIds = [];
      let contextType = 'track';
      let contextId = null;
      if (actionName === 'play_playlist') {
        if (!input.playlistId) throw badRequest('playlistId is required.');
        trackIds = await playlistService.trackIds(userId, input.playlistId);
        contextType = 'playlist';
        contextId = input.playlistId;
      } else {
        if (!input.trackId) throw badRequest('trackId is required.');
        const track = await trackService.getRawRow(input.trackId, client);
        if (!track) throw notFound('Track not found.');
        if (Array.isArray(input.trackIds) && input.trackIds.length) {
          const requested = [...new Set(input.trackIds)];
          const { rows } = await client.query(
            `SELECT id FROM tracks WHERE id = ANY($1::uuid[])`,
            [requested],
          );
          const valid = new Set(rows.map((row) => row.id));
          trackIds = requested.filter((id) => valid.has(id));
        }
        if (!trackIds.includes(input.trackId)) trackIds.push(input.trackId);
        contextId = input.trackId;
      }
      if (!trackIds.length) throw badRequest('There are no tracks to play.');
      await replaceQueue(client, userId, trackIds);
      const position = await queuePosition(client, userId, trackIds[0]);
      await client.query(
        `UPDATE playback_state
         SET context_type = $1, context_id = $2
         WHERE user_id = $3`,
        [contextType, contextId, userId],
      );
      await setTrack(client, userId, trackIds[0], 0, true);
      await client.query(
        'UPDATE playback_state SET position_seconds = 0 WHERE user_id = $1',
        [userId],
      );
      void position;
      return;
    }

    if (actionName === 'enqueue') {
      if (!input.trackId) throw badRequest('trackId is required.');
      const track = await trackService.getRawRow(input.trackId, client);
      if (!track) throw notFound('Track not found.');
      const { rows } = await client.query(
        'SELECT COALESCE(max(position), -1) + 1 AS position FROM playback_queue WHERE user_id = $1',
        [userId],
      );
      await client.query(
        `INSERT INTO playback_queue (user_id, track_id, position)
         VALUES ($1, $2, $3)`,
        [userId, input.trackId, rows[0].position],
      );
      return;
    }

    if (actionName === 'remove_queue_item') {
      if (!input.queueId) throw badRequest('queueId is required.');
      await client.query(
        'DELETE FROM playback_queue WHERE id = $1 AND user_id = $2',
        [input.queueId, userId],
      );
      return;
    }

    if (actionName === 'clear_queue') {
      await client.query('DELETE FROM playback_queue WHERE user_id = $1', [
        userId,
      ]);
      await client.query(
        `UPDATE playback_state SET is_playing = false, current_track_id = NULL,
           position_seconds = 0 WHERE user_id = $1`,
        [userId],
      );
      return;
    }

    throw badRequest('Unknown player action.');
  });

  return getState(userId, baseUrl);
}

async function assertActivePlayer(userId) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS active FROM player_sessions
     WHERE user_id = $1 AND last_seen_at > now() - make_interval(secs => $2)`,
    [userId, ACTIVE_WINDOW_SECONDS],
  );
  if (!rows[0]?.active) {
    throw conflict(
      'No Modulate player is connected. Open the web or mobile player first.',
    );
  }
}

module.exports = {
  ensureState,
  getState,
  presence,
  clearPresence,
  action,
  assertActivePlayer,
};
