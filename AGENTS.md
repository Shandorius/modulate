# AGENTS.md — Build a New App from AppFoundation

You are the lead engineer for a new mobile-first application. The workspace is a
copy of **AppFoundation**. Your job is to turn the user's app idea into a
complete, tested, installable Android app: Express/PostgreSQL backend +
Angular/Capacitor frontend.

The user may give you only one or two sentences. Expand that into a compact
product brief, choose sensible defaults, and build it.

---

## Design isolation — read this first

The skeleton is **framework only**. It ships a reset stylesheet and an
unstyled starter UI. Nothing in it is a design direction for the new app.

Before writing UI code:

1. Derive a design direction from the new idea alone, and put it in the build
   plan:
   - three adjectives that describe the product
   - a palette: background, surface, text, muted text, border, accent, and text
     on accent
   - a type choice for body and display text
   - spacing/density, corner radius, and motion feel
   - one signature element that belongs to this idea
2. Replace `web/src/styles.css` with this app's own CSS. Custom CSS only: no
   component library, no copied template styles, no inherited palette, fonts,
   spacing, or layout.
3. Write every screen's copy from the brief. Do not reuse starter wording.
4. Treat the `Item`/`items` demo as disposable scaffolding. Replace it with the
   app's core object; do not extend it or keep its table.
5. If the idea resembles an app you have seen, still design from the brief.
   Never import another app's domain, colors, illustrations, or copy.

The class names in the starter templates are plain hooks. They have no styling;
define your own selectors or replace them.

---

## 1. Operating rules

- Work only inside the copied project directory. Never edit the original
  `AppFoundation` directory.
- Read this file completely before coding.
- Keep the existing `auth/` module intact unless a change is unavoidable.
- Do not copy the starter UI, the Items demo, or any visual design into the new
  app.
- Do not add Firebase, FCM, APNs, or any remote push service. Notifications are
  local only.
- Prefer boring, maintainable code over clever abstractions.
- Do not leave placeholder pages, TODO buttons, or unimplemented routes.
- Do not commit secrets, `.env.server`, APKs, or `node_modules`.

---

## 2. First response: a short build plan

Before changing files, produce:

1. **Product brief** — target user, core problem, core loop, why people return.
2. **Design direction** — adjectives, palette, type, density, and one signature
   element derived only from the idea.
3. **MVP scope** — at most 5 primary screens and 1 core object.
4. **Domain model** — tables, fields, relationships.
5. **API surface** — routes and what each does.
6. **Notification plan** — what triggers a notification, when, and why.
7. **Monetization** — free limits and Pro value.
8. **Out of scope** — what you are deliberately not building yet.

Ask at most **3 blocking questions**. If the idea is understandable, proceed
without asking. Default to an honest, anti-dark-pattern product. Visual
direction comes from the idea, never from the template.

---

## 3. Non-negotiable stack

### Backend
- Node 22+
- Express 5
- PostgreSQL
- Existing AppFoundation auth: session + mobile bearer tokens
- Argon2 password hashing
- Zod validation
- SQL migrations
- `node:test` + `supertest`

### Frontend
- Angular 22
- Standalone components, no NgModules
- Signals and `computed`
- `inject()` instead of constructor injection
- Lazy-loaded routes
- Plain CSS written for this app, with your own design tokens
- Mobile-first, bottom navigation
- No component library

### Mobile
- Capacitor 8
- Android target
- Secure token storage using Keychain/Keystore
- `@capacitor/local-notifications`
- `@capacitor/app`, `@capacitor/haptics`, `@capacitor/preferences`,
  `@capacitor/splash-screen`, `@capacitor/status-bar`

---

## 4. Project bootstrap

1. Copy this folder to the new project directory.
2. Rename `web-template/` to `web/`.
3. Change the app identity in:
   - `config/env.js`
   - `.env`, `.env.example`, `.env.server.example`
   - `web/src/app/core/app-config.ts`
   - `web/src/index.html`
   - `web/capacitor.config.ts`
   - `web/package.json`
4. Generate fresh secrets:

```bash
openssl rand -hex 32
```

Use different values for `SESSION_SECRET` and `POSTGRES_PASSWORD`.

5. Change `POSTGRES_DB`, `POSTGRES_USER`, and the local database port if needed.

Local start:

```bash
cp .env.example .env
docker compose up -d db
npm install
npm run migrate
npm run dev
```

Frontend:

```bash
cd web
npm install
npm run start
```

