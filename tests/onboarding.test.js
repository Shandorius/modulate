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

test('onboarding stores the timezone and completes the profile', async () => {
  const agent = request.agent(app);
  await register(agent, 'onboarding@example.com');

  const state = await agent.get('/api/v1/onboarding').expect(200);
  assert.equal(state.body.data.completed, false);

  const completed = await agent
    .post('/api/v1/onboarding/complete')
    .send({
      timezone: 'Europe/Amsterdam',
      metadata: { source: 'test' },
    })
    .expect(201);

  assert.equal(completed.body.data.profile.timezone, 'Europe/Amsterdam');
  assert.equal(completed.body.data.profile.onboardingCompleted, true);

  const me = await agent.get('/api/v1/me').expect(200);
  assert.equal(me.body.data.profile.onboardingCompleted, true);
  assert.equal(me.body.data.tier, 'oss');
});
