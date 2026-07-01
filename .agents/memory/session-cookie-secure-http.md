---
name: Session cookie Secure flag vs plain-HTTP deploys
description: Why the session cookie `secure` flag is env-driven (SESSION_COOKIE_SECURE), not tied to NODE_ENV
---

The session cookie `secure` flag must NOT be tied to `NODE_ENV === "production"`.

**Why:** This app self-hosts via Docker and is commonly served over plain HTTP on a
LAN/IP (no TLS). A `Secure` cookie is never sent by the browser over HTTP, so login
"succeeds" server-side but the browser drops the `sid` cookie and every subsequent
request is unauthenticated — login silently fails with no error. Tying `secure` to
production made the default production deploy unusable over HTTP.

**How to apply:** `secure` is driven by `SESSION_COOKIE_SECURE === "true"` (default
`false`). Keep it `false` for HTTP LAN installs; set `true` only when TLS terminates
in front of the app (HTTPS / reverse proxy). If a user reports "login does nothing /
kicks me back to the login page" on a self-hosted install, check whether they set
`SESSION_COOKIE_SECURE=true` without actually serving HTTPS.
