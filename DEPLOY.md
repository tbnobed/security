# FrontDesk — Docker deployment (Ubuntu 24.04)

Self-hosted deployment using Docker Compose. Three services run behind one
container that publishes the app: **web** (nginx serving the built UI +
reverse-proxying `/api`), **api** (the Express server), and **db** (Postgres).
A one-shot **migrate** step creates the schema and seeds the admin user before
the API starts.

```
browser ──▶ web (nginx :80) ──▶ /api ──▶ api (:8080) ──▶ db (Postgres :5432)
                    └── serves the built React UI (static files)
```

## 1. Prerequisites

Install Docker Engine + the Compose plugin on the server:

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
# optional: run docker without sudo
sudo usermod -aG docker "$USER"   # then log out/in
```

Copy this project directory to the server (git clone, scp, rsync — your choice).

## 2. Configure

```bash
cp .env.example .env
nano .env
```

At minimum set:

- `POSTGRES_PASSWORD` — a strong database password. It is placed into a Postgres
  connection URL, so use only URL-safe characters (letters, digits, `- _ . ~`);
  avoid `@ : / # % ? &` or spaces, which would corrupt the URL.
- `SESSION_SECRET` — generate with `openssl rand -hex 32`.
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` — the first admin login.
  `SEED_ADMIN_PASSWORD` is required: `docker compose` refuses to start without it,
  so an install can never ship with a known default password.
- `VITE_SITE_NAME` (and optional `VITE_CLIENT_NAME` / `VITE_CLIENT_LOGO`) — branding.
- `VITE_BADGE_WIDTH` / `VITE_BADGE_HEIGHT` (optional) — the **default** printed
  visitor-badge size. Badge size is really a per-workstation setting: each security
  desk picks its own label size in-app (the **Label size** control next to the Print
  Badge button and on the dashboard) and it is remembered in that browser, because
  different desks at the same site can have different printers (e.g. a Brother
  QL-820NWB on a 2.4" roll). These env vars only seed the default for a fresh
  browser. Accepts a CSS length in `in`/`mm`/`cm` (e.g. `2.4in`, `62mm`). Defaults
  to `3in` × `2in`. Because they are build-time, rebuild the web image after changing
  the default; the in-app per-desk override needs no rebuild.

Optional:

- `SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL` — enable email alerts (the from
  address must be a Verified Sender/domain in SendGrid).
- `APP_BASE_URL` — public base URL of the app (e.g. `http://192.168.1.10` or
  `https://frontdesk.example.com`). Used for one-click Approve/Deny links in
  pre-registration approval emails. Recommended in production. If blank, the
  server falls back to the URL it learns from security/admin staff sign-ins
  (persisted across restarts); until a staff member has signed in at least
  once after install, approval emails omit the buttons and direct approvers
  to the in-app Approvals page.
- `TZ` — IANA timezone (e.g. `America/Chicago`) used by the API for email
  timestamps and "today" windows (kiosk search, Productions Today, client
  portal). Defaults to `UTC`. The web UI always shows times in each viewer's
  own browser timezone.
- `MAXXESS_BRIDGE_TOKEN` — shared secret that lets the Maxxess access-control
  bridge (`bridge/maxxess-bridge/`, runs on the LAN next to the eFusion
  server) push building occupancy + door events into FrontDesk. Generate with
  `openssl rand -hex 32` and use the same value in the bridge's `.env`. Leave
  blank to disable the Building page's data feed.
- `HTTP_PORT` — host port to publish (default `80`).
- `SESSION_COOKIE_SECURE` — see the HTTPS note below.

## 3. Build and start

```bash
docker compose up -d --build
```

This builds the images, starts Postgres, runs the migrate step (schema + admin
seed), then starts the API and web. First build takes a few minutes.

Open `http://<server-ip>:<HTTP_PORT>` and log in with the seeded admin
credentials.

Check status / logs:

```bash
docker compose ps
docker compose logs -f api
docker compose logs -f web
```

## 4. HTTPS (recommended for production)

The app ships over plain HTTP by default so it works immediately on a LAN.

**Camera features require HTTPS on phones and tablets.** iOS Safari, Android
Chrome, and all modern browsers only allow camera access on secure (HTTPS)
pages. Over plain HTTP the phone ID-scan page, kiosk photo capture, and webcam
photos will show a "camera unavailable" message with a manual-entry fallback.
If you use the ID scan or kiosk photos, HTTPS is effectively required.

For internet-facing use (or to enable camera features), terminate TLS in front
of it and then:

1. Point your TLS reverse proxy (Caddy, nginx, Traefik, or a load balancer) at
   the published `web` port.
2. Set `SESSION_COOKIE_SECURE=true` in `.env` and `docker compose up -d` again.

If you skip step 2 while serving over HTTPS, logins still work; setting it true
just hardens the session cookie. **Do not** set it true while serving over plain
HTTP — the browser will refuse to send the cookie and login will fail.

## 5. Common operations

Update to a new version of the code:

```bash
git pull                       # or copy the new files over
docker compose up -d --build   # rebuilds; migrate re-runs schema push safely
```

Re-seed / reset the admin password (edit `SEED_ADMIN_*` in `.env` first):

```bash
docker compose run --rm migrate
```

Back up the database:

```bash
docker compose exec db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > frontdesk-backup.sql
```

Stop / remove (data volumes are preserved unless you add `-v`):

```bash
docker compose down
```

## Notes

- **Persistence**: Postgres data lives in the `db-data` volume; visitor photos
  (PII) in the `uploads` volume. Both survive `docker compose down` and restarts.
- **Schema changes**: the `migrate` service runs `drizzle-kit push`. On a fresh
  DB it applies everything non-interactively. If a future schema change involves
  a potentially destructive column change, push may refuse; run a force push
  manually and review first:
  `docker compose run --rm migrate sh -c "pnpm --filter @workspace/db run push-force"`.
- **No external dependencies** are required for the app to run other than the
  database. SendGrid (email alerts) and the bookings API are optional; when
  unset those features simply no-op.
