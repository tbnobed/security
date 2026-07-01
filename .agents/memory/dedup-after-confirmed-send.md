---
name: Dedup alerts only after confirmed send
description: Why the overdue-alert scheduler stamps its dedup column after a successful send, not before.
---

Background schedulers/notifiers that dedupe via a "sentAt" column must set that
column **after** the send is confirmed successful, never before.

**Why:** Marking before the send means a transient provider failure (SendGrid
down, network blip) permanently drops the alert — the row is already stamped so
the next tick's `WHERE sentAt IS NULL` filter skips it forever. Stamping only on
confirmed success lets the next tick retry until it lands.

**How to apply:** The sender helper (`sendVisitorAlert`) returns a boolean that
is true only when the provider accepted the message; the scheduler updates
`overdueAlertSentAt` only when that is true. Repeated failures simply retry every
tick (acceptable for still-on-site overdue guests). This is safe for a
single-container deployment because the in-process `running` flag prevents
overlapping sweeps; a multi-instance deployment would additionally need an atomic
claim (`UPDATE ... WHERE id=? AND sentAt IS NULL RETURNING`) before sending.
