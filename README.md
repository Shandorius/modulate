# Modulate

Modulate is a private, self-hosted music library and player. It brings a
familiar streaming layout — Home, Search, Library, playlists, a persistent
player, queue and now-playing view — to music stored on your own server.

It is free, open-source software. There is no account with an external
service, no telemetry, no paid tier, and no remote push provider.

## What is included

- **Web app** — Angular 22, mobile-first, custom design system, works behind
  any reverse proxy.
- **API** — Express 5 + PostgreSQL, session cookies for the browser and
  revocable bearer tokens for mobile and Home Assistant.
- **Ingestion** — paste a track or playlist URL; the bundled yt-dlp/ffmpeg
  worker extracts audio, metadata, and artwork into your media volume.
- **Shared household library** — everyone on the instance sees the same music,
  while favourites, playlists, queues, and listening history stay personal.
- **Playlists** — private by default; owners can share with specific users or
  make a playlist public to everyone on the instance.
- **Admin-managed accounts** — the first account is the administrator; open
  registration is off by default.
- **Player** — queue, seek, volume, repeat, favourites, playlists, signed
  audio streaming with Range support.
- **Mobile** — Capacitor 8 Android and iOS projects, secure token storage,
  local notifications, exact-alarm handling.
- **Home Assistant** — REST state, transport commands, playlist playback, and
  announcements to a connected player.
- **One deployment unit** — the web UI, API, media streaming, and ingest worker
  all run in a single application image. PostgreSQL is the only companion
  container.

## Users and playlist sharing

Modulate is a shared household server, not a set of isolated music silos.

**Shared with every account:**

- tracks, albums, artists, artwork, and search
- recently added music
- public playlists

**Private to each account:**

- playlists
- favourites
- listening history
- playback state and queue
- import job history
- notifications

The **first registered account becomes the administrator**. Open registration is
then closed by default. The admin can create and remove accounts, promote other
admins, and reopen registration from **Settings → People**.

Playlist access:

| Mode | Visible to |
|---|---|
| Private | Owner only — the default |
| Shared | Owner plus selected accounts |
| Public | Every logged-in account on this instance |

Public does **not** mean anonymous internet access. Anonymous share links are a
possible later feature. Shared/public playlists are read-only for recipients;
only the owner can rename, edit, share, unpublish, or delete them.

## Screens

1. **Home** — continue listening, recently added, playlists, library summary.
2. **Search** — local search across tracks, artists, albums, and playlists.
3. **Library** — tracks, playlists, albums, imports, favourites.
4. **Collection** — playlist or album detail with queue and playlist actions.
5. **Settings** — imports, Home Assistant, notifications, and account.

## Quick start with Docker

Requirements: Docker + Compose. The image contains ffmpeg and yt-dlp.

```bash
git clone <your-fork> modulate
cd modulate
./scripts/setup.sh
docker compose up -d --build
```

Open `http://localhost:3000`.

`setup.sh` creates a `.env` with a generated PostgreSQL password. That is the
only required secret. Modulate generates its session and media-signing secrets
on first start and stores them in the `modulate_data` volume.

Useful commands:

```bash
docker compose ps
docker compose logs -f app
docker compose down
docker compose down -v   # destructive: removes database and media volumes
```

## Pull-only install from GHCR

After the GitHub Actions workflow publishes the image, a host does not need a
source checkout. Download only the production Compose file:

```bash
mkdir -p ~/modulate && cd ~/modulate
curl -fsSLO https://raw.githubusercontent.com/Shandorius/modulate/main/docker-compose.prod.yml
curl -fsSL \
  https://raw.githubusercontent.com/Shandorius/modulate/main/.env.server.example \
  -o .env
```

Set `POSTGRES_PASSWORD` and:

```env
MODULATE_IMAGE=ghcr.io/shandorius/modulate:latest
APP_PORT=3000
```

Then:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

GHCR packages are private by default. After the first image publish, open the
package settings once and change visibility to **Public**:

```text
https://github.com/users/Shandorius/packages/container/package/modulate
```

If you keep it private, authenticate with a token that has `read:packages`:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u Shandorius --password-stdin
```

### Published ports

Only the app port is published:

```yaml
ports:
  - "${APP_PORT:-3000}:3000"
```

PostgreSQL is not published in `docker-compose.prod.yml`. Keep it that way.
The app serves the web UI, API, health check, artwork, and audio on one origin.

## Nginx Proxy Manager

Create a Proxy Host:

- Domain: `music.example.com`
- Scheme: `http`
- Forward Hostname: the Docker host's LAN IP, for example `192.168.1.20`
- Forward Port: `3000`
- Websockets Support: on
- Block Common Exploits: on
- SSL: request a certificate and enable Force SSL

If Nginx Proxy Manager runs in Docker, do not use `localhost` from inside the
NPM container. Use the host's LAN IP, or attach both stacks to a shared Docker
network and proxy to `modulate-app:3000`.

Optional advanced configuration for audio seeking:

```nginx
proxy_buffering off;
```

No separate API hostname is required. Mobile apps and Home Assistant use the
same base URL.

## Local development

```bash
cp .env.example .env
# set POSTGRES_PASSWORD and DATABASE_URL if you are not using setup.sh
docker compose up -d db
npm install
npm run migrate
npm run dev
```

In another terminal:

```bash
cd web
npm install
npm start
```

The Angular dev server proxies `/api` and `/auth` to `http://localhost:3000`.

The test database is `modulate_test`. It is created by
`db/init/01-test-db.sql` when the local database volume is first created.

