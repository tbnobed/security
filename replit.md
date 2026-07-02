# FrontDesk — Studio Guest Management System

A web-based guest management system for broadcast studio security desks — check guests in/out, manage pre-registrations, watchlists, and audit logs. Branded as **FrontDesk** (OBTV Studio Security). Brand assets live in `artifacts/studio-gms/public/` (favicon.ico/.svg, `frontdesk-icon-*.png` including the 180px apple-touch icon, `frontdesk-logo-*.svg`); the in-app mark is `public/logo.svg`. The mark is a security counter with a signal-teal presence dot (= on-site status).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/studio-gms run dev` — run the frontend (port 19603)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-provisioned)
- Required env: `SESSION_SECRET` — secret used to sign session cookies (must be set; server refuses to start without it)
- Optional env: `BOOKINGS_API_URL` — base URL of the external bookings API for the dashboard "Productions Today" panel (defaults to `https://plex.bookstud.io/api/public/bookings`). The server appends `start`/`end` query params for today's UTC window and proxies the result via `GET /api/productions/today`.
- Optional env: `SENDGRID_API_KEY` (secret) + `SENDGRID_FROM_EMAIL` — enable outbound email alerts for visitor events. Both must be set (uses `@sendgrid/mail` directly, no Replit connector, so it works in self-hosted Docker). If either is missing the server logs a warning at startup and email alerts are a silent no-op; everything else works. `SENDGRID_FROM_EMAIL` must be a verified SendGrid sender/domain. Check live status via `GET /api/alert-status`.
- Frontend env: `VITE_SITE_NAME` (in `artifacts/studio-gms/.env`) — the single static site/location name shown across the app. There is no in-app site selector; change this env var + rebuild to deploy for a different location. Must restart the `web` workflow after changing it.
- Frontend env (client branding for the PUBLIC `/preregister` page): `VITE_CLIENT_NAME` (shown under the logo; blank falls back to `VITE_SITE_NAME`) and `VITE_CLIENT_LOGO` (a filename in `artifacts/studio-gms/public/` such as `client-logo.png`, or a full URL; blank falls back to the default FrontDesk mark). Resolved in `src/lib/site.ts` as `CLIENT_NAME` / `CLIENT_LOGO_URL`. To rebrand for a new client: drop their logo in `public/`, update these two env vars, and restart the `web` workflow.
- Seed the fixed admin: `node scripts/src/seed-admin.mjs` (defaults to `admin@studiogms.com` / `StudioAdmin!2026`; override with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`)

## Deployment target

- **Self-hosted**: must run as a Docker container on the user's own Ubuntu server (not Replit Deployments). Keep everything container-friendly: bind to `PORT`, no Replit-only runtime assumptions, all config via env vars. Auth is fully self-contained (username/password + Postgres-backed sessions) — no outbound internet or third-party auth service required. Only `DATABASE_URL` and `SESSION_SECRET` are needed to run; `SENDGRID_API_KEY`/`SENDGRID_FROM_EMAIL` are optional and only needed for email alerts (SendGrid is the sole outbound dependency and is used directly, not via any Replit connector).
- **Docker deploy files** (repo root): `Dockerfile.api` (multi-stage; `builder` runs `pnpm install` + esbuild bundle, `runtime` copies only `dist/` and runs `node artifacts/api-server/dist/index.mjs`), `Dockerfile.web` (`builder` runs the Vite build with `VITE_*` build args baked into `.env`; `runtime` is nginx serving `dist/public` and reverse-proxying `/api` → the api service via `deploy/nginx.conf`), `docker-compose.yml` (services: `db` postgres:16-alpine, one-shot `migrate` reusing the api builder to run drizzle push + seed-admin, `api`, `web`; named volumes `db-data` + `uploads`), `.dockerignore`, `.env.example`, and `DEPLOY.md` (step-by-step Ubuntu instructions). Compose start order: `db` healthy → `migrate` completed → `api` healthy → `web`. `SEED_ADMIN_PASSWORD` is a REQUIRED compose var (no default) so an install can never ship with a known password. `POSTGRES_PASSWORD` must be URL-safe (it's interpolated into `DATABASE_URL`).
- Optional env: `SESSION_COOKIE_SECURE` — controls the session cookie `secure` flag (default `false`). Leave `false` for plain HTTP on a LAN/IP; set `true` when serving over HTTPS (e.g. behind a TLS-terminating reverse proxy), otherwise the browser won't send the Secure cookie over HTTP and login silently fails. This replaces the old `NODE_ENV==="production"` check so the default self-hosted HTTP deploy works out of the box.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind v4 + shadcn/ui, Wouter routing
- API: Express 5 + express-session
- DB: PostgreSQL + Drizzle ORM
- Auth: self-contained username/password — bcryptjs hashing + `express-session` with `connect-pg-simple` (Postgres-backed sessions)
- Validation: Zod (zod/v4), drizzle-zod
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/db/src/schema/` — Drizzle table definitions (guests, users, preregistrations, watchlist, audit)
- `artifacts/api-server/src/routes/` — Express route handlers (guests, checkout, watchlist, audit, users, dashboard, photos)
- `artifacts/api-server/src/lib/auth.ts` — requireAuth / requireAdmin middleware, bcrypt hash/verify helpers, session helpers
- `artifacts/api-server/src/routes/auth.ts` — login / logout route handlers
- `artifacts/studio-gms/src/` — React frontend (pages, components, auth context in `src/lib/auth.tsx`)
- `artifacts/studio-gms/src/lib/site.ts` — reads `VITE_SITE_NAME` and exports the static `SITE_NAME`
- `artifacts/studio-gms/src/pages/studios.tsx` — admin studios CRUD; `preregister.tsx` — public self-registration page
- `lib/db/src/schema/studios.ts` — studios table (id/name/createdAt, uniqueIndex on `lower(name)`)

## Architecture decisions

- Contract-first: OpenAPI spec → codegen → React Query hooks + Zod validators. Never hand-write types that codegen produces.
- Auth is self-contained: `POST /api/auth/login` verifies the bcrypt hash and establishes an httpOnly session cookie (`sid`); `POST /api/auth/logout` destroys it. `requireAuth` middleware checks `req.session.userId`; `requireAdmin` additionally checks role in `app_users` table. The session store table (`session`) is managed via the Drizzle schema (`createTableIfMissing: false`) so it survives the esbuild Docker bundle.
- `app_users.clerk_id` is the primary key, repurposed as an opaque internal user id (kept its name to avoid contract/codegen churn); new users get a server-generated `usr_<uuid>`. `password_hash` is nullable — users without a hash cannot log in. Email uniqueness is enforced case-insensitively by a DB unique index on `lower(email)` (Postgres error 23505 → 409); the create handler also pre-checks and maps the violation.
- Photo uploads stored on disk under `artifacts/api-server/uploads/` as base64-decoded JPEGs. Served via `/api/photos/:filename`.
- Badge IDs are generated server-side as `GMS-XXXXXX` hex strings on check-in.
- Audit log is append-only; every check-in, checkout, pre-registration, watchlist change, and role change is recorded.

## Product

- **Guest Check-In**: Form with name, company, contact info, host, purpose, studios (checkboxes), expected departure. Site is fixed per deployment. Optional webcam photo. Auto-generates badge. Live watchlist check on name entry — blocks entry for blocked guests, warns for flagged guests. On success, shows a printable **3in × 2in landscape visitor badge** (photo/initials, name, company, host, purpose, studios, badge ID, in/out times) via the shared `VisitorBadge` component; "Print Badge" triggers `printBadge()`.
- **Guest Check-Out**: Quick search by name or badge ID, one-click checkout with auto-timestamp.
- **Active Dashboard**: Live table of on-site guests with overdue highlights, stats bar (active/today counts/overdue/expected), auto-refresh every 30s. Filter by host/company/site. Also shows a **Productions Today** panel — studio bookings scheduled for today, fetched from the external bookings API and proxied via `GET /api/productions/today` (server filters to bookings overlapping today's UTC window, sorted by start time). Configurable via `BOOKINGS_API_URL`.
- **Pre-Registration**: Hosts pre-register expected guests; security sees "Expected Today" queue. "Check In" opens a convert dialog with optional webcam photo capture, then converts the pre-reg to an active check-in (`POST /preregistrations/{id}/convert` accepts an optional `{ photoUrl }`) and shows the same printable `VisitorBadge` with a Print button.
- **Public Pre-Registration**: Unauthenticated `/preregister` page — visitors self-register (name/company/contact/host/purpose/studios/expected arrival). Submissions land in the same "Expected Today" queue with `createdByClerkId=null`, operator recorded as "Self-registration". No Layout/auth wrapper. Client-brandable via `VITE_CLIENT_NAME` / `VITE_CLIENT_LOGO` (logo + label on both the form header and the success screen) so the visitor-facing page carries the client's brand, not FrontDesk's.
- **Studios**: Admin-managed list of rooms/buildings (`/studios` page). Multi-selectable via checkboxes on check-in and both pre-reg forms (internal + public). Stored as a `text[]` on guests and preregistrations; copied through on convert. `GET /studios` is public (needed by the public form); `POST`/`DELETE` are admin-only. Displayed in dashboard + prereg tables (replacing the now-static Site column).
- **Email Alerts**: Admin-configurable email notifications for four visitor events — pre-registration created, check-in, check-out, and overdue. Admins manage recipient addresses per event type on the `/alerts` page (admin-only nav). Alerts send via SendGrid (`SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL`); when unconfigured the page shows a "not configured" banner and no emails are sent. Event triggers are fire-and-forget (`void sendVisitorAlert(...)`) so they never block or fail a check-in/out. Overdue alerts are emitted by a 60s background scheduler (`src/lib/overdue-scheduler.ts`) that finds active guests past `expectedDeparture` with no `overdueAlertSentAt`, and only stamps `overdueAlertSentAt` **after** a confirmed send so a transient email failure retries on the next tick (one overdue email per guest). Endpoints: `GET/POST /alert-recipients`, `DELETE /alert-recipients/{id}`, `GET /alert-status` (all admin-only).
- **Known Guests**: Automatic returning-visitor directory (`/known-guests` page, any operator). Every check-in (direct or pre-reg convert) atomically upserts a `known_guests` profile keyed case-insensitively on name (`INSERT ... ON CONFLICT (lower(name)) DO UPDATE`, new non-null fields win, fire-and-forget so it never blocks check-in — `src/lib/known-guests.ts`). Page shows search, VIP filter, visit count + last visit (LEFT JOIN + GROUP BY over guests by lower(name)), per-guest visit-history dialog, star toggle to mark VIP (audited as `known_guest_vip`), and a quick "Check In" that pre-fills the check-in form via sessionStorage `checkin-prefill`. The check-in form's name field shows a typeahead of known guests (≥2 chars) that pre-fills company/phone/email/photo; VIPs show a gold star. Endpoints: `GET /known-guests` (q, vip), `PATCH /known-guests/{id}` (isVip), `GET /known-guests/{id}/visits` — all requireAuth (any operator).
- **Watchlist**: Admin-managed blocklist/flaglist. Name-match check on every check-in.
- **Audit Log**: Immutable record of all events with CSV export for date ranges.
- **Roles**: security (check in/out, dashboard) and admin (watchlist, audit, user management). Admins create operators (security or admin) from the Users page with an email + initial password, and can reset any operator's password. Watchlist and audit API endpoints are admin-only; `/watchlist/check` stays open to any authenticated operator because the check-in form uses it.
- **Site**: single static location per deployment via `VITE_SITE_NAME` (no in-app selector).

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `lib/api-spec/openapi.yaml` before writing route handlers or frontend hooks.
- `pnpm --filter @workspace/db run push` may need `push-force` if there are column conflicts.
- `express-session` (with `connect-pg-simple`) must be mounted BEFORE the routes in app.ts so `req.session` is populated; the session store reuses the shared pg `pool`.
- `requireAdmin` makes a DB query; don't call it in hot paths.
- Photo uploads have a 10MB body limit set in express.json({ limit: '10mb' }).
- `artifacts/api-server/uploads/` holds runtime visitor photos (PII) and is gitignored — never commit its contents. The dir is auto-created at runtime by `src/lib/badge.ts`.
- Badge printing: the badge card carries `id="print-badge"`; `printBadge()` (in `src/lib/print-badge.ts`) clones it into a `#print-root` child of `<body>` and toggles `body.printing-badge`, which the `@media print` block in `index.css` isolates and sizes to 3in × 2in. Do NOT rely on plain `window.print()` for badges inside a Radix dialog — the portal/transform breaks positioning.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Auth is fully self-contained in this repo (`src/lib/auth.ts`, `src/routes/auth.ts`, `src/lib/auth.tsx`); no external auth-provider skill applies
