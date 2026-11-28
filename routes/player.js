const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const playbackService = require('../services/playbackService');

const router = express.Router();

const actionSchema = z.object({
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
    'report',
    'announce',
    'ack_announcement',
    'set_repeat',
    'set_shuffle',
    'presence_clear',
  ]),
  trackId: z.string().uuid().optional(),
  trackIds: z.array(z.string().uuid()).max(2000).optional(),
  playlistId: z.string().uuid().optional(),
  queueId: z.string().uuid().optional(),
  positionSeconds: z.coerce.number().min(0).optional(),
  isPlaying: z.boolean().optional(),
  volume: z.coerce.number().min(0).max(1).optional(),
  repeatMode: z.enum(['off', 'all', 'one']).optional(),
  shuffle: z.boolean().optional(),
  auto: z.boolean().optional(),
  message: z.string().trim().min(1).max(1000).optional(),
  announcementId: z.string().uuid().optional(),
  ttlSeconds: z.coerce.number().int().min(10).max(3600).optional(),
  clientId: z.string().max(200).optional(),
});

router.get('/state', async (req, res, next) => {
  try {
    res.json({ data: await playbackService.getState(req.user.id) });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/presence',
  validate({
    body: z.object({
      clientId: z.string().min(1).max(200),
      platform: z.string().max(40).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      res.json({
        data: await playbackService.presence(
          req.user.id,
          req.validated.body.clientId,
          req.validated.body.platform,
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/presence/:clientId',
  validate({ params: z.object({ clientId: z.string().min(1).max(200) }) }),
  async (req, res, next) => {
    try {
      res.json({
        data: await playbackService.clearPresence(
          req.user.id,
          req.params.clientId,
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/action',
  validate({ body: actionSchema }),
  async (req, res, next) => {
    try {
      res.json({
        data: await playbackService.action(req.user.id, req.validated.body),
      });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
