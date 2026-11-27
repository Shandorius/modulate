/**
 * Tiny forward-only SQL migration runner.
 */
const fs = require('fs/promises');
const path = require('path');
const { pool } = require('./pool');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function migrate() {
  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [947104]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.filename));

    for (const filename of files) {
      if (applied.has(filename)) continue;
      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, filename), 'utf8');
      console.log(`[migrate] applying ${filename}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [filename],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${filename} failed: ${error.message}`, {
          cause: error,
        });
      }
    }
    console.log(`[migrate] ${files.length} migration(s) checked.`);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [947104]).catch(() => {});
    client.release();
  }
}

if (require.main === module) {
  migrate()
    .then(() => pool.end())
    .catch(async (error) => {
      console.error('[migrate]', error);
      await pool.end().catch(() => {});
      process.exit(1);
    });
}

module.exports = { migrate };
