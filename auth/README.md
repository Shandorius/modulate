# Portable Passport auth module

A copyable Express + PostgreSQL authentication module built on Passport, `express-session`, `connect-pg-simple` and Argon2.

The module is self-contained: copy `auth/` into another Node/Express project, edit one YAML file, and mount it. Your application can use it unchanged.

---

## What it provides

| Method | Route | Description |
| --- | --- | --- |
| `POST` | `/auth/register` | `{ email, password, displayName? }` — creates a user and logs in |
| `POST` | `/auth/login` | `{ email, password }` |
| `GET` | `/auth/status` | `{ authenticated, user }`, or `401` |
| `GET` / `POST` | `/auth/logout` | Destroys the session and clears the cookie |
| `PUT` | `/auth/update-user` | Update `displayName`, `firstName`, `lastName` (self or admin) |
| `DELETE` | `/auth/delete` | Delete self or, as admin, another user |
| `POST` | `/auth/mobile/register` | Optional mobile bearer token registration |
| `POST` | `/auth/mobile/login` | Optional mobile bearer token login |
| `POST` | `/auth/mobile/refresh` | Rotate the current mobile token |
| `POST` | `/auth/mobile/logout` | Revoke the current mobile token |
| `GET` | `/auth/mobile/status` | Bearer-authenticated user |
| `GET` | `/auth/mobile/devices` | List active mobile tokens |
| `DELETE` | `/auth/mobile/devices/:id` | Revoke one device token |

Exports:

- `initAuth(app, { pool?, config?, configPath?, passport? })`
- `require('./auth').loadConfig`
- `require('./auth/middleware')` → `isAuth`, `isAdmin`, `requiredRole(role)`
- The object returned by `initAuth` includes `mobile` when enabled:
  `auth.mobile.requireAuth`, `auth.mobile.requireBearer`, and cleanup helpers.

See [`mobile/README.md`](mobile/README.md) for the portable token module.

---

## Files

| File | Responsibility |
| --- | --- |
| `_auth-config.yaml` | The only file you normally edit: session policy, roles, strategy fields, table name and column mappings |
| `config.js` | Loads the YAML and resolves `${ENV_VAR}` / `${ENV_VAR:-default}` placeholders |
| `index.js` | `initAuth`: session store, Passport, mounts `/auth`, returns helpers |
| `passport-logic.js` | Local strategy, Argon2 hashing and verification, serialise/deserialise |
| `routes.js` | Register, login, status, logout, update, delete |
| `middleware.js` | `isAuth`, `isAdmin`, `requiredRole` |
| `userdatabase.js` | Mapping-aware repository; identifiers are whitelisted and values parameterised |
| `setup_session_db.js` | Creates the `user_sessions` table when the host app has no migration |
| `mobile/` | Optional opaque bearer tokens, `/auth/mobile/*`, and session-or-bearer guards |

---

## 1. Install dependencies

```bash
npm install express express-session connect-pg-simple passport passport-local \
  argon2 js-yaml pg
```

`helmet` is recommended at the app level. Google OAuth is not implemented in this edition; the YAML keys are reserved so a strategy can be added without changing the config shape.

---

## 2. Configure the YAML

`_auth-config.yaml` maps logical fields to whatever your database actually uses:

```yaml
app:
  session_secret: "${SESSION_SECRET}"
  session_expiration: 1000 * 60 * 60 * 24 * 30 * 3
  cookie_name: "ic.sid"
  auto_create_session_table: true
  roles: [admin, user]

strategies:
  local:
    enabled: true
    usernameField: "email"
    passwordField: "password"

database:
  connection:
    host: "${DB_HOST}"
    user: "${DB_USER}"
    password: "${DB_PASSWORD}"
    port: "${DB_PORT}"
    database: "${DB_NAME}"

  tables:
    users: "users"

  columns:
    id: "id"
    email: "email"
    password: "password_hash"
    displayName: "display_name"
    userType: "user_type"
    lastLogin: "last_active_at"
```

Notes:

- Every `${VAR}` is replaced from `process.env` at startup. Keep secrets in `.env`.
- `columns.password` must point at the stored hash (your application uses `password_hash`).
- Only mapped columns are written. Remove optional mappings your schema does not have.
- `cookie_name` must be unique if several apps share a host.

---

## 3. Mount it

Session middleware and Passport must be installed by `initAuth`, and `/auth` must be mounted before your protected routes.

```js
const express = require('express');
const { Pool } = require('pg');
const initAuth = require('./auth');

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(express.json());

// Creates the session table if requested, mounts session + Passport + /auth.
await initAuth(app, { pool });

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(3000);
```

### Protecting routes

```js
const { isAuth, isAdmin } = require('./auth/middleware');

app.get('/account', isAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get('/admin', isAdmin, (req, res) => {
  res.json({ ok: true });
});
```

With mobile tokens enabled, prefer the combined guard so one route serves both
web sessions and native bearer tokens:

```js
const auth = await initAuth(app, { pool });

app.get('/api/account', auth.mobile.requireAuth, (req, res) => {
  res.json({ user: req.user, auth: req.auth });
});
```

---

## Expected user table

At minimum the mapped columns need: id, unique email, password hash, and user type.

```sql
CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          VARCHAR(255) NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  display_name   VARCHAR(100),
  user_type      VARCHAR(20) NOT NULL DEFAULT 'user'
                 CHECK (user_type IN ('user', 'admin')),
  last_active_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

The session table (`user_sessions`) is created automatically when `auto_create_session_table` is true, or by your migrations. your application creates it in `001_extensions_users_sessions.sql`.

---

## Mobile bearer auth (optional)

Set this in `_auth-config.yaml`:

```yaml
mobile:
  enabled: ${MOBILE_AUTH_ENABLED:-false}
  token_prefix: "app_"
  ttl_days: 90
  auto_create_table: true
```

Then call `initAuth` as usual. `auth.mobile` is `null` when disabled. Tokens are
opaque, hashed with SHA-256 at rest, revocable, and stored in a configurable
`api_tokens` table. See [`mobile/README.md`](mobile/README.md) for the full
contract, cleanup job, and security notes.

## Security checklist

- Change `SESSION_SECRET` for every deployment; never commit `.env`.
- Run behind TLS. In production the module sets `trust proxy` and `secure: 'auto'` cookies.
- Passwords are hashed with Argon2id; minimum length is enforced at registration.
- Identifiers from YAML are whitelisted and quoted; all values use parameterised queries.
- `req.user` is normalised to `{ id, user_type, ... }` regardless of physical column names.
- Delete or rotate sessions by clearing the `user_sessions` rows for a user if needed.

---

## Migrating from another app

1. Copy `backend/auth/` into the new project.
2. Install the dependencies listed above.
3. Edit only `_auth-config.yaml` for the new table/column names and cookie policy.
4. Call `initAuth(app, { pool })` after `express.json()` and before protected routes.
5. Import `isAuth` / `isAdmin` where needed.
6. Ensure the user table and `user_sessions` table exist.
