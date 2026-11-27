const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const ingestService = require('../services/ingestService');

const router = express.Router();
const id = z.string().uuid('Unknown import.');

router.post(
  '/',
  validate({
    body: z.object({
      url: z.string().url().max(2000),
      kind: z.enum(['auto', 'track', 'playlist']).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json({ data: await ingestService.create(req.user.id, req.validated.body) });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/jobs',
  validate({
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      res.json({
        data: await ingestService.list(req.user.id, req.validated.query),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/jobs/:id',
  validate({ params: z.object({ id }) }),
  async (req, res, next) => {
    try {
      res.json({ data: await ingestService.get(req.user.id, req.params.id) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/jobs/:id/retry',
  validate({ params: z.object({ id }) }),
  async (req, res, next) => {
    try {
      res.json({
        data: await ingestService.retry(req.user.id, req.params.id),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/jobs/:id',
  validate({ params: z.object({ id }) }),
  async (req, res, next) => {
    try {
      res.json({
        data: await ingestService.cancel(req.user.id, req.params.id),
      });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
