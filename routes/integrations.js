const express = require('express');
const { z } = require('zod');
const crypto = require('crypto');
const { validate } = require('../middleware/validate');
const playbackService = require('../services/playbackService');

const router = express.Router();

function baseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

const SUBSONIC_KEY_LIFETIME_MS = 10 * 365 * 24 * 60 * 60 * 1000;

function tokenService(req) {
  const auth = req.app.locals.auth;
  if (!auth?.mobile?.tokens) {
    const error = new Error('Bearer tokens are unavailable.');
    error.status = 503;
    throw error;
  }
  return auth.mobile.tokens;
}

router.get('/home-assistant', async (req, res, next) => {
  try {
    const tokens = tokenService(req);
    const devices = (await tokens.listDevices(req.user.id)).filter(
      (device) => device.platform === 'home_assistant',
    );
    const state = await playbackService.getState(req.user.id, baseUrl(req));
    res.json({
      data: {
        baseUrl: baseUrl(req),
        activePlayers: state.activePlayers,
        tokens: devices.map((device) => ({
          id: device.id,
          label: device.label,
          hint: device.tokenHint,
          lastUsedAt: device.lastUsedAt,
          expiresAt: device.expiresAt,
          createdAt: device.createdAt,
        })),
        endpoints: {
          state: `${baseUrl(req)}/api/v1/ha/state`,
          command: `${baseUrl(req)}/api/v1/ha/command`,
          webhook: `${baseUrl(req)}/api/v1/ha/webhook`,
          playlists: `${baseUrl(req)}/api/v1/ha/playlists`,
          announcements: `${baseUrl(req)}/api/v1/ha/announcements`,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/home-assistant/tokens',
  validate({
    body: z.object({
      label: z.string().trim().min(1).max(100).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const issued = await tokenService(req).issueForUser(req.user.id, {
        label: req.validated.body.label || 'Home Assistant',
        platform: 'home_assistant',
        deviceId: `ha-${crypto.randomUUID()}`,
      });
      res.status(201).json({
        data: {
          token: issued.token,
          expiresAt: issued.expiresAt,
          label: req.validated.body.label || 'Home Assistant',
          hint: issued.record?.token_hint,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

async function subsonicKeys(req) {
  const devices = await tokenService(req).listDevices(req.user.id);
  return devices
    .filter((device) => device.platform === 'subsonic')
    .map((device) => ({
      id: device.id,
      label: device.label,
      hint: device.tokenHint,
      lastUsedAt: device.lastUsedAt,
      expiresAt: device.expiresAt,
      createdAt: device.createdAt,
    }));
}

function subsonicInfo(req) {
  return {
    baseUrl: baseUrl(req),
    endpoint: `${baseUrl(req)}/rest`,
    owner: req.user.display_name || req.user.email,
  };
}

router.get('/subsonic', async (req, res, next) => {
  try {
    res.json({
      data: { ...subsonicInfo(req), keys: await subsonicKeys(req) },
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/subsonic/keys',
  validate({
    body: z.object({
      label: z.string().trim().min(1).max(100).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const label = req.validated.body.label || 'Music Assistant';
      const issued = await tokenService(req).issueForUser(req.user.id, {
        label,
        platform: 'subsonic',
        deviceId: `subsonic-${crypto.randomUUID()}`,
        expiresAt: new Date(Date.now() + SUBSONIC_KEY_LIFETIME_MS),
      });
      res.status(201).json({
        data: {
          token: issued.token,
          expiresAt: issued.expiresAt,
          label,
          hint: issued.record?.token_hint,
          ...subsonicInfo(req),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/subsonic/keys/:id',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res, next) => {
    try {
      const revoked = await tokenService(req).revokeById(
        req.user.id,
        req.params.id,
      );
      if (!revoked) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'API key not found.' },
        });
      }
      return res.json({ data: { id: req.params.id, revoked: true } });
    } catch (error) {
      return next(error);
    }
  },
);

router.delete(
  '/home-assistant/tokens/:id',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res, next) => {
    try {
      const revoked = await tokenService(req).revokeById(
        req.user.id,
        req.params.id,
      );
      if (!revoked) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Token not found.' },
        });
      }
      return res.json({ data: { id: req.params.id, revoked: true } });
    } catch (error) {
      return next(error);
    }
  },
);

module.exports = router;
