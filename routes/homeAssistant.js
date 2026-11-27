const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const playbackService = require('../services/playbackService');
const playlistService = require('../services/playlistService');

const router = express.Router();

const commandSchema = z.object({
  action: z.enum([
    'play',
    'pause',
    'next',
    'previous',
    'seek',
    'volume',
    'play_track',
    'play_playlist',
    'enqueue',
    'remove_queue_item',
    'clear_queue',
    'set_repeat',
    'announce',
    'ack_announcement',
  ]),
  trackId: z.string().uuid().optional(),
  playlistId: z.string().uuid().optional(),
  queueId: z.string().uuid().optional(),
  positionSeconds: z.coerce.number().min(0).optional(),
  volume: z.coerce.number().min(0).max(1).optional(),
  repeatMode: z.enum(['off', 'all', 'one']).optional(),
  message: z.string().trim().min(1).max(1000).optional(),
  announcementId: z.string().uuid().optional(),
  ttlSeconds: z.coerce.number().int().min(10).max(3600).optional(),
});

function baseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

async function runCommand(req, res, next) {
  try {
    const body = req.validated.body;
    if (!['announce', 'ack_announcement'].includes(body.action)) {
      await playbackService.assertActivePlayer(req.user.id);
    }
    const state = await playbackService.action(
      req.user.id,
      body,
      baseUrl(req),
    );
    res.json({ data: state });
  } catch (error) {
    next(error);
  }
}

router.get('/state', async (req, res, next) => {
  try {
    const state = await playbackService.getState(
      req.user.id,
      baseUrl(req),
    );
    res.json({ data: state });
  } catch (error) {
    next(error);
  }
});

router.get('/playlists', async (req, res, next) => {
  try {
    const playlists = await playlistService.list(req.user.id);
    res.json({
      data: playlists.map((playlist) => ({
        ...playlist,
        playUrl: `${baseUrl(req)}/api/v1/ha/command`,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/command',
  validate({ body: commandSchema }),
  runCommand,
);

router.post(
  '/webhook',
  validate({ body: commandSchema }),
  runCommand,
);

router.post(
  '/announcements',
  validate({
    body: z.object({
      message: z.string().trim().min(1).max(1000),
      ttlSeconds: z.coerce.number().int().min(10).max(3600).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const state = await playbackService.action(
        req.user.id,
        {
          action: 'announce',
          message: req.validated.body.message,
          ttlSeconds: req.validated.body.ttlSeconds,
        },
        baseUrl(req),
      );
      res.status(201).json({ data: state });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
