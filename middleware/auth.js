/**
 * Session-or-bearer guard.
 *
 * initAuth() stores the mobile module on app.locals.auth, so every feature
 * router can use one guard without knowing which auth method the client used.
 */
function unavailable(res) {
  return res.status(401).json({
    error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
  });
}

function requireAuth(req, res, next) {
  const mobile = req.app.locals.auth?.mobile;
  if (mobile?.requireAuth) return mobile.requireAuth(req, res, next);

  if (typeof req.isAuthenticated === 'function' && req.isAuthenticated() && req.user) {
    req.auth = { type: 'session' };
    return next();
  }
  return unavailable(res);
}

function userId(req) {
  return req.user?.id;
}

module.exports = { requireAuth, unavailable, userId };
