---
name: Drizzle SQL pitfalls
description: Non-obvious Drizzle ORM query-building behaviors that produce wrong SQL silently
---

# Correlated subqueries in select fields silently break

Putting a correlated subquery in a `db.select({...})` field via `sql\`(SELECT ... WHERE outer.col = inner.col)\`` produced uncorrelated results — every row got the same aggregate (count/max over ALL rows), with no error.

**Why:** Drizzle's column interpolation inside raw `sql` select fields did not qualify the outer-table reference correctly, so the correlation predicate compared a column to itself.

**How to apply:** For per-row aggregates over a related table, use `.leftJoin(...)` + `.groupBy(outerTable.id)` with `count()`/`max()` select fields instead of correlated subqueries. Always sanity-check aggregate output against a raw psql query — this failure mode is silent.

# Atomic upserts on expression unique indexes

`ON CONFLICT (lower(name)) DO UPDATE` works with a `uniqueIndex` on `lower(name)`, but Drizzle's `.onConflictDoUpdate` target doesn't take expression indexes cleanly — use `db.execute(sql\`INSERT ... ON CONFLICT (lower(name)) DO UPDATE SET col = COALESCE(EXCLUDED.col, table.col)\`)` for atomic merge-upserts. Never use select-then-insert for upserts that can race (concurrent requests lose data silently when the losing insert's error is swallowed).
