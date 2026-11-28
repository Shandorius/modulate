const test = require('node:test');
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

async function seedSortedLibrary(userId) {
  return {
    oldest: await seedTrack(userId, {
      title: 'Zebra',
      artist: 'Amber',
      album: 'Third',
      createdAt: '2024-01-01T00:00:00Z',
    }),
    middle: await seedTrack(userId, {
      title: 'Apple',
      artist: 'Cobalt',
      album: 'Second',
      createdAt: '2024-06-01T00:00:00Z',
    }),
    newest: await seedTrack(userId, {
      title: 'Mango',
      artist: 'Beryl',
      album: 'First',
      createdAt: '2024-12-01T00:00:00Z',
    }),
  };
}

test('the library supports newest, oldest, title, artist, and album sorting', async () => {
  const agent = request.agent(app);
  const { user } = await register(agent, 'sort@example.com');
  const tracks = await seedSortedLibrary(user.id);

  const newest = await agent
    .get('/api/v1/tracks?sort=recent&limit=10')
    .expect(200);
  assert.deepEqual(
    newest.body.data.tracks.map((track) => track.title),
    ['Mango', 'Apple', 'Zebra'],
  );
  assert.equal(newest.body.data.total, 3);

  const oldest = await agent
    .get('/api/v1/tracks?sort=oldest&limit=10')
    .expect(200);
  assert.deepEqual(
    oldest.body.data.tracks.map((track) => track.title),
    ['Zebra', 'Apple', 'Mango'],
  );

  const title = await agent
    .get('/api/v1/tracks?sort=title&limit=10')
    .expect(200);
  assert.deepEqual(
    title.body.data.tracks.map((track) => track.title),
    ['Apple', 'Mango', 'Zebra'],
  );

  const artist = await agent
    .get('/api/v1/tracks?sort=artist&limit=10')
    .expect(200);
  assert.deepEqual(
    artist.body.data.tracks.map((track) => track.artist),
    ['Amber', 'Beryl', 'Cobalt'],
  );

  const album = await agent
    .get('/api/v1/tracks?sort=album&limit=10')
    .expect(200);
  assert.deepEqual(
    album.body.data.tracks.map((track) => track.album),
    ['First', 'Second', 'Third'],
  );

  const bad = await agent.get('/api/v1/tracks?sort=sideways').expect(400);
  assert.equal(bad.body.error.code, 'VALIDATION_ERROR');

  assert.equal(newest.body.data.tracks[0].id, tracks.newest.id);
});

test('the library paginates beyond the first page', async () => {
  const agent = request.agent(app);
  const { user } = await register(agent, 'page@example.com');
  for (let index = 0; index < 5; index += 1) {
    await seedTrack(user.id, {
      title: `Page ${index}`,
      createdAt: `2024-0${index + 1}-01T00:00:00Z`,
    });
  }

  const first = await agent
    .get('/api/v1/tracks?sort=oldest&limit=2&offset=0')
    .expect(200);
  assert.deepEqual(
    first.body.data.tracks.map((track) => track.title),
    ['Page 0', 'Page 1'],
  );
  assert.equal(first.body.data.total, 5);

  const second = await agent
    .get('/api/v1/tracks?sort=oldest&limit=2&offset=2')
    .expect(200);
  assert.deepEqual(
    second.body.data.tracks.map((track) => track.title),
    ['Page 2', 'Page 3'],
  );

  const third = await agent
    .get('/api/v1/tracks?sort=oldest&limit=2&offset=4')
    .expect(200);
  assert.deepEqual(
    third.body.data.tracks.map((track) => track.title),
    ['Page 4'],
  );
});

test('the whole-library id list respects sort and search', async () => {
  const agent = request.agent(app);
  const { user } = await register(agent, 'ids@example.com');
  const tracks = await seedSortedLibrary(user.id);
  await seedTrack(user.id, { title: 'Other', artist: 'Nobody' });

  const ids = await agent
    .get('/api/v1/tracks/ids?sort=oldest')
    .expect(200);
  assert.equal(ids.body.data.ids.length, 4);
  assert.equal(ids.body.data.ids[0], tracks.oldest.id);

  const search = await agent
    .get('/api/v1/tracks/ids?sort=title&q=apple')
    .expect(200);
  assert.deepEqual(search.body.data.ids, [tracks.middle.id]);
});

