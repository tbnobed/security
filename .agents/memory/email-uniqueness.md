---
name: Case-insensitive email uniqueness
description: How user email uniqueness is enforced when login is by email and app-level checks aren't enough.
---

Login looks users up by `lower(email)`, so email must be unique case-insensitively.

**Rule:** Enforce it at the database with a unique index on `lower(email)` (Drizzle `uniqueIndex(...).on(sql\`lower(${table.email})\`)`), not just an app-level SELECT-then-INSERT. NULL emails stay distinct, which is fine because only emailed accounts can sign in.

**Why:** A pre-insert existence check races under concurrency — two parallel creates both pass the check and insert duplicates, producing ambiguous login identity (nondeterministic role/password selection).

**How to apply:** Keep the friendly app-level pre-check for a clean 409, AND catch the Postgres unique-violation (`err.code === "23505"`) on insert and map it to 409 so the race is handled safely.