The API must answer:

```bash
curl http://localhost:3000/health
```

---

## 5. Backend conventions

Use this layout:

```text
routes/<resource>.js
services/<resource>Service.js
db/migrations/NNN_<domain>.sql
tests/<resource>.test.js
```

Rules:

- Every query is scoped by `user_id`.
- Validate every request with Zod through `middleware/validate`.
- Throw errors through `services/errors.js`.
- Keep route handlers thin; put behavior in services.
- Use transactions for multi-table writes.
- Add indexes for every foreign-key lookup and list query.
- Never return password hashes or internal token aliases.
- Add a migration for every schema change. Never edit an applied migration.

Already provided:

```text
GET/PATCH /api/v1/me
GET/POST  /api/v1/items
PATCH     /api/v1/items/:id
DELETE    /api/v1/items/:id
PATCH     /api/v1/account
POST      /api/v1/account/change-password
POST      /api/v1/account/sign-out-all
DELETE    /api/v1/account
GET/POST  /api/v1/onboarding
GET/PUT   /api/v1/notifications/preferences
GET       /api/v1/notifications/local-plan
GET       /api/v1/notifications/history
POST      /api/v1/notifications/test
```

Add the domain routes on top. Keep the account and notification slices intact.

Tests must cover:

- Registration and login
- Mobile bearer auth
- Cross-user isolation
- Validation failures
- Domain CRUD
- Entitlement limits
- Account password change and deletion
- Notification planning with the domain rules

Run:

```bash
npm test
```

---

## 6. Domain design

Keep the MVP small.

- One core object the user creates, completes, or tracks.
- One primary action.
- One history/progress view.
- One settings area.
- Do not add teams, comments, feeds, chat, or admin panels unless they are the
  core idea.

Use the app's own language. For example, if the app is about plants, call the
core object `Plant`, not `Task`.

Every list needs:

- A useful empty state
- A primary action
- A clear completion state
- No red overdue counters

Destructive actions need confirmation or undo.

Typical migration:

```text
db/migrations/005_<domain>.sql
```

`005_items.sql` is the disposable starter domain. On a fresh copy, replace it
with the real core object **before** the first `npm run migrate`. Do not ship
the Items table.

---

## 7. Frontend structure

Build in `web/` after renaming `web-template/`.

```text
web/
  src/app/core/
    api.service.ts
    app-config.ts
    auth.interceptor.ts
    auth.service.ts
    guards.ts
    token-storage.service.ts
    toast.service.ts
    dates.ts
    notification.service.ts
    local-notification.service.ts
    <domain>.service.ts
  src/app/features/
    auth/
    onboarding/
    shell/
    home/
    history/
    settings/
  src/styles.css
  src/index.html
  capacitor.config.ts
```

Required core behavior:

- `ApiService` prefixes `/api/v1`.
- Native builds use the production API origin from `app-config.ts`.
- Browser builds use relative URLs through the dev proxy.
- `AuthService` stores user, profile, tier, and entitlements as signals.
- `token-storage.service.ts` uses secure storage on native and localStorage on
  web.
- `auth.interceptor.ts` adds `Authorization: Bearer <token>`.
- Guards handle auth, guest-only routes, and onboarding.
- Toast service handles success, error, and undo messages.

Required screens:

1. Login / register
2. Onboarding that ends with a real first action
3. Main page with the core loop
4. Progress/history page
5. Settings with Account, Notifications, and domain preferences

Design rules:

- `src/styles.css` is a reset only. The template has no design system. Write all
  color, type, spacing, layout, and component CSS yourself.
- Mobile-first width, max around 760px on desktop.
- Bottom navigation, not a sidebar.
- Define CSS custom properties for this app's palette and spacing.
- Respect reduced motion.
- No fake loading states. Use skeletons only for real requests.

The template's `home` and `history` pages are structural examples backed by the
disposable Items API. Replace the copy, layout, service, and domain with the
real app. Do not inherit their appearance.

---

## 8. Auth and account

Web uses session cookies. Android uses opaque bearer tokens.

Mobile flow:

```text
POST /auth/mobile/register
POST /auth/mobile/login
POST /auth/mobile/refresh
POST /auth/mobile/logout
```

Store the token in Keychain/Keystore. Never in localStorage on native.

On launch:

1. Load the token.
2. Call `GET /api/v1/me`.
3. Restore the profile and entitlements.
4. Sync the device timezone automatically.
5. Refresh the notification plan.

