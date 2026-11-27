const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const onboardingService = require('../services/onboardingService');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    res.json({ data: await onboardingService.getState(req.user.id) });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/complete',
  validate({
    body: z.object({
      timezone: z.string().min(1).max(80).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const result = await onboardingService.complete(
        req.user.id,
        req.validated.body,
      );
      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
