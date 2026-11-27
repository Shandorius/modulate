/**
 * Minimal onboarding state.
 *
 * The app-specific first action belongs here. Keep this generic version until
 * the domain is known, then create the first core object in `complete()`.
 */
const { pool } = require('../db/pool');
const profileService = require('./profileService');

async function getState(userId, db = pool) {
  const profile = await profileService.getProfile(userId, db);
  return {
    profile: profileService.presentProfile(profile),
    completed: Boolean(profile.onboarding_completed_at),
  };
}

async function complete(userId, input = {}, db = pool) {
  const profile = await profileService.updateProfile(
    userId,
    {
      timezone: input.timezone,
      onboardingComplete: true,
      metadata: input.metadata,
    },
    db,
  );
  return { profile: profileService.presentProfile(profile) };
}

module.exports = { getState, complete };
