---
name: Audit eventType enum is strict
description: New audit event types must be added to the OpenAPI AuditEntry enum or GET /api/audit 500s
---

Rule: any new value written to `audit.eventType` MUST also be added to the
`AuditEntry.eventType` enum in `lib/api-spec/openapi.yaml`, then regenerate codegen.

**Why:** the audit-log list endpoint (`GET /api/audit`) validates its response with the
generated Zod `ListAuditLogResponseItem`, whose `eventType` is a strict `zod.enum([...])`.
A row with an unlisted eventType makes the whole response fail parsing and the endpoint
returns 500 — but only *after* such a row exists, so it slips through typecheck/tests.
(The dashboard's `GetRecentActivityResponseItem.eventType` is a lenient `zod.string()`, so
it will NOT surface the problem.) A latent case of this already existed for `known_guest_vip`.

**How to apply:** whenever you add a `db.insert(auditTable).values({ eventType: "..." })`
with a new string, grep the enum in openapi.yaml and add it before shipping.
