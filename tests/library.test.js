const test = require('node:test');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const {
  request,
  pool,
  makeApp,
  resetDatabase,
  register,
  seedTrack,
} = require('./helpers');

let app;

test.before(async () => {
  app = await makeApp();
});

test.beforeEach(async () => {
  await resetDatabase();
});

test.after(async () => {
  await pool.end();
});

test('tracks can be listed, searched, edited, favourited, and deleted', async () => {
  const agent = request.agent(app);
  const { user } = await register(agent, 'library@example.com');
  const track = await seedTrack(user.id, {
    title: 'Amber Static',
    artist: 'Night Archive',
  });

  const list = await agent.get('/api/v1/tracks').expect(200);
  assert.equal(list.body.data.total, 1);
  assert.equal(list.body.data.tracks[0].title, 'Amber Static');
  assert.match(list.body.data.tracks[0].streamUrl, /^\/stream\//);

  const search = await agent
    .get('/api/v1/tracks?q=night&sort=artist')
    .expect(200);
  assert.equal(search.body.data.tracks.length, 1);

  const patch = await agent
    .patch(`/api/v1/tracks/${track.id}`)
    .send({ isFavorite: true, title: 'Amber Static (Edit)' })
    .expect(200);
  assert.equal(patch.body.data.isFavorite, true);
  assert.equal(patch.body.data.title, 'Amber Static (Edit)');

  const favorites = await agent
    .get('/api/v1/tracks?favorite=true')
    .expect(200);
  assert.equal(favorites.body.data.tracks.length, 1);

  const summary = await agent.get('/api/v1/tracks/summary').expect(200);
  assert.equal(summary.body.data.counts.tracks, 1);
  assert.equal(summary.body.data.counts.albums, 1);

  const trackDirectory = path.join(
    process.env.MEDIA_ROOT,
    user.id,
    track.id,
  );
  assert.equal(fs.existsSync(trackDirectory), true);

  await agent.delete(`/api/v1/tracks/${track.id}`).expect(200);
  await agent.get(`/api/v1/tracks/${track.id}`).expect(404);
  assert.equal(fs.existsSync(trackDirectory), false);
  assert.equal(fs.existsSync(path.join(process.env.MEDIA_ROOT, user.id)), false);
});

test('albums are derived from track metadata', async () => {
  const agent = request.agent(app);
  const { user } = await register(agent, 'albums@example.com');
  await seedTrack(user.id, { title: 'One', album: 'A Record' });
  await seedTrack(user.id, { title: 'Two', album: 'A Record' });

  const albums = await agent.get('/api/v1/tracks/albums').expect(200);
  assert.equal(albums.body.data.length, 1);
  assert.equal(albums.body.data[0].trackCount, 2);

  const detail = await agent
    .get('/api/v1/tracks/album?name=A%20Record')
    .expect(200);
  assert.equal(detail.body.data.tracks.length, 2);
});

test('playlists support create, add, reorder, remove, and delete', async () => {
  const agent = request.agent(app);
  const { user } = await register(agent, 'playlists@example.com');
  const first = await seedTrack(user.id, { title: 'First' });
  const second = await seedTrack(user.id, { title: 'Second' });

  const created = await agent
    .post('/api/v1/playlists')
    .send({ name: 'Late listening', description: 'Quiet hours' })
    .expect(201);
  const id = created.body.data.id;

  await agent
    .post(`/api/v1/playlists/${id}/tracks`)
    .send({ trackId: first.id })
    .expect(200);
  await agent
    .post(`/api/v1/playlists/${id}/tracks`)
    .send({ trackId: second.id })
    .expect(200);
  await agent
    .post(`/api/v1/playlists/${id}/tracks`)
    .send({ trackId: second.id })
    .expect(409);

  const reordered = await agent
    .put(`/api/v1/playlists/${id}/order`)
    .send({ trackIds: [second.id, first.id] })
    .expect(200);
  assert.deepEqual(
    reordered.body.data.tracks.map((track) => track.title),
    ['Second', 'First'],
  );

  await agent
    .delete(`/api/v1/playlists/${id}/tracks/${second.id}`)
    .expect(200);
  const detail = await agent.get(`/api/v1/playlists/${id}`).expect(200);
  assert.equal(detail.body.data.tracks.length, 1);

  await agent.delete(`/api/v1/playlists/${id}`).expect(200);
  await agent.get(`/api/v1/playlists/${id}`).expect(404);
});

test('the music library is shared while private playlists stay isolated', async () => {
  const owner = request.agent(app);
  const other = request.agent(app);
  const { user } = await register(owner, 'owner@example.com');
  await register(other, 'other@example.com');
  const track = await seedTrack(user.id);
  const playlist = await owner
    .post('/api/v1/playlists')
    .send({ name: 'Private' })
    .expect(201);

  const visible = await other.get(`/api/v1/tracks/${track.id}`).expect(200);
  assert.equal(visible.body.data.title, 'Test track');
  assert.equal(visible.body.data.isFavorite, false);

  const favourite = await other
    .patch(`/api/v1/tracks/${track.id}`)
    .send({ isFavorite: true })
    .expect(200);
  assert.equal(favourite.body.data.isFavorite, true);

  await other
    .patch(`/api/v1/tracks/${track.id}`)
    .send({ title: 'Not allowed' })
    .expect(403);
  await other.delete(`/api/v1/tracks/${track.id}`).expect(403);
  await other.get(`/api/v1/playlists/${playlist.body.data.id}`).expect(404);
  await other
    .post(`/api/v1/playlists/${playlist.body.data.id}/tracks`)
    .send({ trackId: track.id })
    .expect(404);
});

test('track validation rejects empty titles and malformed ids', async () => {
  const agent = request.agent(app);
  const { user } = await register(agent, 'validation@example.com');
  const track = await seedTrack(user.id);

  await agent
    .patch(`/api/v1/tracks/${track.id}`)
    .send({ title: '' })
    .expect(400);
  await agent.get('/api/v1/tracks/not-a-uuid').expect(400);
  await agent
    .post('/api/v1/playlists')
    .send({ name: '' })
    .expect(400);
});

test('signed audio URLs support range requests without an auth header', async () => {
  const agent = request.agent(app);
  const { user } = await register(agent, 'stream@example.com');
  const track = await seedTrack(user.id);
  const list = await agent.get('/api/v1/tracks').expect(200);
  const url = list.body.data.tracks[0].streamUrl;

  const response = await request(app)
    .get(url)
    .set('Range', 'bytes=0-3')
    .expect(206);
  assert.equal(response.headers['content-type'], 'audio/mp4');
  assert.equal(response.body.length, 4);

  const tampered = await request(app)
    .get(url.replace(/sig=.*/, 'sig=bad'))
    .expect(403);
  assert.equal(tampered.body.error.code, 'INVALID_STREAM');
});
