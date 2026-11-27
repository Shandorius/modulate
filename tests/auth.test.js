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

test('health endpoint reports a healthy database', async () => {
  const response = await request(app).get('/health').expect(200);
  assert.equal(response.body.status, 'ok');
  assert.match(response.body.service, /API$/);
});

test('web registration, login, status, and logout work', async () => {
  const agent = request.agent(app);
  const { email, password } = await register(agent, 'web@example.com');

  const status = await agent.get('/auth/status').expect(200);
  assert.equal(status.body.authenticated, true);
  assert.equal(status.body.user.email, email);

  await agent.get('/auth/logout').expect(200);
  await agent.get('/auth/status').expect(401);

  const login = await request(app)
    .post('/auth/login')
    .send({ email, password })
    .expect(200);
  assert.equal(login.body.user.email, email);
});

test('the protected profile endpoint creates a generic profile', async () => {
  const agent = request.agent(app);
  const { user } = await register(agent, 'profile@example.com');

  const me = await agent.get('/api/v1/me').expect(200);
  assert.equal(me.body.data.user.id, user.id);
  assert.equal(me.body.data.profile.timezone, 'UTC');
  assert.equal(me.body.data.profile.onboardingCompleted, false);
  assert.equal(me.body.data.auth.type, 'session');

  const updated = await agent
    .patch('/api/v1/me')
    .send({
      timezone: 'Europe/Amsterdam',
      onboardingComplete: true,
      metadata: { source: 'test' },
    })
    .expect(200);
  assert.equal(updated.body.data.timezone, 'Europe/Amsterdam');
  assert.equal(updated.body.data.onboardingCompleted, true);
  assert.deepEqual(updated.body.data.metadata, { source: 'test' });
});

test('invalid timezones are rejected', async () => {
  const agent = request.agent(app);
  await register(agent, 'timezone@example.com');

  const response = await agent
    .patch('/api/v1/me')
    .send({ timezone: 'Not/AZone' })
    .expect(400);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});

test('mobile registration returns a token that authenticates requests', async () => {
  const response = await request(app)
    .post('/auth/mobile/register')
    .send({
      email: 'mobile@example.com',
      password: 'password123',
      platform: 'android',
      deviceId: 'test-device',
    })
    .expect(201);

  assert.match(response.body.token, /^modtest_/);

  const me = await request(app)
    .get('/api/v1/me')
    .set('Authorization', `Bearer ${response.body.token}`)
    .expect(200);
  assert.equal(me.body.data.user.email, 'mobile@example.com');
  assert.equal(me.body.data.auth.type, 'bearer');

  await request(app)
    .post('/auth/mobile/logout')
    .set('Authorization', `Bearer ${response.body.token}`)
    .expect(200);

  await request(app)
    .get('/api/v1/me')
    .set('Authorization', `Bearer ${response.body.token}`)
    .expect(401);
});

test('mobile token refresh revokes the old token', async () => {
  const registered = await request(app)
    .post('/auth/mobile/register')
    .send({ email: 'refresh@example.com', password: 'password123' })
    .expect(201);
  const first = registered.body.token;

  const rotated = await request(app)
    .post('/auth/mobile/refresh')
    .set('Authorization', `Bearer ${first}`)
    .send({ platform: 'ios' })
    .expect(200);
  const second = rotated.body.token;
  assert.notEqual(first, second);

  await request(app)
    .get('/api/v1/me')
    .set('Authorization', `Bearer ${first}`)
    .expect(401);
  await request(app)
    .get('/api/v1/me')
    .set('Authorization', `Bearer ${second}`)
    .expect(200);
});
