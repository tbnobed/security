# Studio Guest Management System

A web-based guest management system for broadcast studio security desks — check guests in/out, manage pre-registrations, watchlists, and audit logs.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/studio-gms run dev` — run the frontend (port 19603)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-provisioned)
- Required env: `SESSION_SECRET` — secret used to sign session cookies (must be set; server refuses to start without it)
- Seed the fixed admin: `node scripts/src/seed-admin.mjs` (defaults to `admin@studiogms.com` / `StudioAdmin!2026`; override with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`)

## Deployment target

- **Self-hosted**: must run as a Docker container on the user's own Ubuntu server (not Replit Deployments). Keep everything container-friendly: bind to `PORT`, no Replit-only runtime assumptions, all config via env vars. Auth is fully self-contained (username/password + Postgres-backed sessions) — no outbound internet or third-party auth service required. Only `DATABASE_URL` and `SESSION_SECRET` are needed.

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

## Architecture decisions

- Contract-first: OpenAPI spec → codegen → React Query hooks + Zod validators. Never hand-write types that codegen produces.
- Auth is self-contained: `POST /api/auth/login` verifies the bcrypt hash and establishes an httpOnly session cookie (`sid`); `POST /api/auth/logout` destroys it. `requireAuth` middleware checks `req.session.userId`; `requireAdmin` additionally checks role in `app_users` table. The session store table (`session`) is managed via the Drizzle schema (`createTableIfMissing: false`) so it survives the esbuild Docker bundle.
- `app_users.clerk_id` is the primary key, repurposed as an opaque internal user id (kept its name to avoid contract/codegen churn); new users get a server-generated `usr_<uuid>`. `password_hash` is nullable — users without a hash cannot log in. Email uniqueness is enforced case-insensitively by a DB unique index on `lower(email)` (Postgres error 23505 → 409); the create handler also pre-checks and maps the violation.
- Photo uploads stored on disk under `artifacts/api-server/uploads/` as base64-decoded JPEGs. Served via `/api/photos/:filename`.
- Badge IDs are generated server-side as `GMS-XXXXXX` hex strings on check-in.
- Audit log is append-only; every check-in, checkout, pre-registration, watchlist change, and role change is recorded.

## Product

- **Guest Check-In**: Form with name, company, contact info, host, purpose, site, expected departure. Optional webcam photo. Auto-generates badge. Live watchlist check on name entry — blocks entry for blocked guests, warns for flagged guests.
- **Guest Check-Out**: Quick search by name or badge ID, one-click checkout with auto-timestamp.
- **Active Dashboard**: Live table of on-site guests with overdue highlights, stats bar (active/today counts/overdue/expected), auto-refresh every 30s. Filter by host/company/site.
- **Pre-Registration**: Hosts pre-register expected guests; security sees "Expected Today" queue; one-click convert to check-in.
- **Watchlist**: Admin-managed blocklist/flaglist. Name-match check on every check-in.
- **Audit Log**: Immutable record of all events with CSV export for date ranges.
- **Roles**: security (check in/out, dashboard) and admin (watchlist, audit, user management). Admins create operators (security or admin) from the Users page with an email + initial password, and can reset any operator's password. Watchlist and audit API endpoints are admin-only; `/watchlist/check` stays open to any authenticated operator because the check-in form uses it.
- **Sites**: Dallas/The Plex, Tustin, Nashville.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `lib/api-spec/openapi.yaml` before writing route handlers or frontend hooks.
- `pnpm --filter @workspace/db run push` may need `push-force` if there are column conflicts.
- `express-session` (with `connect-pg-simple`) must be mounted BEFORE the routes in app.ts so `req.session` is populated; the session store reuses the shared pg `pool`.
- `requireAdmin` makes a DB query; don't call it in hot paths.
- Photo uploads have a 10MB body limit set in express.json({ limit: '10mb' }).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Auth is fully self-contained in this repo (`src/lib/auth.ts`, `src/routes/auth.ts`, `src/lib/auth.tsx`); no external auth-provider skill applies
