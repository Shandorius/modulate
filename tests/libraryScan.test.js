const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  request,
  pool,
  makeApp,
  resetDatabase,
  register,
  ensureMediaRoot,
} = require('./helpers');
const libraryScanService = require('../services/libraryScanService');

let app;

test.before(async () => {
  app = await makeApp();
});

test.beforeEach(async () => {
  await resetDatabase();
  await pool.query('DELETE FROM library_sources');
  fs.rmSync(process.env.MUSIC_ROOT, { recursive: true, force: true });
  ensureMediaRoot();
});

test.after(async () => {
  await pool.end();
});

function makeFixture(relative = 'Artist/Album/song.m4a') {
  const target = path.join(process.env.MUSIC_ROOT, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=1',
    '-c:a',
    'aac',
    '-metadata',
    'title=Scanned Song',
    '-metadata',
    'artist=Scanner Artist',
    '-metadata',
    'album=Scanned Album',
    target,
  ]);
  return target;
}

test('an admin can scan a read-only music folder and remove the index entry', async () => {
  const agent = request.agent(app);
  await register(agent, 'scanner@example.com');
  const musicFile = makeFixture();

  const started = await agent
    .post('/api/v1/admin/library/scan')
    .expect(202);
  assert.equal(started.body.data.status, 'running');

  let status;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const response = await agent.get('/api/v1/admin/library').expect(200);
    status = response.body.data;
    if (status.status !== 'running') break;
  }

  assert.equal(status.status, 'completed');
  assert.equal(status.trackCount, 1);
  assert.equal(status.addedCount, 1);

  const tracks = await agent.get('/api/v1/tracks?limit=10').expect(200);
  const track = tracks.body.data.tracks[0];
  assert.equal(track.title, 'Scanned Song');
  assert.equal(track.artist, 'Scanner Artist');
  assert.equal(track.storageKind, 'external');

  const { rows } = await pool.query(
    'SELECT file_path, storage_kind, library_source_id FROM tracks WHERE id = $1',
    [track.id],
  );
  assert.equal(rows[0].storage_kind, 'external');
  assert.ok(rows[0].library_source_id);
  assert.equal(rows[0].file_path, 'Artist/Album/song.m4a');

  await agent.delete(`/api/v1/tracks/${track.id}`).expect(200);
  assert.equal(fs.existsSync(musicFile), true);
  const after = await agent.get('/api/v1/tracks?limit=10').expect(200);
  assert.equal(after.body.data.tracks.length, 0);
});

test('a non-admin cannot scan the library', async () => {
  const admin = request.agent(app);
  await register(admin, 'scanner-admin@example.com');
  const member = request.agent(app);
  await register(member, 'scanner-member@example.com');

  await member.get('/api/v1/admin/library').expect(403);
  await member.post('/api/v1/admin/library/scan').expect(403);
});

test('scanning the same file updates rather than duplicates it', async () => {
  const agent = request.agent(app);
  await register(agent, 'scanner-idempotent@example.com');
  makeFixture('song2.m4a');

  await agent.post('/api/v1/admin/library/scan').expect(202);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const response = await agent.get('/api/v1/admin/library').expect(200);
    if (response.body.data.status !== 'running') break;
  }

  await agent.post('/api/v1/admin/library/scan').expect(202);
  let status;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const response = await agent.get('/api/v1/admin/library').expect(200);
    status = response.body.data;
    if (status.status !== 'running') break;
  }
  assert.equal(status.status, 'completed');
  assert.equal(status.updatedCount, 1);
  const { rows } = await pool.query('SELECT count(*)::int AS count FROM tracks');
  assert.equal(rows[0].count, 1);
});
