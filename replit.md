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
- Required env: `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` — auto-provisioned by Clerk setup

## Deployment target

- **Self-hosted**: must run as a Docker container on the user's own Ubuntu server (not Replit Deployments). Keep everything container-friendly: bind to `PORT`, no Replit-only runtime assumptions, all config via env vars. Clerk still works self-hosted as long as the container has outbound internet and the `CLERK_*` / `VITE_CLERK_PUBLISHABLE_KEY` env vars are provided.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind v4 + shadcn/ui, Wouter routing
- API: Express 5 + Clerk auth
- DB: PostgreSQL + Drizzle ORM
- Auth: Clerk (Replit-managed)
- Validation: Zod (zod/v4), drizzle-zod
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/db/src/schema/` — Drizzle table definitions (guests, users, preregistrations, watchlist, audit)
- `artifacts/api-server/src/routes/` — Express route handlers (guests, checkout, watchlist, audit, users, dashboard, photos)
- `artifacts/api-server/src/lib/auth.ts` — requireAuth / requireAdmin middleware
- `artifacts/studio-gms/src/` — React frontend (pages, components, Clerk wiring)

## Architecture decisions

- Contract-first: OpenAPI spec → codegen → React Query hooks + Zod validators. Never hand-write types that codegen produces.
- Auth is Clerk-managed: session cookies on web (no Bearer token needed). `requireAuth` middleware checks Clerk session; `requireAdmin` additionally checks role in `app_users` table.
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
- **Roles**: security (check in/out, dashboard) and admin (watchlist, audit, user management).
- **Sites**: Dallas/The Plex, Tustin, Nashville.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `lib/api-spec/openapi.yaml` before writing route handlers or frontend hooks.
- `pnpm --filter @workspace/db run push` may need `push-force` if there are column conflicts.
- The Clerk proxy middleware must be mounted BEFORE body parsers in app.ts (it streams raw bytes).
- `requireAdmin` makes a DB query; don't call it in hot paths.
- Photo uploads have a 10MB body limit set in express.json({ limit: '10mb' }).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `clerk-auth` skill for auth setup, troubleshooting, and customization
