/**
 * Modulate is free, open-source software. There are no paid tiers and no
 * artificial product limits. This module remains because `/api/v1/me` and the
 * existing client contract expose a capability object. Keeping it here avoids
 * scattering "is this allowed?" checks through the domain.
 */
const OPEN_SOURCE_ENTITLEMENTS = {
  tier: 'oss',
  status: 'open_source',
  allFeatures: true,
  maxTracks: null,
  maxPlaylists: null,
  maxConcurrentIngests: null,
  historyDays: 365,
  remindersPerDay: 2,
  customQuietHours: true,
  fullInsights: true,
  homeAssistant: true,
  beta: false,
};

async function getForUser() {
  return { ...OPEN_SOURCE_ENTITLEMENTS };
}

function hasFeature(entitlements, feature) {
  if (!entitlements) return false;
  if (feature in entitlements) return Boolean(entitlements[feature]);
  return Boolean(entitlements.allFeatures);
}

module.exports = {
  OPEN_SOURCE_ENTITLEMENTS,
  getForUser,
  hasFeature,
};
