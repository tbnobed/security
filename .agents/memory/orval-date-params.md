---
name: Orval date query params
description: Why OpenAPI `format: date` breaks Orval zod validation for query params in this repo
---

# Orval + `format: date` query params

Rule: never use `format: date` (or `format: date-time`) on **query parameters** in `lib/api-spec/openapi.yaml`. Use `type: string` with a regex `pattern` (e.g. `'^\d{4}-\d{2}-\d{2}$'`) instead, then semantically validate in the route handler (reject 400 on impossible dates like 2026-99-99 before any SQL cast).

**Why:** Orval's zod output turns `format: date` into `zod.date()`, which expects a JS Date object — but Express query params are always strings, so every request fails validation with "Expected date, received string". Also, regex alone lets impossible dates through to Postgres `::date` casts, which throw and become 500s.

**How to apply:** When adding date-filtered endpoints: pattern-validate in the spec, parse to a real `Date` in the handler (round-trip check `toISOString().slice(0,10) === value`), and pass Date objects to Drizzle comparisons instead of raw `::date` SQL casts.
