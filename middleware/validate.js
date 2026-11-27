/**
 * Validation helper for Express 5. Parsed values are written to req.validated
 * so handlers never trust raw input.
 */
const { z } = require('zod');

function validate(shape = {}) {
  const schema = z.object({
    body: shape.body || z.any(),
    query: shape.query || z.any(),
    params: shape.params || z.any(),
  });

  return (req, res, next) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: result.error.issues[0]?.message || 'Invalid request.',
          details: result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
    }

    req.validated = result.data;
    return next();
  };
}

module.exports = { validate };
