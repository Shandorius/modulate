/**
 * Loads auth/_auth-config.yaml and resolves ${ENV_VAR} placeholders.
 * Other files in the module import this single source of truth instead of
 * re-reading and re-parsing the YAML themselves.
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const CONFIG_PATH = path.join(__dirname, '_auth-config.yaml');

function interpolateEnv(source) {
  // Supports ${VAR} and ${VAR:-default}.
  return source.replace(/\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/gi, (_, key, fallback) => {
    const value = process.env[key];
    if (value !== undefined && value !== '') return value;
    return fallback ?? '';
  });
}

function loadConfig(configPath = CONFIG_PATH) {
  const source = fs.readFileSync(configPath, 'utf8');
  const config = yaml.load(interpolateEnv(source)) || {};

  config.app = config.app || {};
  config.app.session_expiration =
    Number(config.app.session_expiration) || 24 * 60 * 60 * 1000;
  config.app.session_secret =
    config.app.session_secret || 'dev-only-change-this-session-secret';
  config.app.cookie_name = config.app.cookie_name || 'connect.sid';
  config.app.auto_create_session_table =
    config.app.auto_create_session_table !== false;

  config.database = config.database || {};
  config.database.connection = config.database.connection || {};
  config.database.connection.port =
    Number(config.database.connection.port) || 5432;
  config.database.tables = config.database.tables || { users: 'users' };
  config.database.columns = config.database.columns || {
    id: 'id',
    email: 'email',
    password: 'password_hash',
    userType: 'user_type',
  };

  if (config.strategies?.google) {
    config.strategies.google.enabled =
      String(config.strategies.google.enabled).toLowerCase() === 'true';
  }

  config.mobile = normalizeMobile(config.mobile);

  return config;
}

function normalizeMobile(source = {}) {
  const defaults = {
    enabled: false,
    mount_path: '/auth/mobile',
    token_prefix: 'app_',
    token_bytes: 32,
    ttl_days: 90,
    max_tokens_per_user: 10,
    touch_interval_minutes: 60,
    cleanup_retention_days: 30,
    auto_create_table: true,
    table: 'api_tokens',
    columns: {
      id: 'id',
      userId: 'user_id',
      tokenHash: 'token_hash',
      tokenHint: 'token_hint',
      label: 'label',
      platform: 'platform',
      deviceId: 'device_id',
      lastUsedAt: 'last_used_at',
      expiresAt: 'expires_at',
      revokedAt: 'revoked_at',
      createdAt: 'created_at',
    },
  };

  const mobile = { ...defaults, ...source };
  mobile.columns = { ...defaults.columns, ...(source.columns || {}) };
  mobile.enabled = String(mobile.enabled).toLowerCase() === 'true';
  mobile.auto_create_table =
    String(mobile.auto_create_table).toLowerCase() !== 'false';

  mobile.mount_path = String(mobile.mount_path || '/auth/mobile');
  if (!mobile.mount_path.startsWith('/')) {
    mobile.mount_path = `/${mobile.mount_path}`;
  }
  mobile.mount_path = mobile.mount_path.replace(/\/+$/, '') || '/auth/mobile';

  mobile.token_prefix = String(mobile.token_prefix || 'app_');
  if (!/^[A-Za-z0-9_-]{2,16}$/.test(mobile.token_prefix)) {
    throw new Error('mobile.token_prefix must be 2-16 URL-safe characters.');
  }

  mobile.token_bytes = Number(mobile.token_bytes) || 32;
  if (mobile.token_bytes < 16 || mobile.token_bytes > 64) {
    throw new Error('mobile.token_bytes must be between 16 and 64.');
  }

  mobile.ttl_days = Number(mobile.ttl_days) || 90;
  if (mobile.ttl_days < 1 || mobile.ttl_days > 365) {
    throw new Error('mobile.ttl_days must be between 1 and 365.');
  }

  mobile.max_tokens_per_user = Number(mobile.max_tokens_per_user) || 0;
  if (mobile.max_tokens_per_user < 0 || mobile.max_tokens_per_user > 100) {
    throw new Error('mobile.max_tokens_per_user must be between 0 and 100.');
  }

  mobile.touch_interval_minutes = Number(mobile.touch_interval_minutes) || 0;
  if (mobile.touch_interval_minutes < 0) {
    throw new Error('mobile.touch_interval_minutes cannot be negative.');
  }

  mobile.cleanup_retention_days = Number(mobile.cleanup_retention_days) || 30;
  if (mobile.cleanup_retention_days < 1) {
    throw new Error('mobile.cleanup_retention_days must be at least 1.');
  }

  mobile.table = String(mobile.table || 'api_tokens');
  return mobile;
}

module.exports = { loadConfig, CONFIG_PATH };
