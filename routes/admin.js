const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { pool } = require('../db/pool');
const { badRequest, conflict, forbidden, notFound } = require('../services/errors');
const instanceSettings = require('../services/instanceSettingsService');

const router = express.Router();

function authContext(req) {
  const auth = req.app.locals.auth;
  if (!auth?.userDB || !auth.genPassword) {
    const error = new Error('Account services are unavailable.');
    error.status = 503;
    throw error;
  }
  return auth;
}

function requireAdmin(req, res, next) {
  if (req.user?.user_type === 'admin') return next();
  return next(forbidden('Administrator access is required.'));
}

function presentAdminUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    userType: row.user_type,
    lastActiveAt: row.last_active_at,
    createdAt: row.created_at,
  };
}

async function listUsers() {
  const { rows } = await pool.query(
    `SELECT id, email, display_name, user_type, last_active_at, created_at
     FROM users ORDER BY created_at ASC`,
  );
  return rows.map(presentAdminUser);
}

router.use(requireAdmin);

router.get('/users', async (req, res, next) => {
  try {
    res.json({ data: await listUsers() });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/users',
  validate({
    body: z.object({
      email: z.string().trim().toLowerCase().email(),
      password: z.string().min(8).max(200),
      displayName: z.string().trim().max(100).optional(),
      userType: z.enum(['user', 'admin']).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const auth = authContext(req);
      const passwordHash = await auth.genPassword(req.validated.body.password);
      const user = await auth.userDB.createUser({
        email: req.validated.body.email,
        passwordHash,
        displayName: req.validated.body.displayName || null,
        userType: req.validated.body.userType || 'user',
      });
      res.status(201).json({ data: presentAdminUser(user) });
    } catch (error) {
      if (error.code === '23505') {
        return next(conflict('An account with that email already exists.'));
      }
      return next(error);
    }
  },
);

router.patch(
  '/users/:id',
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z
      .object({
        displayName: z.string().trim().max(100).optional(),
        userType: z.enum(['user', 'admin']).optional(),
      })
      .refine((body) => Object.keys(body).length > 0, {
        message: 'Nothing to update.',
      }),
  }),
  async (req, res, next) => {
    try {
      const auth = authContext(req);
      const targetId = req.validated.params.id;
      const target = await auth.userDB.findUserById(targetId);
      if (!target) throw notFound('User not found.');

      if (req.validated.body.displayName !== undefined) {
        await auth.userDB.updateBasicInfo(targetId, {
          displayName: req.validated.body.displayName || null,
        });
      }

      if (req.validated.body.userType !== undefined) {
        if (String(req.user.id) === targetId) {
          throw conflict('You cannot change your own administrator role.');
        }
        if (
          target.user_type === 'admin' &&
          req.validated.body.userType !== 'admin'
        ) {
          const { rows } = await pool.query(
            `SELECT count(*)::int AS count FROM users
             WHERE user_type = 'admin' AND id <> $1`,
            [targetId],
          );
          if (!rows[0]?.count) {
            throw conflict('The instance must keep at least one administrator.');
          }
        }
        await pool.query('UPDATE users SET user_type = $1 WHERE id = $2', [
          req.validated.body.userType,
          targetId,
        ]);
      }

      const updated = await auth.userDB.findUserById(targetId);
      res.json({ data: presentAdminUser(updated) });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/users/:id',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res, next) => {
    try {
      const auth = authContext(req);
      const targetId = req.validated.params.id;
      if (String(req.user.id) === targetId) {
        throw badRequest('Use Account settings to delete your own account.');
      }
      const target = await auth.userDB.findUserById(targetId);
      if (!target) throw notFound('User not found.');
      if (target.user_type === 'admin') {
        const { rows } = await pool.query(
          `SELECT count(*)::int AS count FROM users
           WHERE user_type = 'admin' AND id <> $1`,
          [targetId],
        );
        if (!rows[0]?.count) {
          throw conflict('The instance must keep at least one administrator.');
        }
      }
      await pool.query(
        `DELETE FROM user_sessions WHERE sess->'passport'->>'user' = $1`,
        [targetId],
      );
      await auth.userDB.deleteUser(targetId);
      res.json({ data: { id: targetId, deleted: true } });
    } catch (error) {
      next(error);
    }
  },
);

router.get('/settings', async (req, res, next) => {
  try {
    res.json({ data: await instanceSettings.getSettings() });
  } catch (error) {
    next(error);
  }
});

router.put(
  '/settings',
  validate({
    body: z.object({
      allowRegistration: z.boolean(),
    }),
  }),
  async (req, res, next) => {
    try {
      res.json({
        data: await instanceSettings.updateSettings({
          allowRegistration: req.validated.body.allowRegistration,
        }),
      });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
