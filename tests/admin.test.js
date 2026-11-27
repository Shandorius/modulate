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
  await pool.query(
    'UPDATE instance_settings SET allow_registration = false WHERE id = true',
  );
});

test.after(async () => {
  await pool.end();
});

test('the first user becomes admin and registration closes afterwards', async () => {
  const admin = request.agent(app);
  const created = await register(admin, 'admin@example.com');
  assert.equal(created.user.user_type, 'admin');

  const status = await request(app)
    .get('/auth/registration-status')
    .expect(200);
  assert.equal(status.body.data.hasUsers, true);
  assert.equal(status.body.data.allowed, false);

  await request(app)
    .post('/auth/register')
    .send({
      email: 'closed@example.com',
      password: 'password123',
      displayName: 'Closed',
    })
    .expect(403);

  const users = await admin.get('/api/v1/admin/users').expect(200);
  assert.equal(users.body.data.length, 1);
  assert.equal(users.body.data[0].userType, 'admin');
});

test('admins create and manage users and can reopen registration', async () => {
  const admin = request.agent(app);
  await register(admin, 'admin-manage@example.com');

  const created = await admin
    .post('/api/v1/admin/users')
    .send({
      email: 'member@example.com',
      password: 'password123',
      displayName: 'Member',
      userType: 'user',
    })
    .expect(201);
  assert.equal(created.body.data.userType, 'user');

  const users = await admin.get('/api/v1/admin/users').expect(200);
  assert.equal(users.body.data.length, 2);

  const member = request.agent(app);
  await member
    .post('/auth/login')
    .send({ email: 'member@example.com', password: 'password123' })
    .expect(200);
  await member.get('/api/v1/admin/users').expect(403);

  const settings = await admin
    .put('/api/v1/admin/settings')
    .send({ allowRegistration: true })
    .expect(200);
  assert.equal(settings.body.data.allowRegistration, true);

  const selfRegistered = await request(app)
    .post('/auth/register')
    .send({
      email: 'open@example.com',
      password: 'password123',
      displayName: 'Open',
    })
    .expect(201);
  assert.equal(selfRegistered.body.user.user_type, 'user');

  await admin
    .patch(`/api/v1/admin/users/${created.body.data.id}`)
    .send({ userType: 'admin' })
    .expect(200);
  const demoted = await admin
    .patch(`/api/v1/admin/users/${created.body.data.id}`)
    .send({ userType: 'user' })
    .expect(200);
  assert.equal(demoted.body.data.userType, 'user');

  await admin
    .patch(`/api/v1/admin/users/${created.body.data.id}`)
    .send({ displayName: 'Renamed member' })
    .expect(200);
});

test('deleting a user keeps their shared-library tracks', async () => {
  const admin = request.agent(app);
  await register(admin, 'admin-delete@example.com');
  const created = await admin
    .post('/api/v1/admin/users')
    .send({
      email: 'uploader@example.com',
      password: 'password123',
      displayName: 'Uploader',
    })
    .expect(201);
  const track = await seedTrack(created.body.data.id, { title: 'Kept track' });

  await admin
    .delete(`/api/v1/admin/users/${created.body.data.id}`)
    .expect(200);

  const { rows } = await pool.query(
    'SELECT id, created_by FROM tracks WHERE id = $1',
    [track.id],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].created_by, null);
});

test('admins cannot delete themselves or remove the last admin', async () => {
  const admin = request.agent(app);
  const created = await register(admin, 'admin-last@example.com');
  await admin
    .delete(`/api/v1/admin/users/${created.user.id}`)
    .expect(400);
  await admin
    .patch(`/api/v1/admin/users/${created.user.id}`)
    .send({ userType: 'user' })
    .expect(409);
});
