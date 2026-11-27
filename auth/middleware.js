module.exports = {
  isAuth: (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      },
    });
  },

  requiredRole: (role) => (req, res, next) => {
    if (req.isAuthenticated() && req.user?.user_type === role) return next();
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: `${role} permissions required.`,
      },
    });
  },

  isAdmin: (req, res, next) => {
    if (req.isAuthenticated() && req.user?.user_type === 'admin') return next();
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Administrative privileges required.',
      },
    });
  },
};
