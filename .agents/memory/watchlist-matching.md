---
name: Watchlist name matching direction
description: Substring direction pitfall in watchlist checks; kiosk uses bidirectional match, operator check-in does not
---

The rule: a watchlist name check must match in **both** directions — `watchlist.name ILIKE '%'||guest||'%' OR guest ILIKE '%'||watchlist.name||'%'` — otherwise a watchlist entry "John" never matches guest "John Doe".

**Why:** The original one-directional `ilike(watchlist.name, '%'+guestName+'%')` only fires when the watchlist entry *contains* the full guest name. An architect review flagged this as a security bypass for the unattended kiosk self check-in, where no human sees a warning.

**How to apply:** The kiosk check-in uses the bidirectional SQL match and halts on ANY match (block or flag) with a generic message. The operator check-in flow (`POST /guests` and `/watchlist/check`) still uses the legacy one-directional match — it is interactive so an operator can catch misses, but if watchlist matching is ever revisited, unify on the bidirectional semantics. Also: unattended conversion endpoints must claim the prereg atomically (conditional UPDATE on status inside a transaction) to prevent double-conversion.
