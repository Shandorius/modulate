/**
 * Authentication guards for the portable mobile module.
 *
 * requireAuth accepts a Passport session OR a bearer token, which makes it a
 * drop-in replacement for auth/middleware.js isAuth in apps that enabled
 * mobile tokens. requireBearer is for token-management endpoints where a
 * session has no token id to revoke.
 */
const { hashToken } = require('./tokens');

function createGuards({ repository, userDB, config }) {
  function unauthorized(res) {
    res.set('WWW-Authenticate', 'Bearer realm="api"');
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      },
    });
  }

  function readBearer(req) {
    const header = req.headers.authorization;
    if (!header || typeof header !== 'string') return null;
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    const token = match[1].trim();
    if (!token.startsWith(config.mobile.token_prefix)) return null;
    return token;
  }

  async function resolveBearer(req) {
    const rawToken = readBearer(req);
    if (!rawToken) return null;

    const found = await repository.findActiveByHash(hashToken(rawToken));
    if (!found) return null;

    const user = userDB.normalizeUser(found.user);
    // Internal join aliases should never leak into req.user or API responses.
    for (const key of Object.keys(user)) {
      if (key.startsWith('__token_')) delete user[key];
    }

    req.user = user;
    req.auth = {
      type: 'bearer',
      tokenId: found.token.id,
      platform: found.token.platform,
    };

    if (config.mobile.touch_interval_minutes > 0) {
      repository
        .touch(found.token.id, config.mobile.touch_interval_minutes)
        .catch((error) => {
          console.warn('[auth/mobile] Could not update token last_used_at:', error.message);
        });
    }

    return user;
  }

  async function requireAuth(req, res, next) {
    try {
      if (
        typeof req.isAuthenticated === 'function' &&
        req.isAuthenticated() &&
        req.user
      ) {
        req.auth = { type: 'session' };
        return next();
      }

      const user = await resolveBearer(req);
      if (user) return next();
      return unauthorized(res);
    } catch (error) {
      return next(error);
    }
  }

  async function requireBearer(req, res, next) {
    try {
      const user = await resolveBearer(req);
      if (user) return next();
      return unauthorized(res);
    } catch (error) {
      return next(error);
    }
  }

  async function optionalAuth(req, res, next) {
    try {
      if (
        typeof req.isAuthenticated === 'function' &&
        req.isAuthenticated() &&
        req.user
      ) {
        req.auth = { type: 'session' };
        return next();
      }
      await resolveBearer(req);
      return next();
    } catch (error) {
      return next(error);
    }
  }

  return { requireAuth, requireBearer, optionalAuth, resolveBearer };
}

module.exports = { createGuards };
