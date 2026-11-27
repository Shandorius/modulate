/**
 * Account management for both session and mobile bearer users.
 *
 * The portable auth router's /auth/update-user and /auth/delete routes are
 * session-only, so mobile users need these API-scoped equivalents.
 */
const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { sensitiveLimiter } = require('../middleware/rateLimit');
const { validPassword } = require('../auth/passport-logic');
const { pool } = require('../db/pool');
const { presentUser } = require('../services/profileService');
const { badRequest, httpError } = require('../services/errors');

const router = express.Router();

function authContext(req) {
  const auth = req.app.locals.auth;
  if (!auth?.userDB || !auth?.genPassword) {
    throw httpError(503, 'AUTH_UNAVAILABLE', 'Account services are unavailable.');
  }
  return auth;
}

async function verifyCurrentPassword(req, password) {
  const auth = authContext(req);
  const user = await auth.userDB.findUserById(req.user.id);
  if (!user) throw httpError(404, 'NOT_FOUND', 'Account not found.');
  const passwordColumn = auth.config.database.columns.password;
  const valid = await validPassword(password, user[passwordColumn]);
  if (!valid) {
    throw httpError(401, 'INVALID_PASSWORD', 'Current password is incorrect.');
  }
  return user;
}

async function revokeOtherSessions(req) {
  const keepSid = req.auth?.type === 'session' ? req.sessionID : null;
  await pool.query(
    `DELETE FROM user_sessions
     WHERE sess->'passport'->>'user' = $1
       AND ($2::text IS NULL OR sid <> $2)`,
    [req.user.id, keepSid],
  );
}

router.patch(
  '/',
  validate({
    body: z.object({
      displayName: z.string().trim().max(100),
    }),
  }),
  async (req, res, next) => {
    try {
      const auth = authContext(req);
      const updated = await auth.userDB.updateBasicInfo(req.user.id, {
        displayName: req.validated.body.displayName || null,
      });
      res.json({ data: { user: presentUser(updated) } });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/change-password',
  sensitiveLimiter,
  validate({
    body: z.object({
      currentPassword: z.string().min(1).max(200),
      newPassword: z.string().min(8).max(200),
    }),
  }),
  async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.validated.body;
      if (currentPassword === newPassword) {
        throw badRequest('Choose a password you have not used here before.');
      }

      await verifyCurrentPassword(req, currentPassword);
      const auth = authContext(req);
      const hash = await auth.genPassword(newPassword);
      await auth.userDB.updatePassword(req.user.id, hash);

      const currentTokenId =
        req.auth?.type === 'bearer' ? req.auth.tokenId : null;
      if (auth.mobile?.revokeAllForUser) {
        await auth.mobile.revokeAllForUser(req.user.id, currentTokenId);
      }
      await revokeOtherSessions(req);

      res.json({ success: true, message: 'Password changed.' });
    } catch (error) {
      next(error);
    }
  },
);

router.post('/sign-out-all', async (req, res, next) => {
  try {
    const auth = authContext(req);
    if (auth.mobile?.revokeAllForUser) {
      await auth.mobile.revokeAllForUser(req.user.id);
    }
    await pool.query(
      `DELETE FROM user_sessions
       WHERE sess->'passport'->>'user' = $1`,
      [req.user.id],
    );
    res.json({ success: true, message: 'Signed out everywhere.' });
  } catch (error) {
    next(error);
  }
});

router.delete(
  '/',
  sensitiveLimiter,
  validate({
    body: z.object({
      password: z.string().min(1).max(200),
    }),
  }),
  async (req, res, next) => {
    try {
      await verifyCurrentPassword(req, req.validated.body.password);
      const auth = authContext(req);
      const userId = req.user.id;
      await pool.query(
        `DELETE FROM user_sessions WHERE sess->'passport'->>'user' = $1`,
        [userId],
      );
      await auth.userDB.deleteUser(userId);

      if (req.auth?.type === 'session' && req.session) {
        await new Promise((resolve) => req.session.destroy(() => resolve()));
      }
      res.json({ success: true, message: 'Account deleted.' });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
