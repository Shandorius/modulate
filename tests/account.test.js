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

test('a user can update their display name', async () => {
  const agent = request.agent(app);
  const { user } = await register(agent, 'name@example.com');

  const response = await agent
    .patch('/api/v1/account')
    .send({ displayName: 'Alex Rivers' })
    .expect(200);

  assert.equal(response.body.data.user.id, user.id);
  assert.equal(response.body.data.user.displayName, 'Alex Rivers');
});

test('changing a password requires the current password', async () => {
  const agent = request.agent(app);
  const { email } = await register(agent, 'password@example.com');

  await agent
    .post('/api/v1/account/change-password')
    .send({ currentPassword: 'wrong-password', newPassword: 'newpassword123' })
    .expect(401);

  await agent
    .post('/api/v1/account/change-password')
    .send({ currentPassword: 'password123', newPassword: 'newpassword123' })
    .expect(200);

  await request(app)
    .post('/auth/login')
    .send({ email, password: 'newpassword123' })
    .expect(200);
});

test('mobile password change keeps the current token and revokes others', async () => {
  const first = await request(app)
    .post('/auth/mobile/register')
    .send({
      email: 'mobile@example.com',
      password: 'password123',
      platform: 'android',
      deviceId: 'phone-one',
    })
    .expect(201);

  const second = await request(app)
    .post('/auth/mobile/login')
    .send({
      email: 'mobile@example.com',
      password: 'password123',
      platform: 'android',
      deviceId: 'phone-two',
    })
    .expect(200);

  await request(app)
    .post('/api/v1/account/change-password')
    .set('Authorization', `Bearer ${first.body.token}`)
    .send({ currentPassword: 'password123', newPassword: 'newpassword123' })
    .expect(200);

  await request(app)
    .get('/api/v1/me')
    .set('Authorization', `Bearer ${first.body.token}`)
    .expect(200);

  await request(app)
    .get('/api/v1/me')
    .set('Authorization', `Bearer ${second.body.token}`)
    .expect(401);
});

test('deleting an account requires the password', async () => {
  const agent = request.agent(app);
  await register(agent, 'delete@example.com');

  await agent
    .delete('/api/v1/account')
    .send({ password: 'wrong-password' })
    .expect(401);

  await agent
    .delete('/api/v1/account')
    .send({ password: 'password123' })
    .expect(200);
});
