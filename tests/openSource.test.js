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

test('Modulate reports open-source access without paid limits', async () => {
  const agent = request.agent(app);
  await register(agent, 'oss@example.com');
  const me = await agent.get('/api/v1/me').expect(200);
  const entitlements = me.body.data.entitlements;
  assert.equal(me.body.data.tier, 'oss');
  assert.equal(entitlements.allFeatures, true);
  assert.equal(entitlements.maxTracks, null);
  assert.equal(entitlements.maxPlaylists, null);
  assert.equal(entitlements.homeAssistant, true);
  assert.equal(entitlements.beta, false);
});

test('the notification rules use library activity without shame copy', async () => {
  const notificationService = require('../services/notificationService');
  const { user } = await (async () => {
    const agent = request.agent(app);
    return register(agent, 'rules@example.com');
  })();

  const { rows } = await pool.query(
    `INSERT INTO tracks (created_by, title, artist, file_path, source_id)
     VALUES ($1, 'New record', 'Artist', 'rules/audio.m4a', 'rules-source')
     RETURNING id`,
    [user.id],
  );
  await pool.query(
    `INSERT INTO play_history (user_id, track_id, played_at)
     VALUES ($1, $2, now() - interval '3 days')`,
    [user.id, rows[0].id],
  );

  const plan = await notificationService.buildLocalPlan(user.id, {
    days: 7,
    now: new Date(),
  });
  const text = JSON.stringify(plan).toLowerCase();
  assert.ok(plan.notifications.length >= 1);
  assert.equal(text.includes('overdue'), false);
  assert.equal(text.includes('missed'), false);
  assert.equal(text.includes('behind'), false);
});
