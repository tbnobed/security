---
name: Seeding Clerk users (Replit-managed Clerk)
description: How to programmatically create/seed a Clerk user (e.g. an admin) when Clerk is Replit-managed, and the sandbox secret-redaction gotcha.
---

Replit-managed Clerk users CAN be created programmatically — you do not need the external Clerk dashboard. Use Clerk's Backend API (`https://api.clerk.com/v1/users`) with `CLERK_SECRET_KEY` as `Authorization: Bearer`. Then link the returned Clerk user id into the app's own users table (this app: `app_users`, with `role`).

**Why:** An earlier assumption that seeding required manual dashboard/Auth-pane steps was wrong; the secret key present in the environment is a full Backend API key.

**How to apply:**
- The `code_execution` sandbox REDACTS secret values — `viewEnvVars().secrets.CLERK_SECRET_KEY` is not the real key and `process.env` is undefined there. Do the API call from a Node script run via the **bash tool**, where `process.env.CLERK_SECRET_KEY` is the real value.
- Create user with `email_address: [..]`, `password`, `skip_password_checks: true` (bypasses complexity/breach checks for a seeded account).
- To reset an existing seeded user's password: `PATCH /v1/users/:id` with `{ password, skip_password_checks: true }`.
- ESM ignores `NODE_PATH`. To load `pg` (declared in `lib/db`) from a standalone `.mjs`, use `createRequire(resolve(cwd,"lib/db/package.json"))` then `require("pg")`. A reusable seed lives at `scripts/src/seed-admin.mjs` (honors `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`).
