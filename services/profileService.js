/**
 * Generic user profile service.
 *
 * Keep user authentication in auth/ and app-specific profile fields here.
 */
const { pool } = require('../db/pool');
const { badRequest, notFound } = require('./errors');

const TIMEZONE_PATTERN = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/;

function validateTimezone(timezone) {
  if (typeof timezone !== 'string' || !timezone.trim()) {
    throw badRequest('A timezone is required.');
  }
  const value = timezone.trim();
  if (!TIMEZONE_PATTERN.test(value)) throw badRequest('Unknown timezone.');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
  } catch {
    throw badRequest('Unknown timezone.');
  }
  return value;
}

async function ensureProfile(userId, db = pool) {
  await db.query(
    `INSERT INTO user_profiles (user_id)
     VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
  const { rows } = await db.query(
    'SELECT * FROM user_profiles WHERE user_id = $1',
    [userId],
  );
  return rows[0];
}

async function getProfile(userId, db = pool) {
  return ensureProfile(userId, db);
}

async function updateProfile(userId, input, db = pool) {
  await ensureProfile(userId, db);
  const sets = [];
  const values = [];
  const push = (column, value) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };

  if (input.timezone !== undefined) {
    push('timezone', validateTimezone(input.timezone));
  }
  if (input.onboardingComplete !== undefined) {
    push(
      'onboarding_completed_at',
      input.onboardingComplete ? new Date() : null,
    );
  }
  if (input.metadata !== undefined) {
    if (
      typeof input.metadata !== 'object' ||
      input.metadata === null ||
      Array.isArray(input.metadata)
    ) {
      throw badRequest('metadata must be an object.');
    }
    push('metadata', JSON.stringify(input.metadata));
  }

  if (sets.length === 0) return getProfile(userId, db);
  values.push(userId);
  const { rows } = await db.query(
    `UPDATE user_profiles
     SET ${sets.join(', ')}
     WHERE user_id = $${values.length}
     RETURNING *`,
    values,
  );
  return rows[0];
}

function presentProfile(profile) {
  if (!profile) throw notFound('Profile not found.');
  return {
    timezone: profile.timezone,
    onboardingCompleted: Boolean(profile.onboarding_completed_at),
    onboardingCompletedAt: profile.onboarding_completed_at,
    metadata: profile.metadata || {},
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };
}

function presentUser(user) {
  if (!user) return null;
  const {
    password_hash: _passwordHash,
    password: _password,
    __token_id: _tokenId,
    ...safe
  } = user;
  return {
    id: safe.id,
    email: safe.email,
    displayName: safe.display_name ?? safe.displayName ?? null,
    userType: safe.user_type ?? safe.userType ?? 'user',
    lastActiveAt: safe.last_active_at ?? null,
    createdAt: safe.created_at ?? null,
  };
}

module.exports = {
  ensureProfile,
  getProfile,
  updateProfile,
  presentProfile,
  presentUser,
  validateTimezone,
};
