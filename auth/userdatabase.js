/**
 * Database abstraction used by the auth module.
 *
 * All table/column names come from _auth-config.yaml. Identifiers are
 * whitelisted and quoted, and all values use parameterised queries.
 */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function quoteIdentifier(value, label) {
  if (!IDENTIFIER.test(String(value || ''))) {
    throw new Error(`Invalid PostgreSQL identifier for ${label}: ${value}`);
  }
  return `"${value}"`;
}

function createUserDatabase(pool, config) {
  const table = quoteIdentifier(config.database.tables.users, 'users table');
  const columns = config.database.columns;

  const col = (logicalName) => {
    const physical = columns[logicalName];
    return physical ? quoteIdentifier(physical, logicalName) : null;
  };

  const idColumn = col('id');
  const emailColumn = col('email');
  const passwordColumn = col('password');

  function normalizeUser(row) {
    if (!row) return null;
    const user = { ...row };
    user.id = row[columns.id];
    user.user_type = row[columns.userType] || 'user';
    if (columns.displayName) user.display_name = row[columns.displayName];
    return user;
  }

  return {
    pool,
    normalizeUser,

    async findUserByEmail(email) {
      const sql = `SELECT * FROM ${table} WHERE ${emailColumn} = $1 LIMIT 1`;
      const { rows } = await pool.query(sql, [String(email).trim().toLowerCase()]);
      return normalizeUser(rows[0]);
    },

    async findUserById(id) {
      const sql = `SELECT * FROM ${table} WHERE ${idColumn} = $1 LIMIT 1`;
      const { rows } = await pool.query(sql, [id]);
      return normalizeUser(rows[0]);
    },

    async countUsers() {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS count FROM ${table}`,
      );
      return Number(rows[0]?.count || 0);
    },

    async createUser(input) {
      const email = String(input.email || '').trim().toLowerCase();
      const existing = await this.findUserByEmail(email);
      if (existing) {
        const error = new Error('An account with that email already exists.');
        error.status = 409;
        error.code = 'EMAIL_TAKEN';
        throw error;
      }

      if (!emailColumn || !passwordColumn) {
        throw new Error('Auth config must map email and password columns.');
      }

      const logicalFields = [
        ['email', emailColumn],
        ['password', passwordColumn],
        ['displayName', col('displayName')],
        ['firstName', col('firstName')],
        ['lastName', col('lastName')],
        ['userType', col('userType')],
      ];

      const values = {
        email,
        password: input.passwordHash || input.password,
        displayName: input.displayName,
        firstName: input.firstName,
        lastName: input.lastName,
        userType: input.userType || 'user',
      };

      const insertColumns = [];
      const insertValues = [];
      for (const [logical, physical] of logicalFields) {
        if (!physical) continue;
        if (values[logical] === undefined || values[logical] === null) continue;
        insertColumns.push(physical);
        insertValues.push(values[logical]);
      }

      const placeholders = insertValues.map((_, index) => `$${index + 1}`);
      const sql = `
        INSERT INTO ${table} (${insertColumns.join(', ')})
        VALUES (${placeholders.join(', ')})
        RETURNING *`;
      const { rows } = await pool.query(sql, insertValues);
      return normalizeUser(rows[0]);
    },

    async updateBasicInfo(userId, updates) {
      const fieldMap = {
        displayName: col('displayName'),
        firstName: col('firstName'),
        lastName: col('lastName'),
      };

      const setClauses = [];
      const params = [];
      for (const [logical, physical] of Object.entries(fieldMap)) {
        if (!physical || updates[logical] === undefined) continue;
        params.push(updates[logical]);
        setClauses.push(`${physical} = $${params.length}`);
      }

      if (setClauses.length === 0) return this.findUserById(userId);

      params.push(userId);
      const sql = `
        UPDATE ${table}
        SET ${setClauses.join(', ')}
        WHERE ${idColumn} = $${params.length}
        RETURNING *`;
      const { rows } = await pool.query(sql, params);
      return normalizeUser(rows[0]);
    },

    async updatePassword(userId, passwordHash) {
      if (!passwordColumn) {
        throw new Error('Auth config must map a password column.');
      }
      const sql = `
        UPDATE ${table}
        SET ${passwordColumn} = $1
        WHERE ${idColumn} = $2
        RETURNING *`;
      const { rows } = await pool.query(sql, [passwordHash, userId]);
      return normalizeUser(rows[0]);
    },

    async touchLastActive(userId) {
      const lastLoginColumn = col('lastLogin');
      if (!lastLoginColumn) return;
      await pool.query(
        `UPDATE ${table} SET ${lastLoginColumn} = NOW() WHERE ${idColumn} = $1`,
        [userId],
      );
    },

    async deleteUser(userId) {
      return pool.query(`DELETE FROM ${table} WHERE ${idColumn} = $1`, [userId]);
    },
  };
}

module.exports = { createUserDatabase, quoteIdentifier };
