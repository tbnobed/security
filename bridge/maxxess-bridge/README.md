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
   node index.mjs          # requires Node 18+, no npm install needed
   ```

   Or with Docker:

   ```sh
   docker build -t frontdesk-bridge .
   docker run -d --restart unless-stopped --env-file .env frontdesk-bridge
   ```

3. Start with `SOURCE=mock` to verify the connection end-to-end (you'll see
   test cardholders appear on FrontDesk's Building page), then switch to
   `SOURCE=efusion`.

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