```bash
npm test
npm run test:web
npm run build
```

## Ingestion

Add a URL from Library, onboarding, or **Settings → Imports**. yt-dlp runs on
the server in the same container. Progress is stored in `ingest_jobs` and shown
in the UI. Failed jobs can be retried.

- Only public `http`/`https` URLs are accepted.
- Loopback, link-local, and private network addresses are rejected.
- Up to three active imports are allowed at once.
- One playlist import is capped at 200 items by default.

The user is responsible for the URLs they choose to download and for complying
with local law and the terms of the source site. Modulate does not bundle media
or bypass access controls.

## API highlights

```text
GET    /api/v1/playlists
GET    /api/v1/playlists/:id
PATCH  /api/v1/playlists/:id
PATCH  /api/v1/playlists/:id/visibility
GET    /api/v1/playlists/:id/shares
POST   /api/v1/playlists/:id/shares
DELETE /api/v1/playlists/:id/shares/:userId
GET    /api/v1/users/directory

GET    /api/v1/admin/users
POST   /api/v1/admin/users
PATCH  /api/v1/admin/users/:id
DELETE /api/v1/admin/users/:id
GET    /api/v1/admin/settings
PUT    /api/v1/admin/settings
```

The user picker exposes display names and account emails only to authenticated
users on the instance. Public playlist pages show the owner's display name, not
their email.

## Home Assistant

Open **Settings → Home Assistant**, create a token, and copy it once. Tokens
are revocable bearer credentials carrying the owner's access.

Endpoints:

```text
GET  /api/v1/ha/state
POST /api/v1/ha/command
POST /api/v1/ha/webhook
GET  /api/v1/ha/playlists
POST /api/v1/ha/announcements
```

Command body:

```json
{ "action": "play" }
{ "action": "pause" }
{ "action": "next" }
{ "action": "previous" }
{ "action": "seek", "positionSeconds": 42 }
{ "action": "volume", "volume": 0.35 }
{ "action": "play_playlist", "playlistId": "…" }
{ "action": "announce", "message": "Dinner is ready", "ttlSeconds": 300 }
```

Transport commands control the **currently connected player**. If no browser
or phone has an active player session, Modulate returns `409` rather than
pretending audio is playing. Announcements are delivered to the active client;
the web player shows a banner and uses browser speech where available.

Example `configuration.yaml`:

```yaml
rest_command:
  modulate_pause:
    url: "https://music.example.com/api/v1/ha/command"
    method: POST
    headers:
      Authorization: "Bearer YOUR_TOKEN"
      Content-Type: "application/json"
    payload: '{"action": "pause"}'

sensor:
  - platform: rest
    name: Modulate
    resource: "https://music.example.com/api/v1/ha/state"
    headers:
      Authorization: "Bearer YOUR_TOKEN"
    value_template: "{{ value_json.data.current.title if value_json.data.current else 'Idle' }}"
    json_attributes_path: "$.data.state"
    json_attributes:
      - isPlaying
      - positionSeconds
      - volume
```

## Android

The Android project is in `web/android`. Build with JDK 21 and the Android SDK:

```bash
cd web
npm run build
npx cap sync android
cd android
JAVA_HOME=/usr/lib/jvm/java-21-openjdk ./gradlew assembleDebug
```

The debug APK is at `web/android/app/build/outputs/apk/debug/app-debug.apk`.
On first launch, enter the URL of your Modulate instance. The token is stored
in Android Keystore-backed secure storage.

The merged manifest includes:

```text
POST_NOTIFICATIONS
SCHEDULE_EXACT_ALARM
RECEIVE_BOOT_COMPLETED
```

## iOS

The iOS project is in `web/ios` and uses Swift Package Manager through
Capacitor 8. It was added and synced on Linux, but an iOS binary requires
macOS with Xcode:

```bash
cd web
npm run build
npx cap sync ios
npx cap open ios
```

In Xcode, set your development team and bundle identifier, then run on a device
or simulator. Local notifications and background audio are configured.

## Architecture

```text
Browser / Android / iOS / Home Assistant
                  │
                  ▼
        Modulate app container :3000
        ├── Angular static app
        ├── Express API and sessions
        ├── signed media streaming
        ├── playback state and presence
        ├── Home Assistant endpoints
        └── in-process yt-dlp worker
                  │
                  ▼
          PostgreSQL container
```

The API and web UI share one origin. The server owns the canonical queue and
playback state; connected players report position and apply remote commands.

For future Windows/macOS/Linux desktop wrappers, the web client and API are
kept platform-neutral. Only `web/` is Capacitor-specific.

## Configuration

Only these values are normally needed:

```env
POSTGRES_PASSWORD=<generated>
APP_PORT=3000
```

Optional:

```env
DATABASE_URL=postgres://modulate:...@localhost:5439/modulate
DB_PORT=5439
```

`NODE_ENV`, CORS origins, public URLs, and session secrets are not user-facing
configuration. The image is production, same-origin web requests need no CORS,
native bearer requests are handled automatically, and secrets are generated
into `/data`.

## Backups

Nightly backups use the systemd timer, not Node:

```bash
./scripts/install-backup-timer.sh
```

The script writes PostgreSQL dumps to `backups/`. Back up the
`modulate_data` volume as well — it contains audio, artwork, and the generated
secrets.

Restore into a separate database first:

```bash
./scripts/restore-db.sh backups/modulate-YYYYMMDDTHHMMSSZ.dump restore_check
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for the production flow.

## License

AGPL-3.0. See [LICENSE](LICENSE).