test('available tracks exclude the playlist and support search, sort, and paging', async () => {
  const owner = request.agent(app);
  const { user } = await register(owner, 'available@example.com');
  const tracks = await seedSortedLibrary(user.id);
  const created = await owner
    .post('/api/v1/playlists')
    .send({ name: 'Available' })
    .expect(201);
  const id = created.body.data.id;
  await owner
    .post(`/api/v1/playlists/${id}/tracks`)
    .send({ trackId: tracks.middle.id })
    .expect(200);

  const all = await owner
    .get(`/api/v1/playlists/${id}/available-tracks?sort=recent&limit=50`)
    .expect(200);
  assert.deepEqual(
    all.body.data.tracks.map((track) => track.title),
    ['Mango', 'Zebra'],
  );
  assert.equal(all.body.data.total, 2);

  const byTitle = await owner
    .get(`/api/v1/playlists/${id}/available-tracks?q=mango`)
    .expect(200);
  assert.deepEqual(
    byTitle.body.data.tracks.map((track) => track.title),
    ['Mango'],
  );

  const byArtist = await owner
    .get(`/api/v1/playlists/${id}/available-tracks?q=amber`)
    .expect(200);
  assert.deepEqual(
    byArtist.body.data.tracks.map((track) => track.title),
    ['Zebra'],
  );

  const byAlbum = await owner
    .get(`/api/v1/playlists/${id}/available-tracks?q=third`)
    .expect(200);
  assert.deepEqual(
    byAlbum.body.data.tracks.map((track) => track.title),
    ['Zebra'],
  );

  const excluded = await owner
    .get(`/api/v1/playlists/${id}/available-tracks?q=second`)
    .expect(200);
  assert.deepEqual(excluded.body.data.tracks, []);
  assert.equal(excluded.body.data.total, 0);

  const firstPage = await owner
    .get(`/api/v1/playlists/${id}/available-tracks?sort=oldest&limit=1&offset=0`)
    .expect(200);
  assert.deepEqual(
    firstPage.body.data.tracks.map((track) => track.title),
    ['Zebra'],
  );
  const secondPage = await owner
    .get(`/api/v1/playlists/${id}/available-tracks?sort=oldest&limit=1&offset=1`)
    .expect(200);
  assert.deepEqual(
    secondPage.body.data.tracks.map((track) => track.title),
    ['Mango'],
  );

  await owner
    .post(`/api/v1/playlists/${id}/tracks`)
    .send({ trackId: tracks.newest.id })
    .expect(200);
  const afterAdd = await owner
    .get(`/api/v1/playlists/${id}/available-tracks?sort=recent`)
    .expect(200);
  assert.deepEqual(
    afterAdd.body.data.tracks.map((track) => track.title),
    ['Zebra'],
  );
  assert.equal(afterAdd.body.data.total, 1);
});

test('viewers and strangers cannot list available tracks, editors can', async () => {
  const owner = request.agent(app);
  const viewer = request.agent(app);
  const editor = request.agent(app);
  const stranger = request.agent(app);
  const ownerUser = await register(owner, 'avail-owner@example.com');
  const viewerUser = await register(viewer, 'avail-viewer@example.com');
  const editorUser = await register(editor, 'avail-editor@example.com');
  await register(stranger, 'avail-stranger@example.com');
  await seedTrack(ownerUser.user.id, { title: 'Pick me' });

  const created = await owner
    .post('/api/v1/playlists')
    .send({ name: 'Private picks' })
    .expect(201);
  const id = created.body.data.id;
  await owner
    .post(`/api/v1/playlists/${id}/shares`)
    .send({ userId: viewerUser.user.id, role: 'viewer' })
    .expect(200);
  await owner
    .post(`/api/v1/playlists/${id}/shares`)
    .send({ userId: editorUser.user.id, role: 'editor' })
    .expect(200);

  await viewer
    .get(`/api/v1/playlists/${id}/available-tracks`)
    .expect(403);
  await stranger
    .get(`/api/v1/playlists/${id}/available-tracks`)
    .expect(404);
  const editorResults = await editor
    .get(`/api/v1/playlists/${id}/available-tracks`)
    .expect(200);
  assert.equal(editorResults.body.data.total, 1);
});
