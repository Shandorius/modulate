/**
 * Password hashing and Passport strategy setup.
 */
const LocalStrategy = require('passport-local').Strategy;
const argon2 = require('argon2');

async function genPassword(password) {
  return argon2.hash(password, { type: argon2.argon2id });
}

async function validPassword(password, hash) {
  if (!hash) return false;
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

function createPassportLogic(passportInstance, config, userDB) {
  const local = config.strategies?.local || {};
  const columns = config.database.columns;

  const usernameField = local.usernameField || 'email';
  const passwordField = local.passwordField || 'password';

  passportInstance.use(
    new LocalStrategy(
      { usernameField, passwordField },
      async (username, password, done) => {
        try {
          const user = await userDB.findUserByEmail(username);
          if (!user) {
            return done(null, false, { message: 'Incorrect credentials.' });
          }

          const valid = await validPassword(password, user[columns.password]);
          if (!valid) {
            return done(null, false, { message: 'Incorrect credentials.' });
          }

          return done(null, user);
        } catch (error) {
          return done(error);
        }
      },
    ),
  );

  passportInstance.serializeUser((user, done) => {
    done(null, user[columns.id] ?? user.id);
  });

  passportInstance.deserializeUser(async (userId, done) => {
    try {
      const user = await userDB.findUserById(userId);
      done(null, user || false);
    } catch (error) {
      done(error);
    }
  });

  return { genPassword, validPassword };
}

module.exports = { createPassportLogic, genPassword, validPassword };
