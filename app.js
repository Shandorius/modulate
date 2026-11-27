require('./config/env');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const env = require('./config/env');
const { pool } = require('./db/pool');
const initAuth = require('./auth');
const apiRouter = require('./routes');
const mediaRouter = require('./routes/media');
const notFound = require('./middleware/notFound');
const { errorHandler } = require('./middleware/errorHandler');
const {
  authLimiter,
  registerLimiter,
  mobileLimiter,
} = require('./middleware/rateLimit');
const { registrationGuard } = require('./middleware/registration');
const instanceSettings = require('./services/instanceSettingsService');

function webDist() {
  if (process.env.WEB_DIST) return path.resolve(process.env.WEB_DIST);
  const built = path.join(__dirname, 'public');
  if (fs.existsSync(path.join(built, 'index.html'))) return built;
  return path.join(__dirname, 'web', 'dist', 'web', 'browser');
}

async function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // One origin serves the web UI and API. Native apps authenticate with
  // bearer tokens and do not use cookies, so permissive CORS is safe here and
  // removes any origin configuration from self-hosters.
  app.use(
    cors({
      origin: '*',
      credentials: false,
      allowedHeaders: ['Content-Type', 'Authorization'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 86_400,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({
        status: 'ok',
        service: `${env.APP_NAME} API`,
        time: new Date().toISOString(),
      });
    } catch {
      res.status(503).json({
        status: 'degraded',
        service: `${env.APP_NAME} API`,
        error: 'Database unavailable',
      });
    }
  });

  app.use(mediaRouter);

  app.get('/auth/registration-status', async (req, res, next) => {
    try {
      res.json({ data: await instanceSettings.registrationStatus() });
    } catch (error) {
      next(error);
    }
  });

  app.use('/auth/mobile/login', mobileLimiter);
  app.use('/auth/mobile/register', registerLimiter);
  app.use('/auth/register', registerLimiter);
  app.use('/auth/mobile/register', registrationGuard);
  app.use('/auth/register', registrationGuard);
  app.use('/auth', authLimiter);

  const auth = await initAuth(app, { pool });
  app.locals.auth = auth;

  app.use('/api/v1', apiRouter);

  const dist = webDist();
  const indexFile = path.join(dist, 'index.html');
  if (fs.existsSync(indexFile)) {
    app.use(
      express.static(dist, {
        index: false,
        maxAge: '1h',
        setHeaders(res, filePath) {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      }),
    );
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (
        req.path.startsWith('/api/') ||
        req.path.startsWith('/auth/') ||
        req.path === '/health' ||
        req.path.startsWith('/stream/') ||
        req.path.startsWith('/artwork/')
      ) {
        return next();
      }
      return res.sendFile(indexFile);
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

async function start() {
  const app = await createApp();
  const server = app.listen(env.PORT, () => {
    console.log(
      `[api] ${env.APP_NAME} running on http://localhost:${env.PORT}`,
    );
  });

  const { start: startWorker, stop: stopWorker } = require('./services/ingestWorker');
  await startWorker();

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[api] ${signal} received, shutting down...`);
    void stopWorker();
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

if (require.main === module) {
  start().catch((error) => {
    console.error('[api] Failed to start:', error);
    pool.end().finally(() => process.exit(1));
  });
}

module.exports = { createApp, start };
