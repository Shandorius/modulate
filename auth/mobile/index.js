/**
 * Portable mobile bearer-auth module.
 *
 * Usage with the shared auth package:
 *   const auth = await initAuth(app, { pool });
 *   app.get('/api/v1/me', auth.mobile.requireAuth, handler);
 *
 * Usage standalone:
 *   const mobile = await initMobileAuth(app, { pool, config, userDB, passport });
 */
const setupMobileTable = require('./setup_db');
const { createTokenRepository } = require('./repository');
const { createTokenService } = require('./tokens');
const { createGuards } = require('./middleware');
const createRouter = require('./routes');

async function createMobileAuth({ pool, config, userDB, passport, genPassword }) {
  if (config.mobile.auto_create_table) {
    await setupMobileTable(pool, config);
  }

  const repository = createTokenRepository(pool, config);
  const tokens = createTokenService({ repository, config });
  const guards = createGuards({ repository, userDB, config });
  const router = createRouter({
    config,
    userDB,
    passport,
    genPassword,
    tokens,
    requireBearer: guards.requireBearer,
  });

  return {
    mountPath: config.mobile.mount_path,
    router,
    repository,
    tokens,
    ...guards,
    revokeAllForUser: (userId, exceptTokenId = null) =>
      tokens.revokeAllForUser(userId, exceptTokenId),
    cleanupExpired: (retentionDays = config.mobile.cleanup_retention_days) =>
      tokens.cleanupExpired(retentionDays),
  };
}

async function initMobileAuth(app, deps) {
  const mobile = await createMobileAuth(deps);
  app.use(mobile.mountPath, mobile.router);
  console.log(`[auth/mobile] Portable bearer auth mounted at ${mobile.mountPath}.`);
  return mobile;
}

module.exports = initMobileAuth;
module.exports.createMobileAuth = createMobileAuth;
