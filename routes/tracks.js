const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const trackService = require('../services/trackService');

const router = express.Router();

const nullableText = (max) =>
  z.union([z.string().max(max), z.null()]).optional();

router.get(
  '/',
  validate({
    query: z.object({
      q: z.string().max(200).optional(),
      favorite: z.enum(['true', 'false']).optional(),
      sort: z.enum(['recent', 'title', 'artist', 'album']).optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
      offset: z.coerce.number().int().min(0).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { favorite, ...query } = req.validated.query;
      res.json({
        data: await trackService.list(req.user.id, {
          ...query,
          favorite:
            favorite === undefined ? undefined : favorite === 'true',
        }),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get('/summary', async (req, res, next) => {
  try {
    res.json({ data: await trackService.summary(req.user.id) });
  } catch (error) {
    next(error);
  }
});

router.get('/albums', async (req, res, next) => {
  try {
    res.json({ data: await trackService.albums(req.user.id) });
  } catch (error) {
    next(error);
  }
});

router.get(
  '/album',
  validate({ query: z.object({ name: z.string().min(1).max(500) }) }),
  async (req, res, next) => {
    try {
      const tracks = await trackService.byAlbum(
        req.user.id,
        req.validated.query.name,
      );
      res.json({ data: { album: req.validated.query.name, tracks } });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:id',
  validate({ params: z.object({ id: z.string().uuid('Unknown track.') }) }),
  async (req, res, next) => {
    try {
      res.json({ data: await trackService.get(req.user.id, req.params.id) });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/:id',
  validate({
    params: z.object({ id: z.string().uuid('Unknown track.') }),
    body: z
      .object({
        title: z.string().trim().min(1).max(500).optional(),
        artist: z.string().trim().min(1).max(500).optional(),
        album: nullableText(500),
        albumArtist: nullableText(500),
        trackNumber: z.number().int().positive().nullable().optional(),
        releaseYear: z.number().int().min(1000).max(3000).nullable().optional(),
        genre: nullableText(200),
        isFavorite: z.boolean().optional(),
      })
      .refine((body) => Object.keys(body).length > 0, {
        message: 'Nothing to update.',
      }),
  }),
  async (req, res, next) => {
    try {
      res.json({
        data: await trackService.update(
          req.user.id,
          req.params.id,
          req.validated.body,
          req.user.user_type === 'admin',
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/:id',
  validate({ params: z.object({ id: z.string().uuid('Unknown track.') }) }),
  async (req, res, next) => {
    try {
      res.json({
        data: await trackService.remove(
          req.user.id,
          req.params.id,
          req.user.user_type === 'admin',
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
