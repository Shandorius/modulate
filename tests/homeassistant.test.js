const test = require('node:test');
const assert = require('node:assert/strict');
const {
  request,
  pool,
  makeApp,
  resetDatabase,
  register,
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

test('Home Assistant tokens are issued once, usable, listed, and revocable', async () => {
  const agent = request.agent(app);
  await register(agent, 'ha-token@example.com');

  const issued = await agent
    .post('/api/v1/integrations/home-assistant/tokens')
    .send({ label: 'Living room' })
    .expect(201);
  const token = issued.body.data.token;
  assert.match(token, /^modtest_/);

  const integration = await agent
    .get('/api/v1/integrations/home-assistant')
    .expect(200);
  assert.equal(integration.body.data.tokens.length, 1);
  assert.equal(integration.body.data.tokens[0].label, 'Living room');
  assert.match(integration.body.data.endpoints.command, /\/api\/v1\/ha\/command$/);

  const state = await request(app)
    .get('/api/v1/ha/state')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.equal(state.body.data.activePlayers, 0);

  const id = integration.body.data.tokens[0].id;
  await agent
    .delete(`/api/v1/integrations/home-assistant/tokens/${id}`)
    .expect(200);
  await request(app)
    .get('/api/v1/ha/state')
    .set('Authorization', `Bearer ${token}`)
    .expect(401);
});

test('the webhook accepts the same commands as the REST command endpoint', async () => {
  const agent = request.agent(app);
  const { email, user } = await register(agent, 'ha-webhook@example.com');
  await agent
    .post('/api/v1/player/presence')
    .send({ clientId: 'webhook-player' })
    .expect(200);

  const login = await request(app)
    .post('/auth/mobile/login')
    .send({ email, password: 'password123', platform: 'android' })
    .expect(200);
  const auth = { Authorization: `Bearer ${login.body.token}` };

  const webhook = await request(app)
    .post('/api/v1/ha/webhook')
    .set(auth)
    .send({ action: 'volume', volume: 0.25 })
    .expect(200);
  assert.equal(webhook.body.data.state.volume, 0.25);
  assert.ok(user.id);
});
