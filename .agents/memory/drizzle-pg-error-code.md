---
name: Drizzle wraps pg error codes
description: Where to read the Postgres SQLSTATE (e.g. 23505) when catching a failed Drizzle query.
---

When a Drizzle query fails, the thrown error is a Drizzle wrapper, not the raw pg error. The Postgres `code` (e.g. `23505` unique violation) is often NOT on `err.code` — it lives on `err.cause.code`. Reading only `err.code` silently misses it and the handler falls through to a 500.

**Why:** A studios create handler mapped `err.code === "23505"` to 409, but duplicates returned 500 because the code was nested under `err.cause`.

**How to apply:** When mapping SQLSTATE from a caught Drizzle error, check both:
`const code = (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;`
Better yet, pair it with a case-insensitive pre-check (SELECT on `lower(name)`) plus the DB unique index, so the 23505 path is only a fallback. This is the same belt-and-suspenders pattern used for email uniqueness.
