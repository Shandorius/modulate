# Portable mobile bearer auth

A self-contained companion to the session-based `auth/` package. It adds
`/auth/mobile/*`, opaque bearer tokens, and guards that accept either a web
session or a mobile token.

Copy the whole `auth/` folder into another Express + PostgreSQL project. The
mobile module has no imports from the host application and needs no dependency
beyond what `auth/` already uses.

## What it provides

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/auth/mobile/register` | Create a user without a session; return a token |
| `POST` | `/auth/mobile/login` | Validate email/password; return a token |
| `POST` | `/auth/mobile/refresh` | Rotate the current token |
| `POST` | `/auth/mobile/logout` | Revoke the current token, or all with `?all=true` |
| `GET` | `/auth/mobile/status` | Bearer-authenticated user |
| `GET` | `/auth/mobile/devices` | List active token/device metadata |
| `DELETE` | `/auth/mobile/devices/:id` | Revoke one device token |

Response shape:

```json
{
  "token": "app_...",
  "expiresAt": "2027-01-28T...",
  "user": { "id": "...", "email": "..." }
}
```

The raw token is returned once. Only a SHA-256 hash is stored.

## Enable it

In `_auth-config.yaml`:

```yaml
mobile:
  enabled: true
  token_prefix: "app_"
  ttl_days: 90
  max_tokens_per_user: 10
  auto_create_table: true
```

`initAuth()` mounts the routes automatically and returns the module:

```js
const auth = await initAuth(app, { pool });

// Accepts a session or a bearer token.
app.get('/api/v1/me', auth.mobile.requireAuth, handler);

// Bearer only, for token-management endpoints.
app.post('/api/v1/device-only', auth.mobile.requireBearer, handler);
```

If `enabled` is false, `auth.mobile` is `null` and the rest of the auth package
behaves exactly as before.

Standalone usage:

```js
const initMobileAuth = require('./auth/mobile');

const mobile = await initMobileAuth(app, {
  pool,
  config: loadConfig(),
  userDB,
  passport,
  genPassword,
});
```

## Guards

- `requireAuth` — session **or** bearer. Drop-in replacement for `isAuth`.
- `requireBearer` — bearer only. Used by refresh/logout/status/devices.
- `optionalAuth` — attaches `req.user` when possible, never rejects.

Both set `req.auth`:

```js
{ type: 'session' }
{ type: 'bearer', tokenId: '...', platform: 'ios' }
```

## Token lifecycle

- 32 random bytes, base64url encoded, prefixed with `app_`.
- SHA-256 hash stored in `api_tokens.token_hash`; raw token never persisted.
- Default 90-day expiry.
- Re-login from the same `deviceId` revokes the previous device token.
- Active tokens over `max_tokens_per_user` are evicted least-recently-used first.
- `last_used_at` is updated at most once per `touch_interval_minutes`.
- `revokeAllForUser(userId)` is exported for password-change or account-deletion
  hooks.

## Cleanup

The module does not schedule background work. Run this from the host app:

```js
await auth.mobile.cleanupExpired(); // deletes expired/revoked tokens older than retention
```

## Database

The canonical migration is:

```sql
CREATE TABLE api_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  token_hint    varchar(24),
  label         varchar(100),
  platform      varchar(20),
  device_id     varchar(200),
  last_used_at  timestamptz,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

`auto_create_table: true` mirrors `setup_session_db.js` for projects without a
migration runner. Set it to `false` in production and own the migration.

Every table and column mapping is configurable:

```yaml
mobile:
  table: "api_tokens"
  columns:
    id: "id"
    userId: "user_id"
    tokenHash: "token_hash"
    tokenHint: "token_hint"
    label: "label"
    platform: "platform"
    deviceId: "device_id"
    lastUsedAt: "last_used_at"
    expiresAt: "expires_at"
    revokedAt: "revoked_at"
    createdAt: "created_at"
```

## Security notes

- Bearer tokens are high-entropy random values, so SHA-256 is appropriate.
  Do not use a slow password hash on every request.
- The module returns generic `401` responses and sets
  `WWW-Authenticate: Bearer realm="api"`.
- Apply rate limiting at the host level. The included the host app app wraps these
  routes with `express-rate-limit`.
- Store tokens in Keychain/Keystore on native clients, not plain WebView
  localStorage.
