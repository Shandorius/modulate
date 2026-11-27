const instanceSettings = require('../services/instanceSettingsService');

async function registrationGuard(req, res, next) {
  try {
    const status = await instanceSettings.registrationStatus();
    if (status.allowed) return next();
    return res.status(403).json({
      error: {
        code: 'REGISTRATION_CLOSED',
        message:
          'Registration is closed on this instance. Ask the administrator to create an account.',
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { registrationGuard };
