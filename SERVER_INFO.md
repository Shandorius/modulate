# Server information

Production target:

- user: `shandorv`
- host: `49.12.202.30`
- project root: `/home/shandorv/modulate`
- public URL: `https://music.example.com`
- app port: `3000`

## Reverse proxy

Modulate is a single-origin application. Use Nginx Proxy Manager or an
equivalent reverse proxy:

```text
https://music.example.com
        ↓
Nginx Proxy Manager
        ↓
http://<docker-host-ip>:3000
        ↓
modulate-app container
        ├── Angular web app
        ├── /api and /auth
        ├── /stream and /artwork
        └── /health
```

NPM Proxy Host settings:

- Scheme: `http`
- Forward hostname: Docker host LAN IP
- Forward port: `3000`
- Websockets support: on
- SSL: request certificate and force HTTPS
- Advanced: `proxy_buffering off;` for audio seeking

The PostgreSQL container is internal only and must not be proxied or published
in production.

## Runtime

```text
modulate-app    app image, port 3000
modulate-db     postgres:17-alpine, internal only
modulate_data   /data: media, artwork, session secret, media-signing secret
modulate_pgdata PostgreSQL data
```

Only `POSTGRES_PASSWORD` is required. `APP_PORT` optionally changes the host
port. No `NODE_ENV`, CORS, public URL, or session secret configuration is
required.

## Networking

The default Compose files do not depend on an external `compose_nginx-network`.
For the existing server, either:

1. Publish the app port and let NPM forward to the host IP; or
2. Attach the app container to NPM's Docker network and forward to
   `modulate-app:3000`.

The mobile app and Home Assistant use the same public base URL. Native bearer
tokens and Home Assistant tokens are revocable from **Settings → Home
Assistant**.

The first account is the instance administrator. Open registration is closed by
default afterwards; admins manage accounts under **Settings → People**. Music
is shared by all accounts, while playlists, favourites, queues, and history stay
personal. Playlists are private by default and can be shared with selected
users or made public to logged-in users.
