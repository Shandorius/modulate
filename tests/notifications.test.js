const test = require('node:test');
const assert = require('node:assert/strict');
const {
  request,
  pool,
  makeApp,
  resetDatabase,
  register,
  onboard,
} = require('./helpers');
const notificationService = require('../services/notificationService');
const notificationRules = require('../services/notificationRules');

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

const originalRules = notificationRules.candidatesForDate;

function useRules() {
  notificationRules.candidatesForDate = async ({ date }) => [
    {
      key: `morning:${date}`,
      kind: 'morning_plan',
      title: 'Your first reminder',
      body: 'Open the app to see today\'s list.',
      scheduledMinutes: 8 * 60,
      data: { route: '/app/home' },
    },
    {
      key: `evening:${date}`,
      kind: 'evening',
      title: 'A second reminder is ready.',
      body: 'It only takes a moment.',
      scheduledMinutes: 18 * 60,
      data: { route: '/app/home' },
    },
    {
      key: `banned:${date}`,
      kind: 'reminder',
      title: 'You are behind',
      body: 'This should be filtered.',
      scheduledMinutes: 12 * 60,
    },
  ];
}

test.afterEach(() => {
  notificationRules.candidatesForDate = originalRules;
});

test('preferences default to a limited plan', async () => {
  const agent = request.agent(app);
  await register(agent, 'prefs@example.com');

  const response = await agent
    .get('/api/v1/notifications/preferences')
    .expect(200);
  assert.equal(response.body.data.pushEnabled, true);
  assert.equal(response.body.data.morningPlan, true);
  assert.equal(response.body.data.maxPerDay, 2);
  assert.equal(response.body.data.quietStart, '21:00');
});

test('the local plan applies rules, quiet hours, future-only, and copy lint', async () => {
  const agent = request.agent(app);
  const { user } = await register(agent, 'plan@example.com');
  await onboard(agent);
  useRules();

  const today = new Date().toISOString().slice(0, 10);
  const plan = await notificationService.buildLocalPlan(user.id, {
    days: 1,
    now: new Date(`${today}T05:00:00Z`),
  });

  assert.equal(plan.notifications.length, 2);
  assert.deepEqual(
    plan.notifications.map((item) => item.kind),
    ['morning_plan', 'evening'],
  );
  assert.equal(
    plan.notifications.some((item) => item.title.includes('behind')),
    false,
  );

  await notificationService.updatePreferences(user.id, {
    quietStart: '07:00',
    quietEnd: '09:00',
    maxPerDay: 1,
  });
  const quiet = await notificationService.buildLocalPlan(user.id, {
    days: 1,
    now: new Date(`${today}T05:00:00Z`),
  });
  assert.equal(quiet.notifications.length, 1);
  assert.equal(quiet.notifications[0].kind, 'evening');
});

test('test notifications are logged without a remote push service', async () => {
  const agent = request.agent(app);
  await register(agent, 'test@example.com');

  const response = await agent
    .post('/api/v1/notifications/test')
    .expect(201);
  assert.equal(response.body.data.driver, 'local');
  assert.equal(response.body.data.log.kind, 'test');

  const history = await agent
    .get('/api/v1/notifications/history')
    .expect(200);
  assert.equal(history.body.data.length, 1);
});

test('the copy linter blocks shame language', () => {
  assert.equal(notificationService.isBannedCopy('You are behind'), true);
  assert.equal(notificationService.isBannedCopy('This is a normal update'), false);
});
