const { pool } = require('../db/pool');

async function getSettings(db = pool) {
  await db.query(
    `INSERT INTO instance_settings (id) VALUES (true)
     ON CONFLICT (id) DO NOTHING`,
  );
  const { rows } = await db.query(
    'SELECT allow_registration, updated_at FROM instance_settings WHERE id = true',
  );
  return {
    allowRegistration: Boolean(rows[0]?.allow_registration),
    updatedAt: rows[0]?.updated_at,
  };
}

async function updateSettings(input, db = pool) {
  await getSettings(db);
  if (input.allowRegistration !== undefined) {
    await db.query(
      'UPDATE instance_settings SET allow_registration = $1 WHERE id = true',
      [Boolean(input.allowRegistration)],
    );
  }
  return getSettings(db);
}

async function registrationStatus(db = pool) {
  const { rows } = await db.query('SELECT count(*)::int AS count FROM users');
  const hasUsers = Number(rows[0]?.count) > 0;
  const settings = await getSettings(db);
  return {
    hasUsers,
    allowed: !hasUsers || settings.allowRegistration,
    firstUser: !hasUsers,
  };
}

module.exports = { getSettings, updateSettings, registrationStatus };
