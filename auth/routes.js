/**
 * Auth HTTP routes.
 *
 * The router is created inside a factory so the module can be mounted in more
 * than one application without sharing mutable router state.
 */
const express = require('express');
const { isAuth } = require('./middleware');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeUser(user, config) {
  if (!user) return user;
  const copy = { ...user };
  delete copy.password;
  delete copy.password_hash;
  const passwordColumn = config.database.columns.password;
  if (passwordColumn) delete copy[passwordColumn];
  return copy;
}

function validateRegistration(body) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const displayName = body.displayName
    ? String(body.displayName).trim().slice(0, 100)
    : null;

  if (!EMAIL_PATTERN.test(email)) return { error: 'A valid email is required.' };
  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.' };
  }
  if (password.length > 200) return { error: 'Password is too long.' };

  return { email, password, displayName };
}

module.exports = function createAuthRouter({ passport, config, userDB, genPassword }) {
  const router = express.Router();
  const cookieName = config.app.cookie_name || 'connect.sid';

  function finishLogout(req, res, next, payload) {
    req.logout((logoutError) => {
      if (logoutError) return next(logoutError);
      req.session.destroy((sessionError) => {
        if (sessionError) return next(sessionError);
        res.clearCookie(cookieName, { path: '/' });
        return res.status(200).json(payload);
      });
    });
  }

  router.post('/register', async (req, res, next) => {
    try {
      const input = validateRegistration(req.body || {});
      if (input.error) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: input.error },
        });
      }

      const passwordHash = await genPassword(input.password);
      const firstUser = (await userDB.countUsers()) === 0;
      const user = await userDB.createUser({
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        userType: firstUser ? 'admin' : 'user',
      });

      req.login(user, (error) => {
        if (error) return next(error);
        return res.status(201).json({
          msg: 'User registered and logged in.',
          user: sanitizeUser(user, config),
        });
      });
    } catch (error) {
      if (error.status === 409) {
        return res.status(409).json({
          error: { code: 'EMAIL_TAKEN', message: error.message },
        });
      }
      next(error);
    }
  });

  router.post('/login', (req, res, next) => {
    passport.authenticate('local', (error, user, info) => {
      if (error) return next(error);
      if (!user) {
        return res.status(401).json({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: info?.message || 'Incorrect email or password.',
          },
        });
      }

      req.login(user, async (loginError) => {
        if (loginError) return next(loginError);
        await userDB.touchLastActive(user.id).catch(() => {});
        return res.status(200).json({
          msg: 'Logged in.',
          user: sanitizeUser(user, config),
        });
      });
    })(req, res, next);
  });

  router.get('/status', (req, res) => {
    if (!req.isAuthenticated()) {
      return res
        .status(401)
        .json({ authenticated: false, error: { code: 'UNAUTHORIZED' } });
    }
    return res.status(200).json({
      authenticated: true,
      user: sanitizeUser(req.user, config),
    });
  });

  router.get('/logout', (req, res, next) => {
    finishLogout(req, res, next, { success: true, message: 'Logged out.' });
  });

  router.post('/logout', (req, res, next) => {
    finishLogout(req, res, next, { success: true, message: 'Logged out.' });
  });

  router.put('/update-user', isAuth, async (req, res, next) => {
    try {
      const targetId = req.body?.id || req.user.id;
      const isSelf = String(req.user.id) === String(targetId);
      const isAdmin = req.user.user_type === 'admin';
      if (!isSelf && !isAdmin) {
        return res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'Not authorized.' },
        });
      }

      const updated = await userDB.updateBasicInfo(targetId, {
        displayName: req.body.displayName,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
      });
      return res.status(200).json({
        msg: 'Profile updated.',
        user: sanitizeUser(updated, config),
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/delete', isAuth, async (req, res, next) => {
    try {
      const targetId = req.body?.id || req.user.id;
      const isSelf = String(req.user.id) === String(targetId);
      const isAdmin = req.user.user_type === 'admin';
      if (!isSelf && !isAdmin) {
        return res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'Not authorized.' },
        });
      }

      await userDB.deleteUser(targetId);
      if (isSelf) {
        return finishLogout(req, res, next, {
          msg: 'User and session deleted.',
        });
      }
      return res.status(200).json({ msg: 'Target user deleted.' });
    } catch (error) {
      next(error);
    }
  });

  return router;
};

module.exports.sanitizeUser = sanitizeUser;
module.exports.validateRegistration = validateRegistration;
