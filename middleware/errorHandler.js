/**
 * Error envelope + central error handling.
 */
const { ZodError } = require('zod');
const env = require('../config/env');

function notFound(req, res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `No route matches ${req.method} ${req.originalUrl}.`,
    },
  });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: error.issues[0]?.message || 'Invalid request.',
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
  }

  if (error.code === '23505') {
    return res.status(409).json({
      error: {
        code: 'CONFLICT',
        message: 'That record already exists.',
      },
    });
  }

  if (error.code === '23503') {
    return res.status(409).json({
      error: {
        code: 'REFERENCE_CONFLICT',
        message: 'That record is still referenced by other data.',
      },
    });
  }

  const status = Number(error.status) >= 400 ? Number(error.status) : 500;
  const code = error.code || (status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR');
  const message =
    status === 500 && env.isProduction
      ? 'Something went wrong.'
      : error.message || 'Something went wrong.';

  if (status >= 500) {
    console.error('[api] Unhandled error:', error);
  }

  return res.status(status).json({
    error: {
      code,
      message,
      ...(error.details ? { details: error.details } : {}),
    },
  });
}

module.exports = { notFound, errorHandler };
