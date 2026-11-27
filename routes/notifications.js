const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const notificationService = require('../services/notificationService');

const router = express.Router();

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM.');

const preferenceSchema = z.object({
  pushEnabled: z.boolean().optional(),
  morningPlan: z.boolean().optional(),
  morningTime: time.optional(),
  quietStart: time.optional(),
  quietEnd: time.optional(),
  dayEnd: time.optional(),
  maxPerDay: z.coerce.number().int().min(1).max(2).optional(),
  hideDetails: z.boolean().optional(),
});

router.get('/preferences', async (req, res, next) => {
  try {
    res.json({
      data: await notificationService.getPreferences(req.user.id),
    });
  } catch (error) {
    next(error);
  }
});

router.put(
  '/preferences',
  validate({ body: preferenceSchema }),
  async (req, res, next) => {
    try {
      res.json({
        data: await notificationService.updatePreferences(
          req.user.id,
          req.validated.body,
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/local-plan',
  validate({
    query: z.object({
      days: z.coerce.number().int().min(1).max(7).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      res.json({
        data: await notificationService.buildLocalPlan(
          req.user.id,
          req.validated.query,
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/history',
  validate({
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      res.json({
        data: await notificationService.history(
          req.user.id,
          req.validated.query,
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post('/test', async (req, res, next) => {
  try {
    res.status(201).json({
      data: await notificationService.sendTest(req.user.id),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
