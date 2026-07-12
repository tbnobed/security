# FrontDesk Maxxess Bridge

Small utility that runs on the LAN next to your Maxxess (eFusion) server,
reads current building occupancy + door events, and pushes them **outbound**
to your FrontDesk server. Maxxess is never exposed to the internet.

FrontDesk shows the data on the **Building** page and merges cardholders into
the **Emergency Evacuation** roster.

## Setup

1. On the FrontDesk server, set `MAXXESS_BRIDGE_TOKEN` on the `api` service
   (add it to your `.env` used by docker-compose) and restart:
   `openssl rand -hex 32` makes a good token.
2. On the machine that can reach Maxxess, copy this folder, then:

   ```sh
   cp .env.example .env    # fill in FRONTDESK_URL + BRIDGE_TOKEN
   npm install             # only needed for SOURCE=efusion-sql (mssql driver)
   node index.mjs          # requires Node 18+
   ```

   Or with Docker:

   ```sh
   docker build -t frontdesk-bridge .
   docker run -d --restart unless-stopped --env-file .env frontdesk-bridge
   ```

3. Start with `SOURCE=mock` to verify the connection end-to-end (you'll see
   test cardholders appear on FrontDesk's Building page), then switch to
   `SOURCE=efusion-sql`.

## Run as a service (systemd)

A ready-made unit file is included (`frontdesk-bridge.service`). It assumes
the repo lives at `/home/obtv-admin/security` and runs as `obtv-admin` — edit
`User=` and the paths if yours differ (`which node` shows your Node path).

```sh
sudo cp frontdesk-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now frontdesk-bridge
```

The bridge loads `.env` from its working directory, so no extra env setup is
needed. Useful commands:

```sh
systemctl status frontdesk-bridge          # is it running?
journalctl -u frontdesk-bridge -f          # follow live logs
sudo systemctl restart frontdesk-bridge    # after a git pull
```

It starts on boot and auto-restarts 10s after any crash.

## SOURCE=efusion-sql — direct database read (recommended for this site)

This is the working adapter for the Trinity/CONTEGO3 install (eFusion 8.0,
database `AXxess`, no Web API license). One-time server setup — read-only
SQL login, TCP/IP, firewall — is in **SQL-SETUP.md**.

It polls two views eFusion maintains itself:

- `CardholderLocation` → the occupants snapshot. A cardholder counts as
  "in the building" when their badge was used **today** (`LastUse` since
  midnight, SQL-server-local) and `LastAreaName` isn't an obvious "off site"
  area name. Sites without badge-out readers never clear `LastAreaName`, so
  the badged-today filter is what keeps this a real who's-here list.
- `CardholderTransactions_V` → door events (badge transactions with a unique
  `Id`, used as the dedupe key; direction is inferred from the event text).

Events are streamed by an `Id` watermark (oldest first, 1000 per poll), so a
burst of activity is drained across polls rather than dropped; on first start
the bridge backfills the last 24 hours. Timestamps: eFusion stores local wall
time, so run the bridge in the same timezone as the SQL Server machine (set
`EFUSION_SQL_USE_UTC=true` only if your DB stores UTC).

If either default query needs site-specific tuning (e.g. your area names for
"outside", or filtering certain event types), you can override them wholesale
via `EFUSION_SQL_OCCUPANTS_QUERY` / `EFUSION_SQL_EVENTS_QUERY` — keep the same
column aliases as the defaults in `index.mjs`; the events override must filter
on `@sinceId` and `ORDER BY Id ASC`.

Note on occupancy accuracy: `LastAreaName` only clears/changes when badges are
used on readers configured as area entry/exit (anti-passback). If your site
doesn't badge OUT, the occupant list will show "last seen inside" rather than
a strict who's-in list — the Building page's timestamps make that visible. The
door-event feed is accurate regardless.

## What we know about eFusion's integration surface (researched July 2026)

- **eFusion Web API** — a separately licensed optional module (not part of the
  base install; shows up under Service Manager → Setup → Integrators once
  installed). This is what commercial integrations (e.g. Telaeris XPressEntry
  mustering) use to pull cardholder data and door activities. The API docs are
  distributed by Maxxess/dealers, not published publicly.
- **SMSWeb / MX+** ("SMSWeb: Yes" in the license) is the *browser client* (web
  UI with dashboards, cardholders, reports) served by the SMS Web Server — it
  is not the same thing as the Web API license.
- **Occupancy source**: eFusion tracks "who is in" via anti-passback areas and
  its Muster Report (list of all cardholders currently inside defined areas).
  That muster/in-plant data is what this bridge's `occupants` snapshot maps to.
- **This site's installed integrators** (verified from Service Manager, July
  2026): Archive-Backup, CardStartStop, EfficientImage, eMobile,
  ExecuteProcedure, Kentec, SIA, SIA_DC07, SMSWebInterface, Texacom Premier.
  No Web API and no ExternalReaderOffline — the Web API module is NOT
  installed here. SIA/SIA_DC07 receive alarms INTO eFusion (not an outbound
  feed); SMSWebInterface just serves the MX+ web UI; ExecuteProcedure calls a
  SQL stored procedure on transaction events (confirms SQL-level integration
  is a supported pattern on this install).
- **Database fallback**: eFusion stores everything in Microsoft SQL Server
  (instance typically `COMPUTERNAME\MAXXESS`). All access events land in the
  transaction log tables (event time, facility-card number, event type), and
  SQL scripts against the DB are supported. A read-only SQL login is a viable
  no-extra-license path; the adapter would use a SQL client instead of fetch.

## Connecting to Maxxess eFusion

`SOURCE=efusion` is a template: eFusion's integration surface varies by
install, so edit `readEfusion()` in `index.mjs` to match yours. To find out
what you have licensed, in the eFusion admin client check **Help → About /
License** (look for API / SDK / web-service options), or ask your Maxxess
dealer/integrator whether the **eFusion API module** is enabled — they can
also provide the API documentation for the endpoints to call. If the API is
not licensed, the usual alternatives are a read-only SQL Server login to the
eFusion database or a scheduled report export; the adapter can be rewritten
around either (only `readEfusion()` needs to change).

What FrontDesk needs from the adapter:

- **occupants** — full snapshot of everyone currently in the building
  (eFusion's muster / anti-passback "in-plant" data): name, and optionally
  card number, department, last reader, entry time.
- **events** — access-granted events since the last poll: a unique event id
  (dedupe key), name, door, direction (in/out), timestamp.

If the bridge stops pushing, FrontDesk shows a "data is stale" warning rather
than silently displaying old data.
