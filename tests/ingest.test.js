const test = require('node:test');
const assert = require('node:assert/strict');
const {
  request,
  pool,
  makeApp,
  resetDatabase,
  register,
} = require('./helpers');
const ingestService = require('../services/ingestService');

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

test('private and non-http URLs are rejected', async () => {
  const agent = request.agent(app);
  await register(agent, 'urls@example.com');

  await agent
    .post('/api/v1/ingest')
    .send({ url: 'ftp://example.com/file' })
    .expect(400);
  await agent
    .post('/api/v1/ingest')
    .send({ url: 'http://localhost/private' })
    .expect(400);
  await agent
    .post('/api/v1/ingest')
    .send({ url: 'http://192.168.1.10/media' })
    .expect(400);
  await agent
    .post('/api/v1/ingest')
    .send({ url: 'http://[::1]/media' })
    .expect(400);

  assert.equal(ingestService.isPrivateIp('127.0.0.1'), true);
  assert.equal(ingestService.isPrivateIp('10.0.0.5'), true);
  assert.equal(ingestService.isPrivateIp('1.1.1.1'), false);
});

test('YouTube watch URLs default to a single track, not a radio mix', () => {
  const normalized = ingestService.normalizeSource(
    'https://www.youtube.com/watch?v=4zAThXFOy2c&list=RD4zAThXFOy2c&start_radio=1',
    'auto',
  );
  assert.equal(normalized.kind, 'track');
  assert.equal(
    normalized.url,
    'https://www.youtube.com/watch?v=4zAThXFOy2c',
  );

  const explicitPlaylist = ingestService.normalizeSource(
    'https://www.youtube.com/watch?v=4zAThXFOy2c&list=RD4zAThXFOy2c&start_radio=1',
    'playlist',
  );
  assert.equal(explicitPlaylist.kind, 'playlist');
  assert.match(explicitPlaylist.url, /list=RD4zAThXFOy2c/);

  const playlistUrl = ingestService.normalizeSource(
    'https://www.youtube.com/playlist?list=PL123',
    'auto',
  );
  assert.equal(playlistUrl.kind, 'playlist');
});

test('an import job can be created, inspected, cancelled, and retried', async () => {
  const agent = request.agent(app);
  await register(agent, 'jobs@example.com');

  const created = await agent
    .post('/api/v1/ingest')
    .send({ url: 'https://1.1.1.1/media', kind: 'track' })
    .expect(201);
  const job = created.body.data;
  assert.equal(job.status, 'queued');
  assert.equal(job.sourceKind, 'track');

  const list = await agent.get('/api/v1/ingest/jobs').expect(200);
  assert.equal(list.body.data.length, 1);
  assert.equal(list.body.data[0].id, job.id);

  const detail = await agent
    .get(`/api/v1/ingest/jobs/${job.id}`)
    .expect(200);
  assert.equal(detail.body.data.id, job.id);

  const cancelled = await agent
    .delete(`/api/v1/ingest/jobs/${job.id}`)
    .expect(200);
  assert.equal(cancelled.body.data.status, 'cancelled');

  const retried = await agent
    .post(`/api/v1/ingest/jobs/${job.id}/retry`)
    .expect(200);
  assert.equal(retried.body.data.status, 'queued');
});

test('import jobs are isolated between users', async () => {
  const owner = request.agent(app);
  const other = request.agent(app);
  await register(owner, 'job-owner@example.com');
  await register(other, 'job-other@example.com');
  const created = await owner
    .post('/api/v1/ingest')
    .send({ url: 'https://1.1.1.1/media' })
    .expect(201);

  await other
    .get(`/api/v1/ingest/jobs/${created.body.data.id}`)
    .expect(404);
  await other
    .delete(`/api/v1/ingest/jobs/${created.body.data.id}`)
    .expect(404);
  await other
    .post(`/api/v1/ingest/jobs/${created.body.data.id}/retry`)
    .expect(404);
});
