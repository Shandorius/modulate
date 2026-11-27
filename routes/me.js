const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const profileService = require('../services/profileService');
const entitlementService = require('../services/entitlementService');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const profile = await profileService.getProfile(req.user.id);
    const entitlements = await entitlementService.getForUser(req.user.id);
    res.json({
      data: {
        user: profileService.presentUser(req.user),
        profile: profileService.presentProfile(profile),
        tier: entitlements.tier,
        entitlements,
        auth: req.auth || { type: 'session' },
      },
    });
  } catch (error) {
    next(error);
  }
});

router.patch(
  '/',
  validate({
    body: z.object({
      timezone: z.string().min(1).max(80).optional(),
      onboardingComplete: z.boolean().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const profile = await profileService.updateProfile(
        req.user.id,
        req.validated.body,
      );
      res.json({ data: profileService.presentProfile(profile) });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
