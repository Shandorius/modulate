/**
 * Optional table bootstrap for projects that copy the auth package without a
 * migration runner. Production apps should prefer their own migration and set
 * mobile.auto_create_table to false.
 */
const { quoteIdentifier } = require('../userdatabase');

module.exports = async function setupMobileTable(pool, config) {
  const mobile = config.mobile;
  const table = quoteIdentifier(mobile.table, 'mobile tokens table');
  const usersTable = quoteIdentifier(config.database.tables.users, 'users table');
  const usersId = quoteIdentifier(config.database.columns.id, 'users.id');

  const c = mobile.columns;
  const q = (name) => (c[name] ? quoteIdentifier(c[name], name) : null);

  const columns = [
    `${q('id')} uuid PRIMARY KEY DEFAULT gen_random_uuid()`,
    `${q('userId')} uuid NOT NULL REFERENCES ${usersTable}(${usersId}) ON DELETE CASCADE`,
    `${q('tokenHash')} text NOT NULL UNIQUE`,
    q('tokenHint') ? `${q('tokenHint')} varchar(24)` : null,
    q('label') ? `${q('label')} varchar(100)` : null,
    q('platform') ? `${q('platform')} varchar(20)` : null,
    q('deviceId') ? `${q('deviceId')} varchar(200)` : null,
    q('lastUsedAt') ? `${q('lastUsedAt')} timestamptz` : null,
    `${q('expiresAt')} timestamptz NOT NULL`,
    `${q('revokedAt')} timestamptz`,
    `${q('createdAt')} timestamptz NOT NULL DEFAULT now()`,
  ]
    .filter(Boolean)
    .join(',\n  ');

  await pool.query(`CREATE TABLE IF NOT EXISTS ${table} (\n  ${columns}\n)`);

  const safeTable = String(mobile.table).replace(/[^A-Za-z0-9_]/g, '');
  await pool.query(
    `CREATE INDEX IF NOT EXISTS "${safeTable}_user_active_idx"
       ON ${table} (${q('userId')})
       WHERE ${q('revokedAt')} IS NULL`,
  );
  if (q('deviceId')) {
    await pool.query(
      `CREATE INDEX IF NOT EXISTS "${safeTable}_device_idx"
         ON ${table} (${q('userId')}, ${q('deviceId')})
         WHERE ${q('revokedAt')} IS NULL`,
    );
  }

  console.log(`[auth/mobile] Token table "${mobile.table}" is ready.`);
};
