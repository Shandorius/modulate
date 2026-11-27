/**
 * Mobile bearer-auth routes.
 *
 * Mounted at config.mobile.mount_path (default /auth/mobile). The router is a
 * factory so the same module can be used in more than one Express app without
 * shared mutable state.
 */
const express = require('express');
const { z } = require('zod');
const { sanitizeUser, validateRegistration } = require('../routes');

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

const deviceSchema = z.object({
  label: z.string().trim().max(100).optional(),
  platform: z.enum(['ios', 'android', 'web', 'unknown']).optional(),
  deviceId: z.string().trim().max(200).optional(),
});

const uuidSchema = z.string().uuid();

function parse(schema, input) {
  const result = schema.safeParse(input || {});
  if (result.success) return { data: result.data };
  return {
    error: result.error.issues[0]?.message || 'Invalid request.',
  };
}

module.exports = function createMobileAuthRouter({
  config,
  userDB,
  passport,
  genPassword,
  tokens,
  requireBearer,
}) {
  const router = express.Router();

  function tokenResponse(issued, user) {
    return {
      token: issued.token,
      expiresAt: issued.expiresAt,
      user: sanitizeUser(user, config),
    };
  }

  router.post('/register', async (req, res, next) => {
    try {
      const input = validateRegistration(req.body || {});
      if (input.error) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: input.error },
        });
      }

      const device = parse(deviceSchema, {
        label: req.body?.label,
        platform: req.body?.platform,
        deviceId: req.body?.deviceId,
      });
      if (device.error) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: device.error },
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

      const issued = await tokens.issueForUser(user.id, device.data);
      return res.status(201).json({
        msg: 'User registered.',
        ...tokenResponse(issued, user),
      });
    } catch (error) {
      if (error.status === 409) {
        return res.status(409).json({
          error: { code: 'EMAIL_TAKEN', message: error.message },
        });
      }
      return next(error);
    }
  });

  router.post('/login', (req, res, next) => {
    const input = parse(loginSchema, req.body);
    if (input.error) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: input.error },
      });
    }

    passport.authenticate(
      'local',
      { session: false },
      async (error, user, info) => {
        if (error) return next(error);
        if (!user) {
          return res.status(401).json({
            error: {
              code: 'INVALID_CREDENTIALS',
              message: info?.message || 'Incorrect email or password.',
            },
          });
        }

        try {
          const device = parse(deviceSchema, {
            label: req.body?.label,
            platform: req.body?.platform,
            deviceId: req.body?.deviceId,
          });
          if (device.error) {
            return res.status(400).json({
              error: { code: 'VALIDATION_ERROR', message: device.error },
            });
          }

          const issued = await tokens.issueForUser(user.id, device.data);
          await userDB.touchLastActive(user.id).catch(() => {});
          return res.status(200).json({
            msg: 'Logged in.',
            ...tokenResponse(issued, user),
          });
        } catch (loginError) {
          return next(loginError);
        }
      },
    )(req, res, next);
  });

  router.post('/refresh', requireBearer, async (req, res, next) => {
    try {
      const device = parse(deviceSchema, {
        label: req.body?.label ?? req.user?.display_name ?? undefined,
        platform: req.body?.platform ?? req.auth?.platform ?? undefined,
        deviceId: req.body?.deviceId ?? undefined,
      });
      if (device.error) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: device.error },
        });
      }

      const issued = await tokens.rotate(req.user.id, req.auth.tokenId, device.data);
      return res.status(200).json({
        msg: 'Token rotated.',
        ...tokenResponse(issued, req.user),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/logout', requireBearer, async (req, res, next) => {
    try {
      if (String(req.query.all) === 'true') {
        await tokens.revokeAllForUser(req.user.id);
      } else {
        await tokens.revokeById(req.user.id, req.auth.tokenId);
      }
      return res.status(200).json({ success: true, message: 'Logged out.' });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/status', requireBearer, (req, res) => {
    res.status(200).json({
      authenticated: true,
      user: sanitizeUser(req.user, config),
      auth: { type: 'bearer', platform: req.auth.platform },
    });
  });

  router.get('/devices', requireBearer, async (req, res, next) => {
    try {
      const devices = (await tokens.listDevices(req.user.id)).map((device) => ({
        id: device.id,
        tokenHint: device.token_hint,
        label: device.label,
        platform: device.platform,
        deviceId: device.device_id,
        lastUsedAt: device.last_used_at,
        expiresAt: device.expires_at,
        createdAt: device.created_at,
      }));
      return res.status(200).json({ devices });
    } catch (error) {
      return next(error);
    }
  });

  router.delete('/devices/:id', requireBearer, async (req, res, next) => {
    try {
      const id = uuidSchema.safeParse(req.params.id);
      if (!id.success) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid device id.' },
        });
      }

      const revoked = await tokens.revokeById(req.user.id, id.data);
      if (!revoked) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Device token not found.' },
        });
      }
      return res.status(200).json({ success: true });
    } catch (error) {
      return next(error);
    }
  });

  return router;
};
