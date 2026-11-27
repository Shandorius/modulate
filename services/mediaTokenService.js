const crypto = require('crypto');
const env = require('../config/env');

function signature(kind, userId, trackId, expiresAt) {
  return crypto
    .createHmac('sha256', env.STREAM_SECRET)
    .update(`${kind}:${userId}:${trackId}:${expiresAt}`)
    .digest('base64url');
}

function sign(kind, userId, trackId, ttlSeconds = env.STREAM_TTL_SECONDS) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = signature(kind, userId, trackId, exp);
  return { exp, sig };
}

function verify(kind, userId, trackId, exp, sig) {
  const expires = Number(exp);
  if (!Number.isInteger(expires) || expires < Math.floor(Date.now() / 1000)) {
    return false;
  }
  if (typeof sig !== 'string' || !sig) return false;
  const expected = signature(kind, userId, trackId, expires);
  const actualBuffer = Buffer.from(sig);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function signedPath(kind, userId, trackId, ttlSeconds) {
  const { exp, sig } = sign(kind, userId, trackId, ttlSeconds);
  const route = kind === 'artwork' ? 'artwork' : 'stream';
  return `/${route}/${trackId}?exp=${exp}&sig=${sig}`;
}

module.exports = { sign, verify, signedPath };
