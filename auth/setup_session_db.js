/**
 * Ensures the connect-pg-simple session table exists.
 * This is useful when the auth module is copied into a project without
 * migrations. The host application migrations can also create the table.
 */
module.exports = async (pool, tableName = 'user_sessions') => {
  const safeTable = String(tableName).replace(/[^A-Za-z0-9_]/g, '');
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "${safeTable}" (
        "sid"    VARCHAR NOT NULL COLLATE "default",
        "sess"   JSON NOT NULL,
        "expire" TIMESTAMPTZ NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "${safeTable}" ("expire")`,
    );
    console.log(`[auth] Session table "${safeTable}" is ready.`);
  } catch (error) {
    console.error('[auth] Could not prepare session table:', error.message);
  }
};
