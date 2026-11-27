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
  assert.equal(shared.body.data[0].role, 'viewer');

  const viewerView = await viewer.get(`/api/v1/playlists/${id}`).expect(200);
  assert.equal(viewerView.body.data.relationship, 'shared');
  assert.equal(viewerView.body.data.myRole, 'viewer');
  assert.equal(viewerView.body.data.canEditTracks, false);
  assert.equal(viewerView.body.data.canManage, false);
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

test('editors can manage tracks but not rename, delete, or share the playlist', async () => {
  const owner = request.agent(app);
  const editor = request.agent(app);
  const ownerUser = await register(owner, 'collab-owner@example.com');
  const editorUser = await register(editor, 'collab-editor@example.com');
  const first = await seedTrack(ownerUser.user.id, { title: 'One' });
  const second = await seedTrack(ownerUser.user.id, { title: 'Two' });
  const created = await owner
    .post('/api/v1/playlists')
    .send({ name: 'Collaborative' })
    .expect(201);
  const id = created.body.data.id;
  await owner
    .post(`/api/v1/playlists/${id}/tracks`)
    .send({ trackId: first.id })
    .expect(200);
  await owner
    .post(`/api/v1/playlists/${id}/tracks`)
    .send({ trackId: second.id })
    .expect(200);

  const shared = await owner
    .post(`/api/v1/playlists/${id}/shares`)
    .send({ userId: editorUser.user.id, role: 'editor' })
    .expect(200);
  assert.equal(shared.body.data[0].role, 'editor');

  const detail = await editor.get(`/api/v1/playlists/${id}`).expect(200);
  assert.equal(detail.body.data.myRole, 'editor');
  assert.equal(detail.body.data.canEditTracks, true);
  assert.equal(detail.body.data.canManage, false);

  const reordered = await editor
    .put(`/api/v1/playlists/${id}/order`)
    .send({ trackIds: [second.id, first.id] })
    .expect(200);
  assert.deepEqual(
    reordered.body.data.tracks.map((track) => track.title),
    ['Two', 'One'],
  );
  assert.equal(reordered.body.data.revision, detail.body.data.revision + 1);

  await editor
    .post(`/api/v1/playlists/${id}/tracks`)
    .send({ trackId: first.id })
    .expect(409);
  await editor
    .patch(`/api/v1/playlists/${id}`)
    .send({ name: 'Not allowed' })
    .expect(403);
  await editor
    .patch(`/api/v1/playlists/${id}/visibility`)
    .send({ visibility: 'public' })
    .expect(403);
  await editor.delete(`/api/v1/playlists/${id}`).expect(403);
  await editor
    .post(`/api/v1/playlists/${id}/shares`)
    .send({ userId: ownerUser.user.id, role: 'editor' })
    .expect(403);

  await owner
    .patch(`/api/v1/playlists/${id}/shares/${editorUser.user.id}`)
    .send({ role: 'viewer' })
    .expect(200);
  const downgraded = await editor.get(`/api/v1/playlists/${id}`).expect(200);
  assert.equal(downgraded.body.data.myRole, 'viewer');
  assert.equal(downgraded.body.data.canEditTracks, false);
});

test('reorders reject a stale playlist revision', async () => {
  const owner = request.agent(app);
  const { user } = await register(owner, 'revision@example.com');
  const first = await seedTrack(user.id, { title: 'Revision one' });
  const second = await seedTrack(user.id, { title: 'Revision two' });
  const created = await owner
    .post('/api/v1/playlists')
    .send({ name: 'Revision test' })
    .expect(201);
  const id = created.body.data.id;
  await owner
    .post(`/api/v1/playlists/${id}/tracks`)
    .send({ trackId: first.id })
    .expect(200);
  await owner
    .post(`/api/v1/playlists/${id}/tracks`)
    .send({ trackId: second.id })
    .expect(200);
  const detail = await owner.get(`/api/v1/playlists/${id}`).expect(200);
  const staleRevision = detail.body.data.revision;

  await owner
    .put(`/api/v1/playlists/${id}/order`)
    .send({ trackIds: [second.id, first.id], expectedRevision: staleRevision })
    .expect(200);

  const conflict = await owner
    .put(`/api/v1/playlists/${id}/order`)
    .send({ trackIds: [first.id, second.id], expectedRevision: staleRevision })
    .expect(409);
  assert.equal(conflict.body.error.code, 'CONFLICT');
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
