const rateLimit = require('express-rate-limit');
const env = require('../config/env');

function jsonLimiter({ windowMs, limit, code = 'RATE_LIMITED' }) {
  return rateLimit({
    windowMs,
    limit: env.isTest ? 10_000 : limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      error: {
        code,
        message: 'Too many requests. Please wait a moment and try again.',
      },
    },
  });
}

const authLimiter = jsonLimiter({ windowMs: 60_000, limit: 30 });
const registerLimiter = jsonLimiter({
  windowMs: 60 * 60_000,
  limit: 10,
  code: 'REGISTER_RATE_LIMITED',
});
const mobileLimiter = jsonLimiter({ windowMs: 60_000, limit: 30 });
const sensitiveLimiter = jsonLimiter({
  windowMs: 60_000,
  limit: 10,
  code: 'ACCOUNT_RATE_LIMITED',
});

module.exports = {
  authLimiter,
  registerLimiter,
  mobileLimiter,
  sensitiveLimiter,
};
