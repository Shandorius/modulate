/**
 * Portable Passport auth module entry point.
 *
 * Usage in another app:
 *   const initAuth = require('./auth');
 *   await initAuth(app);                    // creates its own pool from YAML
 *
 * Usage with a shared pool:
 *   await initAuth(app, { pool: sharedPool });
 *
 * The module mounts /auth, uses YAML-based table/column mappings, and returns
 * the user database helpers so the host app can reuse them if needed.
 */
const session = require('express-session');
const { Pool } = require('pg');
const pgSession = require('connect-pg-simple')(session);
const { Passport } = require('passport');

const { loadConfig, CONFIG_PATH } = require('./config');
const { createUserDatabase } = require('./userdatabase');
const { createPassportLogic } = require('./passport-logic');
const createAuthRouter = require('./routes');
const setupSessionTable = require('./setup_session_db');
const initMobileAuth = require('./mobile');

async function initAuth(app, options = {}) {
  const config = options.config || loadConfig(options.configPath || CONFIG_PATH);
  const pool = options.pool || new Pool(config.database.connection);
  const ownsPool = !options.pool;

  const userDB = createUserDatabase(pool, config);

  if (config.app.auto_create_session_table !== false) {
    await setupSessionTable(pool, 'user_sessions');
  }

  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  app.use(
    session({
      name: config.app.cookie_name,
      store: new pgSession({
        pool,
        tableName: 'user_sessions',
        createTableIfMissing: false,
      }),
      secret: config.app.session_secret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      proxy: true,
      cookie: {
        maxAge: config.app.session_expiration,
        secure: 'auto',
        sameSite: 'lax',
        httpOnly: true,
        path: '/',
      },
    }),
  );

  const passport = options.passport || new Passport();
  const { genPassword } = createPassportLogic(passport, config, userDB);
  app.use(passport.initialize());
  app.use(passport.session());

  // Mount before the session-based /auth router so /auth/mobile/* is handled
  // by the token module rather than falling through it.
  let mobile = null;
  if (config.mobile?.enabled) {
    mobile = await initMobileAuth(app, {
      pool,
      config,
      userDB,
      passport,
      genPassword,
    });
  }

  app.use(
    '/auth',
    createAuthRouter({ passport, config, userDB, genPassword }),
  );

  console.log('[auth] Portable auth module initialized.');

  return { config, pool, ownsPool, userDB, passport, genPassword, mobile };
}

module.exports = initAuth;
module.exports.loadConfig = loadConfig;
