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
- **Player** — queue, seek, volume, repeat, shuffle, favourites, playlists,
  signed audio streaming with Range support.
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
possible later feature.

Playlist sharing has two recipient roles:

| Role | Can do |
|---|---|
| Viewer | Play the playlist |
| Editor | Add, remove, and reorder tracks |

The owner controls the playlist name, description, visibility, sharing, and
deletion. Public playlists remain read-only. Editors can reorder with
drag-and-drop on desktop or the up/down buttons on any device. The new order is
saved automatically.

Simultaneous reorders are protected by a playlist revision. If someone else
changed the playlist first, the stale save is rejected and the editor is asked to
reload instead of silently overwriting the other person's changes.

## Browsing and adding tracks

The Library track list loads from the server in pages rather than assuming the
whole collection fits in memory:

- **Sort** by newest first, oldest first, title, artist, or album.
- **Load more** appends the next page while keeping the chosen sort.
- **Play all** queues the entire library in the current sort order, not just the
  loaded page.

The **Add tracks** dialog searches the shared library on the server, so it stays
usable for large collections:

- Search by title, artist, or album with a short debounce.
- Sort the same way, defaulting to **Newest first** for quick import triage.
- Tracks already in the playlist are excluded by the server.
- 50 results per page with a **Load more** button and a live match count.
- Adding a track removes it from the results immediately; the dialog stays open
  so several tracks can be added in a row.
- Empty states distinguish “no matches” from “everything is already in this
  playlist”.

## Playback modes

The player has two independent modes, and both are per account and synced to
every connected device:

- **Shuffle** keeps the track you are listening to and randomises what comes
  next. Already-played tracks stay where they are, the queue panel shows the
  real shuffled order, and turning shuffle off restores the original order.
  Starting an album or playlist while shuffle is on keeps your chosen track
  current and shuffles the rest. With repeat-all on, the queue is reshuffled for
  each new pass.
- **Repeat** cycles off → the whole queue → this track. Repeating one track
  restarts it when it ends; pressing Next yourself still moves to the next
  track.

Both controls appear in the desktop player bar and in the mobile Now Playing
sheet.

## Screens

1. **Home** — continue listening, playlists (with a create button), recently
   added, and the library summary.
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

### Host folder storage instead of named volumes

Named volumes are the default, but you can keep all persistent data in normal
host folders. The repository includes a ready-to-use
[`docker-compose.bind.yml`](docker-compose.bind.yml):

```bash
mkdir -p ~/modulate
cd ~/modulate
curl -fsSLO \
  https://raw.githubusercontent.com/Shandorius/modulate/main/docker-compose.bind.yml
curl -fsSL \
  https://raw.githubusercontent.com/Shandorius/modulate/main/.env.server.example \
  -o .env
```

Set:

```env
POSTGRES_PASSWORD=<generated-hex-password>
APP_PORT=3000
MODULATE_IMAGE=ghcr.io/shandorius/modulate:latest

# Optional: match the container user to your host account.
# PUID=1000
# PGID=1000
```

The relevant storage mapping is:

```yaml
volumes:
  - ./data:/data
  - ./postgres:/var/lib/postgresql/data
```

Create the folders:

```bash
mkdir -p data postgres music
```

The app entrypoint repairs `./data` ownership automatically on first start. It
checks whether `PUID`/`PGID` can write the folder; if not, it runs a one-time
recursive ownership fix and then drops privileges to that user.

By default `PUID=1000` and `PGID=1000`. To match your host account:

```bash
id -u
id -g
```

Put those values in `.env` if they are different. There is no normal need to
run `chown` manually. PostgreSQL's official entrypoint handles `./postgres`
initialization; on unusual filesystems, the fallback is:

```bash
sudo chown -R 70:70 postgres
```

Start:

```bash
docker compose -f docker-compose.bind.yml pull
docker compose -f docker-compose.bind.yml up -d
```

The folder layout becomes:

```text
~/modulate/
├── docker-compose.bind.yml
├── .env
├── data/
│   ├── media/
│   ├── session-secret
│   └── stream-secret
└── postgres/
```

Notes:

- `docker compose ... down -v` does not delete bind-mounted host folders.
- Do not change `POSTGRES_PASSWORD` after PostgreSQL has initialized.
- Keep `postgres/` on a local filesystem, not NFS/SMB.
- On SELinux hosts, use `./data:/data:Z` and
  `./postgres:/var/lib/postgresql/data:Z`.
- Do not set `PUID=0`; that would run the application as root.

Back up bind-mount installs with:

```bash
tar czf modulate-data-$(date +%F).tar.gz data
docker compose -f docker-compose.bind.yml exec -T db \
  pg_dump -U modulate -d modulate -Fc > modulate-db-$(date +%F).dump
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
- YouTube watch links default to the single video, even when they contain a
  `list` or `start_radio` parameter. Choose **Playlist** to import the full mix
  or playlist.
- Cancelling an import terminates its yt-dlp process and releases the worker for
  the next job.
- Playlist progress is aggregated across items; single-track progress never
  moves backward.

The user is responsible for the URLs they choose to download and for complying
with local law and the terms of the source site. Modulate does not bundle media
or bypass access controls.

## Existing music library

You can also point Modulate at a normal folder of music files. This is
read-only: the app scans files in place and never edits or deletes them.

Compose mounts:

```yaml
volumes:
  - "${MUSIC_DIR:-./music}:/music:ro"
```

Put your library in `./music` on the host, then go to:

```text
Settings → Music folder → Scan library
```

Modulate indexes MP3, M4A, FLAC, OGG, Opus, WAV, AAC, and WebM files using
ffprobe. It reads embedded tags, sidecar artwork such as `cover.jpg` or
`folder.jpg`, and embedded artwork. The folder is scanned only when you press
**Scan library**; there is no automatic file watcher yet.

Scanned tracks are marked **external**. Removing one from Modulate removes its
index entry and playlist references but leaves the original file untouched.

## Deleting music

In **Library** or **Search**, tracks you are allowed to manage show a trash
button:

- A user can delete tracks they imported through yt-dlp.
- An admin can delete any managed track or remove any scanned external track.
- Deleting a managed track removes its downloaded file from the media volume.
- Removing an external/scanned track only removes it from Modulate.

Playlists are separate: removing a track from a playlist does not delete it
from the library.

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
{ "action": "set_repeat", "repeatMode": "all" }
{ "action": "set_shuffle", "shuffle": true }
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
