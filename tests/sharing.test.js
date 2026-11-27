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

test('playlists are private, shareable with users, and public on the instance', async () => {
  const owner = request.agent(app);
  const viewer = request.agent(app);
  const stranger = request.agent(app);
  const ownerUser = await register(owner, 'owner-share@example.com');
  const viewerUser = await register(viewer, 'viewer-share@example.com');
  await register(stranger, 'stranger-share@example.com');
  const track = await seedTrack(ownerUser.user.id, { title: 'Shared song' });

  const created = await owner
    .post('/api/v1/playlists')
    .send({ name: 'Private first' })
    .expect(201);
  const id = created.body.data.id;
  await owner
    .post(`/api/v1/playlists/${id}/tracks`)
    .send({ trackId: track.id })
    .expect(200);

  await viewer.get(`/api/v1/playlists/${id}`).expect(404);
  await stranger.get(`/api/v1/playlists/${id}`).expect(404);

  const directory = await viewer.get('/api/v1/users/directory').expect(200);
  assert.equal(
    directory.body.data.some((user) => user.id === ownerUser.user.id),
    true,
  );

  const shared = await owner
    .post(`/api/v1/playlists/${id}/shares`)
    .send({ userId: viewerUser.user.id })
    .expect(200);
  assert.equal(shared.body.data.length, 1);
  assert.equal(shared.body.data[0].userId, viewerUser.user.id);

  const viewerView = await viewer.get(`/api/v1/playlists/${id}`).expect(200);
  assert.equal(viewerView.body.data.relationship, 'shared');
  assert.equal(viewerView.body.data.canEdit, false);
  assert.equal(viewerView.body.data.tracks.length, 1);

  await viewer
    .patch(`/api/v1/playlists/${id}`)
    .send({ name: 'Nope' })
    .expect(403);
  await viewer
    .post(`/api/v1/playlists/${id}/tracks`)
    .send({ trackId: track.id })
    .expect(403);

  const viewerList = await viewer.get('/api/v1/playlists').expect(200);
  assert.equal(viewerList.body.data.length, 1);
  assert.equal(viewerList.body.data[0].relationship, 'shared');

  const publicPlaylist = await owner
    .patch(`/api/v1/playlists/${id}/visibility`)
    .send({ visibility: 'public' })
    .expect(200);
  assert.equal(publicPlaylist.body.data.visibility, 'public');

  const strangerView = await stranger
    .get(`/api/v1/playlists/${id}`)
    .expect(200);
  assert.equal(strangerView.body.data.relationship, 'public');
  assert.equal(strangerView.body.data.canEdit, false);

  const publicList = await stranger.get('/api/v1/playlists').expect(200);
  assert.equal(publicList.body.data[0].visibility, 'public');

  await owner
    .delete(`/api/v1/playlists/${id}/shares/${viewerUser.user.id}`)
    .expect(200);
  await owner
    .patch(`/api/v1/playlists/${id}/visibility`)
    .send({ visibility: 'private' })
    .expect(200);

  await viewer.get(`/api/v1/playlists/${id}`).expect(404);
  await stranger.get(`/api/v1/playlists/${id}`).expect(404);
});

test('only the owner can share or unshare, and self-shares are rejected', async () => {
  const owner = request.agent(app);
  const viewer = request.agent(app);
  const ownerUser = await register(owner, 'share-owner@example.com');
  const viewerUser = await register(viewer, 'share-viewer@example.com');
  const created = await owner
    .post('/api/v1/playlists')
    .send({ name: 'Owner only' })
    .expect(201);
  const id = created.body.data.id;

  await owner
    .post(`/api/v1/playlists/${id}/shares`)
    .send({ userId: ownerUser.user.id })
    .expect(400);

  await viewer
    .post(`/api/v1/playlists/${id}/shares`)
    .send({ userId: ownerUser.user.id })
    .expect(404);

  await owner
    .post(`/api/v1/playlists/${id}/shares`)
    .send({ userId: viewerUser.user.id })
    .expect(200);
});

test('favourites are personal across the shared library', async () => {
  const first = request.agent(app);
  const second = request.agent(app);
  const firstUser = await register(first, 'favourite-one@example.com');
  await register(second, 'favourite-two@example.com');
  const track = await seedTrack(firstUser.user.id);

  await first
    .patch(`/api/v1/tracks/${track.id}`)
    .send({ isFavorite: true })
    .expect(200);

  const firstView = await first.get(`/api/v1/tracks/${track.id}`).expect(200);
  const secondView = await second.get(`/api/v1/tracks/${track.id}`).expect(200);
  assert.equal(firstView.body.data.isFavorite, true);
  assert.equal(secondView.body.data.isFavorite, false);

  const firstFavorites = await first
    .get('/api/v1/tracks?favorite=true')
    .expect(200);
  const secondFavorites = await second
    .get('/api/v1/tracks?favorite=true')
    .expect(200);
  assert.equal(firstFavorites.body.data.tracks.length, 1);
  assert.equal(secondFavorites.body.data.tracks.length, 0);
});
