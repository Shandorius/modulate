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

test('player state, queue, presence, and transport actions work', async () => {
  const agent = request.agent(app);
  const { user } = await register(agent, 'player@example.com');
  const first = await seedTrack(user.id, { title: 'First' });
  const second = await seedTrack(user.id, { title: 'Second' });

  await agent
    .post('/api/v1/player/presence')
    .send({ clientId: 'browser-one', platform: 'web' })
    .expect(200);

  const played = await agent
    .post('/api/v1/player/action')
    .send({
      action: 'play_track',
      trackId: first.id,
      trackIds: [first.id, second.id],
    })
    .expect(200);
  assert.equal(played.body.data.current.id, first.id);
  assert.equal(played.body.data.state.isPlaying, true);
  assert.equal(played.body.data.queue.length, 2);
  const revisionAfterPlay = played.body.data.state.revision;

  const reportWithoutChange = await agent
    .post('/api/v1/player/action')
    .send({ action: 'report', positionSeconds: 5, isPlaying: true })
    .expect(200);
  assert.equal(
    reportWithoutChange.body.data.state.revision,
    revisionAfterPlay,
  );

  const paused = await agent
    .post('/api/v1/player/action')
    .send({ action: 'pause' })
    .expect(200);
  assert.equal(paused.body.data.state.isPlaying, false);
  assert.equal(paused.body.data.state.revision, revisionAfterPlay + 1);
  assert.equal(paused.body.data.state.lastAction, 'pause');

  await agent
    .post('/api/v1/player/action')
    .send({ action: 'seek', positionSeconds: 32 })
    .expect(200);
  const next = await agent
    .post('/api/v1/player/action')
    .send({ action: 'next' })
    .expect(200);
  assert.equal(next.body.data.current.id, second.id);
  assert.equal(next.body.data.state.positionSeconds, 0);

  const report = await agent
    .post('/api/v1/player/action')
    .send({ action: 'report', positionSeconds: 12, isPlaying: true })
    .expect(200);
  assert.equal(report.body.data.state.positionSeconds, 12);

  const volume = await agent
    .post('/api/v1/player/action')
    .send({ action: 'volume', volume: 0.4 })
    .expect(200);
  assert.equal(volume.body.data.state.volume, 0.4);
});

test('playlist playback replaces the queue', async () => {
  const agent = request.agent(app);
  const { user } = await register(agent, 'queue@example.com');
  const first = await seedTrack(user.id, { title: 'First' });
  const second = await seedTrack(user.id, { title: 'Second' });
  const playlist = await agent
    .post('/api/v1/playlists')
    .send({ name: 'Queue test' })
    .expect(201);
  await agent
    .post(`/api/v1/playlists/${playlist.body.data.id}/tracks`)
    .send({ trackId: first.id })
    .expect(200);
  await agent
    .post(`/api/v1/playlists/${playlist.body.data.id}/tracks`)
    .send({ trackId: second.id })
    .expect(200);

  const played = await agent
    .post('/api/v1/player/action')
    .send({ action: 'play_playlist', playlistId: playlist.body.data.id })
    .expect(200);
  assert.equal(played.body.data.current.id, first.id);
  assert.equal(played.body.data.state.contextType, 'playlist');
  assert.equal(played.body.data.queue.length, 2);
});

test('Home Assistant cannot control an offline player', async () => {
  const agent = request.agent(app);
  const { email } = await register(agent, 'offline@example.com');
  const login = await request(app)
    .post('/auth/mobile/login')
    .send({ email, password: 'password123', platform: 'android' })
    .expect(200);

  const response = await request(app)
    .post('/api/v1/ha/command')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({ action: 'pause' })
    .expect(409);
  assert.equal(response.body.error.code, 'CONFLICT');
});

test('Home Assistant controls an active player and reads state', async () => {
  const agent = request.agent(app);
  const { email, user } = await register(agent, 'ha-player@example.com');
  const track = await seedTrack(user.id);
  await agent
    .post('/api/v1/player/presence')
    .send({ clientId: 'web-player', platform: 'web' })
    .expect(200);
  await agent
    .post('/api/v1/player/action')
    .send({ action: 'play_track', trackId: track.id })
    .expect(200);

  const login = await request(app)
    .post('/auth/mobile/login')
    .send({ email, password: 'password123', platform: 'android' })
    .expect(200);
  const auth = { Authorization: `Bearer ${login.body.token}` };

  const state = await request(app).get('/api/v1/ha/state').set(auth).expect(200);
  assert.equal(state.body.data.current.id, track.id);
  assert.equal(state.body.data.activePlayers, 1);

  const paused = await request(app)
    .post('/api/v1/ha/command')
    .set(auth)
    .send({ action: 'pause' })
    .expect(200);
  assert.equal(paused.body.data.state.isPlaying, false);

  const announced = await request(app)
    .post('/api/v1/ha/announcements')
    .set(auth)
    .send({ message: 'Dinner is ready', ttlSeconds: 60 })
    .expect(201);
  assert.equal(announced.body.data.announcement.message, 'Dinner is ready');

  const ack = await request(app)
    .post('/api/v1/player/action')
    .set(auth)
    .send({
      action: 'ack_announcement',
      announcementId: announced.body.data.announcement.id,
    })
    .expect(200);
  assert.equal(ack.body.data.announcement, null);
});

test('player state is isolated between users', async () => {
  const owner = request.agent(app);
  const other = request.agent(app);
  const { user } = await register(owner, 'player-owner@example.com');
  await register(other, 'player-other@example.com');
  const track = await seedTrack(user.id);
  await owner
    .post('/api/v1/player/presence')
    .send({ clientId: 'owner-web' })
    .expect(200);
  await owner
    .post('/api/v1/player/action')
    .send({ action: 'play_track', trackId: track.id })
    .expect(200);

  const otherState = await other.get('/api/v1/player/state').expect(200);
  assert.equal(otherState.body.data.current, null);
  assert.equal(otherState.body.data.activePlayers, 0);
});
