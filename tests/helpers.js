const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

require('dotenv').config();
process.env.NODE_ENV = 'test';

function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = '/modulate_test';
    return url.toString();
  }
  return 'postgres://modulate:modulate@localhost:5433/modulate_test';
}

process.env.DATABASE_URL = testDatabaseUrl();
process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
process.env.STREAM_SECRET = 'test-stream-secret-that-is-long-enough';
process.env.SESSION_COOKIE_NAME = 'modulate-test.sid';
process.env.MOBILE_AUTH_ENABLED = 'true';
process.env.MOBILE_AUTH_AUTO_CREATE_TABLE = 'true';
process.env.MOBILE_TOKEN_PREFIX = 'modtest_';
process.env.INGEST_WORKER_ENABLED = 'false';
process.env.MEDIA_ROOT =
  process.env.TEST_MEDIA_ROOT ||
  path.join(os.tmpdir(), 'modulate-test-media');
process.env.MUSIC_ROOT =
  process.env.TEST_MUSIC_ROOT ||
  path.join(os.tmpdir(), 'modulate-test-music');
process.env.DATA_DIR = path.join(os.tmpdir(), 'modulate-test-data');

const request = require('supertest');
const { createApp } = require('../app');
const { pool } = require('../db/pool');
const { migrate } = require('../db/migrate');

function ensureMediaRoot() {
  fs.mkdirSync(process.env.MEDIA_ROOT, { recursive: true });
  fs.mkdirSync(process.env.MUSIC_ROOT, { recursive: true });
}

async function resetDatabase() {
  await pool.query('TRUNCATE users, user_sessions RESTART IDENTITY CASCADE');
  await pool.query(
    'UPDATE instance_settings SET allow_registration = true WHERE id = true',
  ).catch(() => {});
}

async function makeApp() {
  ensureMediaRoot();
  await migrate();
  await resetDatabase();
  return createApp();
}

async function register(agent, email = `test-${Date.now()}@example.com`) {
  const response = await agent
    .post('/auth/register')
    .send({ email, password: 'password123', displayName: 'Test User' })
    .expect(201);
  return { email, password: 'password123', user: response.body.user };
}

async function onboard(agent, input = {}) {
  const response = await agent
    .post('/api/v1/onboarding/complete')
    .send({ timezone: 'UTC', ...input })
    .expect(201);
  return response.body.data;
}

async function seedTrack(userId, overrides = {}) {
  ensureMediaRoot();
  const id = crypto.randomUUID();
  const directory = path.join(process.env.MEDIA_ROOT, userId, id);
  fs.mkdirSync(directory, { recursive: true });
  const audio = path.join(directory, 'audio.m4a');
  fs.writeFileSync(audio, Buffer.from('fake-m4a-audio-for-tests'));
  const artwork = path.join(directory, 'cover.jpg');
  fs.writeFileSync(artwork, Buffer.from('fake-jpeg-artwork'));

  const values = {
    id,
    userId,
    title: overrides.title || 'Test track',
    artist: overrides.artist || 'Test artist',
    album: overrides.album ?? 'Test album',
    albumArtist: overrides.albumArtist ?? 'Test artist',
    trackNumber: overrides.trackNumber ?? 1,
    releaseYear: overrides.releaseYear ?? 2024,
    durationSeconds: overrides.durationSeconds ?? 180,
    filePath: overrides.filePath || path.posix.join(userId, id, 'audio.m4a'),
    artworkPath: overrides.artworkPath || path.posix.join(userId, id, 'cover.jpg'),
    sourceId: overrides.sourceId || `source-${id}`,
    sourceUrl: overrides.sourceUrl || 'https://example.com/watch?v=test',
    isFavorite: overrides.isFavorite ?? false,
  };
  const { rows } = await pool.query(
    `INSERT INTO tracks (
       id, created_by, title, artist, album, album_artist, track_number,
       release_year, duration_seconds, file_path, artwork_path,
       source_id, source_url, source_kind
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'url')
     RETURNING *`,
    [
      values.id,
      values.userId,
      values.title,
      values.artist,
      values.album,
      values.albumArtist,
      values.trackNumber,
      values.releaseYear,
      values.durationSeconds,
      values.filePath,
      values.artworkPath,
      values.sourceId,
      values.sourceUrl,
    ],
  );
  if (values.isFavorite) {
    await pool.query(
      `INSERT INTO track_favorites (user_id, track_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [values.userId, values.id],
    );
  }
  if (overrides.createdAt) {
    await pool.query('UPDATE tracks SET created_at = $2 WHERE id = $1', [
      values.id,
      overrides.createdAt,
    ]);
    rows[0].created_at = overrides.createdAt;
  }
  return rows[0];
}

module.exports = {
  request,
  pool,
  makeApp,
  resetDatabase,
  register,
  onboard,
  seedTrack,
  ensureMediaRoot,
};
