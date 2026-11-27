# Deployment

Modulate is designed to sit behind a reverse proxy such as Nginx Proxy Manager.
The app image serves the web UI, API, media, and ingest worker on one port.

Production target for this workspace:

```text
Host:    music.example.com
Port:    3000
Server:  shandorv@49.12.202.30
Project: /home/shandorv/modulate
```

## 1. Build and publish the image

GitHub Actions publishes multi-arch images to GHCR:

```text
ghcr.io/<owner>/modulate:latest
ghcr.io/<owner>/modulate:<version>
ghcr.io/<owner>/modulate:sha-<commit>
```

A public package is pullable without credentials. For a private package, log
in on the server:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-user> --password-stdin
```

Docker Hub is optional. Add a second workflow step with
`DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN` secrets if you want to mirror the image.

## 2. Prepare the server

```bash
ssh shandorv@49.12.202.30
mkdir -p /home/shandorv/modulate
cd /home/shandorv/modulate
```

Create `.env`:

```bash
cp .env.server.example .env
# Set POSTGRES_PASSWORD to a new 64-char value:
openssl rand -hex 32
```

Set `MODULATE_IMAGE` to your published image in the environment or edit the
default in `docker-compose.prod.yml`:

```env
MODULATE_IMAGE=ghcr.io/<owner>/modulate:latest
```

Only `POSTGRES_PASSWORD` is required. `APP_PORT` defaults to `3000`.

## 3. Transfer or pull the compose files

Copy `docker-compose.prod.yml` to the server, or use the deploy helper from a
checkout:

```bash
SERVER_USER=shandorv \
SERVER_HOST=49.12.202.30 \
REMOTE_PATH=/home/shandorv/modulate \
ENV_FILE=.env \
./scripts/deploy.sh
```

The deploy helper syncs the project, pulls the image, and starts:

```bash
docker compose -f docker-compose.prod.yml up -d
```

## 4. Nginx Proxy Manager

Create a Proxy Host:

- Domain: `music.example.com`
- Scheme: `http`
- Forward Hostname: Docker host LAN IP, for example `192.168.1.20`
- Forward Port: `3000`
- Websockets Support: on
- Block Common Exploits: on
- SSL: request a certificate and Force SSL

If NPM is in Docker on the same host, do not use `localhost` from inside the
container. Use the host's LAN IP, or attach both stacks to a shared network and
proxy to `modulate-app:3000`.

Add this to the NPM advanced configuration for smooth audio seeking:

```nginx
proxy_buffering off;
```

No separate API subdomain or CORS configuration is needed.

## 5. Verify

```bash
curl https://music.example.com/health
```

Expected:

```json
{"status":"ok","service":"Modulate API"}
```

Then open the site. The first account you create becomes the instance
administrator. Open registration closes automatically after that. Use
**Settings → People** to create accounts for the household, and add music from
**Settings → Imports**.

## 6. Updates

```bash
cd /home/shandorv/modulate
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Migrations run inside the app container before the server starts.

## 7. Backups

Install the systemd timer:

```bash
./scripts/install-backup-timer.sh
```

It writes PostgreSQL dumps to `backups/` daily at 03:15 with a randomized
delay and keeps 14 days.

Back up the media and secrets volume too:

```bash
docker run --rm \
  -v modulate_modulate_data:/data \
  -v "$PWD/backups:/backup" \
  alpine tar czf /backup/modulate-data-$(date -u +%Y%m%dT%H%M%SZ).tar.gz -C /data .
```

Restore the database into a separate database first:

```bash
./scripts/restore-db.sh backups/modulate-YYYYMMDDTHHMMSSZ.dump restore_check
```

## 8. Troubleshooting

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs -f db
```

- **502 from NPM**: NPM cannot reach the host port. Check the host IP, firewall,
  and that `docker compose ps` shows `0.0.0.0:3000->3000/tcp`.
- **Cookies not sticking**: ensure SSL and `X-Forwarded-Proto` are forwarded.
  Modulate trusts one proxy by default.
- **Ingest fails**: check `yt-dlp` output in the app logs. Some sources require
  cookies or are region-restricted; those are upstream limitations.
- **No audio in mobile background**: the web audio element is used. Basic
  background audio is enabled, but platform-specific media session hardening is
  a later phase.
