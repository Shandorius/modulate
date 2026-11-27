/**
 * Config-driven api_tokens repository.
 *
 * Every identifier comes from _auth-config.yaml and is whitelisted/quoted.
 * Values are always parameterised.
 */
const { quoteIdentifier } = require('../userdatabase');

function createTokenRepository(pool, config) {
  const mobile = config.mobile;
  const table = quoteIdentifier(mobile.table, 'mobile tokens table');
  const usersTable = quoteIdentifier(config.database.tables.users, 'users table');
  const usersId = quoteIdentifier(config.database.columns.id, 'users.id');

  const col = (name) => {
    const physical = mobile.columns[name];
    return physical ? quoteIdentifier(physical, name) : null;
  };

  const userId = col('userId');
  const tokenHash = col('tokenHash');
  const tokenHint = col('tokenHint');
  const label = col('label');
  const platform = col('platform');
  const deviceId = col('deviceId');
  const lastUsedAt = col('lastUsedAt');
  const expiresAt = col('expiresAt');
  const revokedAt = col('revokedAt');
  const createdAt = col('createdAt');
  const id = col('id');

  const required = { id, userId, tokenHash, expiresAt, revokedAt, createdAt };
  for (const [name, value] of Object.entries(required)) {
    if (!value) throw new Error(`Mobile auth requires a column mapping for ${name}.`);
  }

  function activeCondition(alias = 't') {
    return `${alias}.${expiresAt} > now() AND ${alias}.${revokedAt} IS NULL`;
  }

  async function findActiveByHash(hash, db = pool) {
    const tokenAliases = [
      `t.${id} AS __token_id`,
      platform ? `t.${platform} AS __token_platform` : null,
      deviceId ? `t.${deviceId} AS __token_device_id` : null,
    ]
      .filter(Boolean)
      .join(', ');

    const sql = `
      SELECT u.*, ${tokenAliases}
      FROM ${table} t
      JOIN ${usersTable} u ON u.${usersId} = t.${userId}
      WHERE t.${tokenHash} = $1
        AND ${activeCondition('t')}
      LIMIT 1`;
    const { rows } = await db.query(sql, [hash]);
    if (!rows[0]) return null;

    const row = rows[0];
    return {
      user: row,
      token: {
        id: row.__token_id,
        platform: row.__token_platform || null,
        deviceId: row.__token_device_id || null,
      },
    };
  }

  async function insertToken(db, userIdValue, input) {
    const fields = [
      [userId, userIdValue],
      [tokenHash, input.tokenHash],
      [tokenHint, input.tokenHint],
      [label, input.label],
      [platform, input.platform],
      [deviceId, input.deviceId],
      [expiresAt, input.expiresAt],
    ].filter(([column, value]) => column && value !== undefined && value !== null);

    const columns = fields.map(([column]) => column).join(', ');
    const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ');
    const values = fields.map(([, value]) => value);

    const returning = [id, expiresAt, createdAt].filter(Boolean).join(', ');
    const sql = `
      INSERT INTO ${table} (${columns})
      VALUES (${placeholders})
      RETURNING ${returning}`;
    const { rows } = await db.query(sql, values);
    return rows[0];
  }

  async function issueForUser(userIdValue, input) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (deviceId && input.deviceId) {
        await client.query(
          `UPDATE ${table}
           SET ${revokedAt} = now()
           WHERE ${userId} = $1 AND ${deviceId} = $2
             AND ${revokedAt} IS NULL`,
          [userIdValue, input.deviceId],
        );
      }

      const record = await insertToken(client, userIdValue, input);

      const max = config.mobile.max_tokens_per_user;
      if (max > 0) {
        const order = lastUsedAt
          ? `COALESCE(${lastUsedAt}, ${createdAt}) ASC`
          : `${createdAt} ASC`;
        const { rows } = await client.query(
          `SELECT ${id} FROM ${table}
           WHERE ${userId} = $1 AND ${revokedAt} IS NULL
           ORDER BY ${order}`,
          [userIdValue],
        );
        if (rows.length > max) {
          const excess = rows.slice(0, rows.length - max).map((row) => row[id]);
          await client.query(
            `UPDATE ${table} SET ${revokedAt} = now() WHERE ${id} = ANY($1::uuid[])`,
            [excess],
          );
        }
      }

      await client.query('COMMIT');
      return record;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async function revokeById(userIdValue, tokenId, db = pool) {
    const sql = `
      UPDATE ${table}
      SET ${revokedAt} = now()
      WHERE ${id} = $1 AND ${userId} = $2 AND ${revokedAt} IS NULL
      RETURNING ${id}`;
    const { rows } = await db.query(sql, [tokenId, userIdValue]);
    return rows[0] || null;
  }

  async function revokeByHash(userIdValue, hash, db = pool) {
    const sql = `
      UPDATE ${table}
      SET ${revokedAt} = now()
      WHERE ${userId} = $1 AND ${tokenHash} = $2 AND ${revokedAt} IS NULL
      RETURNING ${id}`;
    const { rows } = await db.query(sql, [userIdValue, hash]);
    return rows[0] || null;
  }

  async function revokeAllForUser(userIdValue, exceptTokenId = null, db = pool) {
    const sql = `
      UPDATE ${table}
      SET ${revokedAt} = now()
      WHERE ${userId} = $1 AND ${revokedAt} IS NULL
        AND ($2::uuid IS NULL OR ${id} <> $2)`;
    const result = await db.query(sql, [userIdValue, exceptTokenId || null]);
    return result.rowCount;
  }

  async function listForUser(userIdValue, db = pool) {
    const selected = [
      `${id} AS id`,
      tokenHint ? `${tokenHint} AS token_hint` : null,
      label ? `${label} AS label` : null,
      platform ? `${platform} AS platform` : null,
      deviceId ? `${deviceId} AS device_id` : null,
      lastUsedAt ? `${lastUsedAt} AS last_used_at` : null,
      `${expiresAt} AS expires_at`,
      `${createdAt} AS created_at`,
    ]
      .filter(Boolean)
      .join(', ');

    const sql = `
      SELECT ${selected}
      FROM ${table} t
      WHERE t.${userId} = $1 AND ${activeCondition('t')}
      ORDER BY t.${createdAt} DESC`;
    const { rows } = await db.query(sql, [userIdValue]);
    return rows;
  }

  async function touch(tokenId, intervalMinutes, db = pool) {
    if (!lastUsedAt) return;
    const sql = `
      UPDATE ${table}
      SET ${lastUsedAt} = now()
      WHERE ${id} = $1
        AND (${lastUsedAt} IS NULL OR ${lastUsedAt} < now() - make_interval(mins => $2))`;
    await db.query(sql, [tokenId, intervalMinutes]);
  }

  async function cleanup(retentionDays, db = pool) {
    const { rowCount } = await db.query(
      `DELETE FROM ${table}
       WHERE (${revokedAt} IS NOT NULL OR ${expiresAt} < now())
         AND ${createdAt} < now() - make_interval(days => $1)`,
      [retentionDays],
    );
    return rowCount;
  }

  return {
    findActiveByHash,
    issueForUser,
    revokeById,
    revokeByHash,
    revokeAllForUser,
    listForUser,
    touch,
    cleanup,
  };
}

module.exports = { createTokenRepository };