Do not show a timezone picker. Use
`Intl.DateTimeFormat().resolvedOptions().timeZone`.

Account settings must support:

- Display name
- Password change
- Sign out all devices
- Account deletion

---

## 9. Notifications

Notifications are local only. The server computes the plan; the phone schedules
it.

The framework is already in place. Implement the app-specific rules in:

```text
services/notificationRules.js
```

`candidatesForDate()` receives the local date, weekday, preferences, and
database handle. Return candidates like:

```js
{
  key: `morning:${date}`,
  kind: 'morning_reminder',
  title: 'Your first reminder',
  body: "Open the app to see today's list.",
  scheduledMinutes: 8 * 60,
  data: { route: '/app/home' },
}
```

The service automatically applies:

- Timezone conversion
- Future-only filtering
- Quiet hours
- The 1–2 per day cap
- Shame-language filtering

Frontend requirements:

- Schedule with `@capacitor/local-notifications`
- Request notification permission
- Request exact-alarm permission on Android 12+
- Schedule up to 7 days ahead
- Cancel and rebuild the plan on launch, resume, and after data changes
- Show the real next reminder and date/time in settings
- Show whether exact alarms are allowed
- Provide a test notification button

Do not add remote push.

---

## 10. Entitlements and monetization

Use `services/entitlementService.js`.

Define:

```text
FREE: core loop, limited history, small limits
PRO:  higher/unlimited limits, deeper insights, more reminders
```

For beta builds:

```text
BETA_PRO=true
```

This unlocks every Pro feature for testing. Show “Beta — all features unlocked”
instead of pretending there is a paid subscription.

If Stripe is not configured:

- Keep the plan screen honest.
- Show what Pro will include.
- Do not fake a checkout success.

Never use:

- Fake countdowns
- Pay-to-remove-punishment
- Loot boxes
- Public shame leaderboards
- Hidden cancellation

---

## 11. Android build

Use JDK 21. JDK 27 is too new for the Android Gradle Plugin.

First time:

```bash
cd web
npm run build
npx cap add android
```

If Gradle cannot find the SDK, create `web/android/local.properties` with:

```text
sdk.dir=/path/to/android-sdk
```

Do not commit `local.properties`.

Every build:

```bash
cd web
npm run build
npx cap sync android
cd android
JAVA_HOME=/usr/lib/jvm/java-21-openjdk ./gradlew assembleDebug
```

Copy the artifact:

```bash
cp app/build/outputs/apk/debug/app-debug.apk ../../<AppName>-debug.apk
```

Bump `versionCode` and `versionName` in `web/android/app/build.gradle`.

Verify the merged manifest contains:

```text
POST_NOTIFICATIONS
SCHEDULE_EXACT_ALARM
RECEIVE_BOOT_COMPLETED
```

Report the APK path and SHA-256:

```bash
sha256sum <AppName>-debug.apk
```

---

## 12. Testing and definition of done

A task is only done when:

- `npm test` passes
- `npm run test:web` passes
- `npm run build` passes
- The APK builds
- The manifest has notification permissions
- The README, DEPLOYMENT, and SERVER_INFO are updated
- No secrets or node_modules are committed
- You provide:
  - A summary of what was built
  - Local run commands
  - APK path and hash
  - Deployment commands
  - Any known limitations

---

## 13. Deployment

Production target:

```text
API host: <slug>-api.mantaray.dev
Server:   shandorv@49.12.202.30
Network:  compose_nginx-network
```

Use `docker-compose.prod.yml`, `DEPLOYMENT.md`, and `scripts/deploy.sh`.

The container runs `node db/migrate.js` before `node app.js`.

Do not attempt SSH if it is unavailable. Prepare the exact commands and tell the
user to run them.

Backups run through the systemd timer, not Node:

```bash
./scripts/install-backup-timer.sh
```

---

## 14. Product guardrails

- No “overdue”, “failed”, “missed”, or “behind” language.
- No global leaderboards.
- No social comparison unless it is the core idea.
- “Not now” is always available.
- Rest days and streak freezes where streaks exist.
- Privacy-safe lock-screen copy.
- Easy cancellation.
- Export or delete user data.
- Reduced-motion support.
- Clear empty states.

---

## 15. Reference implementation

No reference app is included or needed. Build from this document, the copied
skeleton, and the user's idea. If another app happens to exist elsewhere on the
machine, ignore it: do not read it for patterns, copy, colors, or structure.
