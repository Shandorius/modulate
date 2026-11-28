const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const playlistService = require('../services/playlistService');

const router = express.Router();
const playlistId = z.string().uuid('Unknown playlist.');
const trackId = z.string().uuid('Unknown track.');

router.get('/', async (req, res, next) => {
  try {
    res.json({ data: await playlistService.list(req.user.id) });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/',
  validate({
    body: z.object({
      name: z.string().trim().min(1).max(180),
      description: z.string().trim().max(1000).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json({ data: await playlistService.create(req.user.id, req.validated.body) });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:id/available-tracks',
  validate({
    params: z.object({ id: playlistId }),
    query: z.object({
      q: z.string().max(200).optional(),
      sort: z.enum(['recent', 'oldest', 'title', 'artist', 'album']).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      offset: z.coerce.number().int().min(0).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      res.json({
        data: await playlistService.availableTracks(
          req.user.id,
          req.params.id,
          req.validated.query,
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:id',
  validate({ params: z.object({ id: playlistId }) }),
  async (req, res, next) => {
    try {
      res.json({ data: await playlistService.get(req.user.id, req.params.id) });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/:id',
  validate({
    params: z.object({ id: playlistId }),
    body: z
      .object({
        name: z.string().trim().min(1).max(180).optional(),
        description: z.string().trim().max(1000).nullable().optional(),
        visibility: z.enum(['private', 'public']).optional(),
      })
      .refine((body) => Object.keys(body).length > 0, {
        message: 'Nothing to update.',
      }),
  }),
  async (req, res, next) => {
    try {
      res.json({
        data: await playlistService.update(
          req.user.id,
          req.params.id,
          req.validated.body,
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/:id',
  validate({ params: z.object({ id: playlistId }) }),
  async (req, res, next) => {
    try {
      res.json({
        data: await playlistService.remove(req.user.id, req.params.id),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:id/shares',
  validate({ params: z.object({ id: playlistId }) }),
  async (req, res, next) => {
    try {
      res.json({
        data: await playlistService.listShares(req.user.id, req.params.id),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:id/shares',
  validate({
    params: z.object({ id: playlistId }),
    body: z.object({
      userId: z.string().uuid(),
      role: z.enum(['viewer', 'editor']).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      res.json({
        data: await playlistService.share(
          req.user.id,
          req.params.id,
          req.validated.body.userId,
          req.validated.body.role || 'viewer',
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/:id/shares/:userId',
  validate({
    params: z.object({ id: playlistId, userId: z.string().uuid() }),
    body: z.object({ role: z.enum(['viewer', 'editor']) }),
  }),
  async (req, res, next) => {
    try {
      res.json({
        data: await playlistService.updateShareRole(
          req.user.id,
          req.params.id,
          req.params.userId,
          req.validated.body.role,
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/:id/shares/:userId',
  validate({
    params: z.object({ id: playlistId, userId: z.string().uuid() }),
  }),
  async (req, res, next) => {
    try {
      res.json({
        data: await playlistService.unshare(
          req.user.id,
          req.params.id,
          req.params.userId,
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/:id/visibility',
  validate({
    params: z.object({ id: playlistId }),
    body: z.object({ visibility: z.enum(['private', 'public']) }),
  }),
  async (req, res, next) => {
    try {
      res.json({
        data: await playlistService.setVisibility(
          req.user.id,
          req.params.id,
          req.validated.body.visibility,
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:id/tracks',
  validate({
    params: z.object({ id: playlistId }),
    body: z.object({ trackId }),
  }),
  async (req, res, next) => {
    try {
      res.json({
        data: await playlistService.addTrack(
          req.user.id,
          req.params.id,
          req.validated.body.trackId,
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/:id/tracks/:trackId',
  validate({
    params: z.object({ id: playlistId, trackId }),
  }),
  async (req, res, next) => {
    try {
      res.json({
        data: await playlistService.removeTrack(
          req.user.id,
          req.params.id,
          req.params.trackId,
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/:id/order',
  validate({
    params: z.object({ id: playlistId }),
    body: z.object({
      trackIds: z.array(z.string().uuid()).max(2000),
      expectedRevision: z.coerce.number().int().min(0).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      res.json({
        data: await playlistService.reorder(
          req.user.id,
          req.params.id,
          req.validated.body.trackIds,
          req.validated.body.expectedRevision ?? null,
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
