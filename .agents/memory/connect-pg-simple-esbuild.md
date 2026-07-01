---
name: connect-pg-simple + esbuild bundle
description: Why the express-session Postgres store table must be schema-managed, not auto-created, when the server ships as an esbuild bundle.
---

When the API server is bundled with esbuild (CJS) for a self-hosted Docker deploy, `connect-pg-simple`'s default `createTableIfMissing: true` fails at runtime with ENOENT on `dist/table.sql` — the library reads its SQL file relative to its own source path, which does not exist inside the bundle.

**Rule:** Define the `session` store table in the Drizzle schema and set `createTableIfMissing: false`. Push it like any other table.

**Why:** The bundle flattens the dependency tree, so runtime file reads inside dependencies break. Owning the table in our schema also keeps it in migrations/`push` and survives the container build.

**How to apply:** Any esbuild-bundled server using a session/queue lib that lazily reads packaged `.sql`/asset files — pre-create the table/asset via our own schema/migrations instead of relying on the lib's runtime auto-create.
