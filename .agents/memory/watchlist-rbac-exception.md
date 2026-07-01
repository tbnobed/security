---
name: Watchlist/audit RBAC exception
description: Which security-desk endpoints are admin-only vs. open to all operators, and the one easy-to-break exception.
---

Watchlist management (list/create/delete) and the entire audit log/export are admin-only (`requireAdmin`).

**Exception:** `GET /watchlist/check` must stay `requireAuth` (any authenticated operator). The guest check-in form calls it live as the operator types a name, and most operators are the non-admin "security" role. Locking it to admin silently breaks check-in for security staff.

**Why:** RBAC hardening naturally sweeps every `/watchlist*` route to admin; the check endpoint looks like a watchlist route but is actually part of the check-in flow.

**How to apply:** When tightening role guards on a route group, separate *management* endpoints from *read/validate* endpoints that a lower-privilege primary workflow depends on.
