/**
 * Token hashing and generation.
 *
 * Tokens are high-entropy opaque strings, so a single SHA-256 pass is enough.
 * A slow password hash here would add latency to every authenticated request
 * without meaningfully improving resistance to guessing.
 */
const crypto = require('crypto');

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

function generateRawToken(config) {
  const bytes = config.mobile.token_bytes;
  return `${config.mobile.token_prefix}${crypto.randomBytes(bytes).toString('base64url')}`;
}

function createTokenService({ repository, config }) {
  function tokenHint(rawToken) {
    return rawToken.slice(0, config.mobile.token_prefix.length + 6);
  }

  async function issueForUser(userId, metadata = {}) {
    const rawToken = generateRawToken(config);
    const expiresAt = new Date(
      Date.now() + config.mobile.ttl_days * 24 * 60 * 60 * 1000,
    );

    const record = await repository.issueForUser(userId, {
      tokenHash: hashToken(rawToken),
      tokenHint: tokenHint(rawToken),
      label: metadata.label || null,
      platform: metadata.platform || null,
      deviceId: metadata.deviceId || null,
      expiresAt,
    });

    return {
      token: rawToken,
      expiresAt: record.expires_at,
      record,
    };
  }

  async function rotate(userId, tokenId, metadata = {}) {
    const issued = await issueForUser(userId, metadata);
    await repository.revokeById(userId, tokenId);
    return issued;
  }

  return {
    issueForUser,
    rotate,
    hashToken,
    listDevices: (userId) => repository.listForUser(userId),
    revokeById: (userId, tokenId) => repository.revokeById(userId, tokenId),
    revokeByHash: (userId, rawToken) =>
      repository.revokeByHash(userId, hashToken(rawToken)),
    revokeAllForUser: (userId, exceptTokenId = null) =>
      repository.revokeAllForUser(userId, exceptTokenId),
    cleanupExpired: (retentionDays) => repository.cleanup(retentionDays),
  };
}

module.exports = { hashToken, generateRawToken, createTokenService };
