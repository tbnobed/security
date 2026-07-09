---
name: Orval date formats (query params AND bodies)
description: Why OpenAPI `format: date`/`date-time` breaks Orval zod validation for query params and request bodies in this repo
---

# Orval + `format: date`/`date-time`

Rule: never use `format: date` or `format: date-time` on **query parameters** OR on **request-body fields the server sets/parses as ISO strings** in `lib/api-spec/openapi.yaml`. Use `type: string` with a regex `pattern` (query params) or a plain `type: string` + maxLength (body fields like server-stamped timestamps), then semantically validate in the route handler where needed (reject 400 on impossible dates like 2026-99-99 before any SQL cast).

**Why:** Orval's zod output turns both formats into `zod.date()`, which expects a JS Date object — but Express query params and JSON body/response values are always strings, so validation fails with "Expected date, received string" (hit again when a server-stamped `receivedAt: format: date-time` field made `Body.parse` reject `new Date().toISOString()`). Also, regex alone lets impossible dates through to Postgres `::date` casts, which throw and become 500s.

**How to apply:** When adding date-filtered endpoints: pattern-validate in the spec, parse to a real `Date` in the handler (round-trip check `toISOString().slice(0,10) === value`), and pass Date objects to Drizzle comparisons instead of raw `::date` SQL casts.
