#!/usr/bin/env node
// FrontDesk access-control bridge.
//
// Runs on the LAN next to the Maxxess (eFusion) server, reads current
// building occupancy + recent door events, and pushes them OUTBOUND over
// HTTPS to the FrontDesk server. Maxxess never needs to be reachable from
// the internet.
//
// Requires Node 18+ (built-in fetch). SOURCE=mock needs no dependencies;
// SOURCE=efusion-sql needs `npm install` (the mssql package).
//
// Config (env vars, see .env.example):
//   FRONTDESK_URL          e.g. https://sec.obtv.io
//   BRIDGE_TOKEN           must match MAXXESS_BRIDGE_TOKEN on the FrontDesk server
//   POLL_INTERVAL_SECONDS  default 60
//   SOURCE                 "mock" (test data), "efusion-sql" (read the eFusion
//                          SQL Server database directly), or "efusion" (Web API
//                          template)

// Load .env from this folder if present (Docker's --env-file also works;
// real environment variables always win over .env values).
import { readFileSync } from "node:fs";
try {
  for (const line of readFileSync(new URL(".env", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch {
  // no .env — rely on exported env vars
}

const FRONTDESK_URL = (process.env.FRONTDESK_URL ?? "").replace(/\/+$/, "");
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN ?? "";
const POLL_INTERVAL_MS = Math.max(10, Number(process.env.POLL_INTERVAL_SECONDS) || 60) * 1000;
const SOURCE = process.env.SOURCE ?? "mock";

if (!FRONTDESK_URL || !BRIDGE_TOKEN) {
  console.error("FRONTDESK_URL and BRIDGE_TOKEN are required. See .env.example.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Source adapters. Each returns:
//   {
//     occupants: [{ cardholderName, cardNumber?, department?, location?, sinceAt? }],
//     events:    [{ externalId, cardholderName, cardNumber?, door, direction, occurredAt }],
//   }
// occupants = FULL snapshot of who is currently in the building.
// events    = door events since the last poll (FrontDesk dedupes on externalId,
//             so re-sending the same event is harmless).
// ---------------------------------------------------------------------------

/** Test source: fake cardholders + a door event per poll. */
async function readMock() {
  const now = new Date();
  const names = ["Alice Engineer", "Bob Producer", "Carol Director"];
  return {
    occupants: names.map((name, i) => ({
      cardholderName: name,
      cardNumber: `C-100${i}`,
      department: i === 0 ? "Engineering" : "Production",
      location: i % 2 === 0 ? "Main Entrance" : "Studio B Door",
      sinceAt: new Date(now.getTime() - (i + 1) * 3600_000).toISOString(),
    })),
    events: [
      {
        externalId: `mock-${now.toISOString()}`,
        cardholderName: names[Math.floor(Math.random() * names.length)],
        door: "Main Entrance",
        direction: Math.random() > 0.5 ? "in" : "out",
        occurredAt: now.toISOString(),
      },
    ],
  };
}

/**
 * Maxxess eFusion adapter — direct SQL Server read (SOURCE=efusion-sql).
 *
 * Reads the eFusion database (verified against eFusion 8.0 / database
 * "AXxess") using a read-only login — see SQL-SETUP.md. Uses two built-in
 * eFusion views:
 *   CardholderLocation       -> occupants snapshot (LastAreaName = where
 *                               anti-passback last saw the cardholder)
 *   CardholderTransactions_V -> door events (unique Id used for dedupe)
 *
 * Env:
 *   EFUSION_SQL_SERVER     hostname, e.g. CONTEGO3
 *   EFUSION_SQL_PORT       fixed TCP port (recommended, e.g. 1433) — OR —
 *   EFUSION_SQL_INSTANCE   named instance, e.g. MAXXESS (needs SQL Browser/UDP 1434)
 *   EFUSION_SQL_DATABASE   default AXxess
 *   EFUSION_SQL_USER       e.g. frontdesk_reader
 *   EFUSION_SQL_PASSWORD   its password
 *   EFUSION_SQL_ENCRYPT    "true" to require TLS (default false for LAN)
 *   EFUSION_SQL_USE_UTC    "true" only if the DB stores UTC datetimes; default
 *                          false = local wall time (run the bridge in the same
 *                          timezone as the SQL Server machine)
 *   EFUSION_SQL_OCCUPANTS_QUERY / EFUSION_SQL_EVENTS_QUERY
 *                          optional full SQL overrides (must keep the same
 *                          column aliases as the defaults below; the events
 *                          query must filter on @sinceId and ORDER BY Id ASC)
 */
let sqlPool = null;
let lastEventId = null; // watermark on CardholderTransactions_V.Id; seeded on first poll

async function getSqlPool() {
  if (sqlPool) return sqlPool;
  let mssql;
  try {
    mssql = (await import("mssql")).default;
  } catch {
    throw new Error("SOURCE=efusion-sql needs the mssql package — run `npm install` in the bridge folder.");
  }
  const server = process.env.EFUSION_SQL_SERVER;
  const user = process.env.EFUSION_SQL_USER;
  const password = process.env.EFUSION_SQL_PASSWORD;
  if (!server || !user || !password) {
    throw new Error("EFUSION_SQL_SERVER, EFUSION_SQL_USER and EFUSION_SQL_PASSWORD are required for SOURCE=efusion-sql.");
  }
  const port = process.env.EFUSION_SQL_PORT ? Number(process.env.EFUSION_SQL_PORT) : undefined;
  sqlPool = await mssql.connect({
    server,
    ...(port ? { port } : {}),
    database: process.env.EFUSION_SQL_DATABASE || "AXxess",
    user,
    password,
    options: {
      ...(port ? {} : { instanceName: process.env.EFUSION_SQL_INSTANCE || "MAXXESS" }),
      encrypt: process.env.EFUSION_SQL_ENCRYPT === "true",
      trustServerCertificate: true,
      readOnlyIntent: true,
      // eFusion stores datetimes as local wall time (no timezone). useUTC=false
      // makes the driver interpret them in THIS process's timezone — so run the
      // bridge with TZ matching the SQL Server machine (they're usually the same
      // box/LAN). Set EFUSION_SQL_USE_UTC=true only if your DB stores UTC.
      useUTC: process.env.EFUSION_SQL_USE_UTC === "true",
    },
    pool: { max: 2, min: 0 },
  });
  const pool = sqlPool;
  pool.on("error", () => {
    if (sqlPool === pool) sqlPool = null; // reconnect on next poll
    pool.close().catch(() => {});
  });
  return sqlPool;
}

// "In the building" = badge used since the start of today (server-local).
// Sites without badge-out readers never clear LastAreaName, so filtering on
// LastUse >= today is the practical who's-here list.
// CardholderLocation has one row per badge CARD, so cardholders with multiple
// cards appear multiple times — ROW_NUMBER keeps each person's latest use.
// "location" = the last DOOR the badge was used at (from the transactions
// view; area names are 'NONE' at sites without area config), falling back to
// LastAreaName where it exists. NULLIF hides placeholder 'NONE' values.
const DEFAULT_OCCUPANTS_QUERY = `
  WITH ranked AS (
    SELECT
      LTRIM(RTRIM(COALESCE([First], '') + ' ' + COALESCE([Last], ''))) AS fullName,
      [Badge] AS cardNumber,
      [Dept]  AS department,
      NULLIF(NULLIF(LTRIM(RTRIM(COALESCE([LastAreaName], ''))), ''), 'NONE') AS areaName,
      [LastUse] AS sinceAt,
      ROW_NUMBER() OVER (
        PARTITION BY LOWER(LTRIM(RTRIM(COALESCE([First], '') + ' ' + COALESCE([Last], ''))))
        ORDER BY [LastUse] DESC, [Badge] DESC
      ) AS rn
    FROM CardholderLocation
    WHERE [LastUse] >= CAST(GETDATE() AS date)
      AND LOWER(LTRIM(RTRIM(COALESCE([LastAreaName], '')))) NOT IN ('off site', 'offsite', 'outside', 'out')
  )
  SELECT TOP 5000
    r.fullName,
    r.cardNumber,
    r.department,
    COALESCE(NULLIF(LTRIM(RTRIM(COALESCE(t.door, ''))), ''), r.areaName) AS location,
    r.sinceAt
  FROM ranked r
  OUTER APPLY (
    SELECT TOP 1 [Location] AS door
    FROM CardholderTransactions_V
    WHERE [EventTime] >= CAST(GETDATE() AS date)
      AND LOWER(LTRIM(RTRIM(COALESCE([CardholderFirst], '') + ' ' + COALESCE([CardholderLast], '')))) = LOWER(r.fullName)
    ORDER BY [Id] DESC
  ) t
  WHERE r.rn = 1
  ORDER BY r.sinceAt DESC`;

// Events are fetched by Id watermark (oldest first) so a burst of >1000 events
// is drained across successive polls instead of silently dropping older rows.
const DEFAULT_EVENTS_QUERY = `
  SELECT TOP 1000
    [Id]        AS id,
    [EventTime] AS occurredAt,
    [Event]     AS eventName,
    [Location]  AS door,
    [Badge]     AS cardNumber,
    LTRIM(RTRIM(COALESCE([CardholderFirst], '') + ' ' + COALESCE([CardholderLast], ''))) AS fullName
  FROM CardholderTransactions_V
  WHERE [Id] > @sinceId
    AND COALESCE([Badge], '') <> ''
  ORDER BY [Id] ASC`;

// First poll only: start the watermark just before the oldest event of the
// last 24h, so we backfill a day of history and then stream forward.
const SEED_WATERMARK_QUERY = `
  SELECT COALESCE(MIN([Id]), (SELECT COALESCE(MAX([Id]), 0) FROM CardholderTransactions_V)) - 1 AS seedId
  FROM CardholderTransactions_V
  WHERE [EventTime] >= @since`;

function directionFromEvent(eventName) {
  const e = String(eventName ?? "").toLowerCase();
  if (/\bexit\b|\bout\b|egress/.test(e)) return "out";
  if (/\bentry\b|\bin\b|\benter\b|admit|grant/.test(e)) return "in";
  return "unknown";
}

async function readEfusionSql() {
  const pool = await getSqlPool();
  const mssql = (await import("mssql")).default;

  const occupantsQuery = process.env.EFUSION_SQL_OCCUPANTS_QUERY || DEFAULT_OCCUPANTS_QUERY;
  const eventsQuery = process.env.EFUSION_SQL_EVENTS_QUERY || DEFAULT_EVENTS_QUERY;

  if (lastEventId === null) {
    const since = new Date(Date.now() - 24 * 3600_000);
    const seedRes = await pool.request().input("since", mssql.DateTime, since).query(SEED_WATERMARK_QUERY);
    lastEventId = Number(seedRes.recordset[0]?.seedId ?? 0);
  }

  const [occRes, evRes] = await Promise.all([
    pool.request().query(occupantsQuery),
    pool.request().input("sinceId", mssql.BigInt, lastEventId).query(eventsQuery),
  ]);

  const occupants = occRes.recordset
    .filter((r) => (r.fullName ?? "").trim() !== "")
    .map((r) => ({
      cardholderName: r.fullName.trim(),
      cardNumber: r.cardNumber ? String(r.cardNumber) : undefined,
      department: r.department ? String(r.department).trim() : undefined,
      location: r.location ? String(r.location).trim() : undefined,
      sinceAt: r.sinceAt ? new Date(r.sinceAt).toISOString() : undefined,
    }));

  const events = evRes.recordset
    .filter((r) => (r.fullName ?? "").trim() !== "" && r.occurredAt)
    .map((r) => ({
      externalId: `ax-${r.id}`,
      cardholderName: r.fullName.trim(),
      cardNumber: r.cardNumber ? String(r.cardNumber) : undefined,
      door: r.door ? String(r.door).trim() : "Unknown door",
      direction: directionFromEvent(r.eventName),
      occurredAt: new Date(r.occurredAt).toISOString(),
    }));

  for (const r of evRes.recordset) {
    const id = Number(r.id);
    if (Number.isFinite(id) && id > lastEventId) lastEventId = id;
  }

  return { occupants, events };
}

/**
 * Maxxess eFusion Web API adapter — TEMPLATE.
 *
 * eFusion's integration surface varies by install (licensed API/SDK module,
 * Ambit, or direct SQL Server views). Fill in the two functions below for
 * your site; everything else (auth, retries, push protocol) is done for you.
 *
 * Env: EFUSION_BASE_URL, EFUSION_USERNAME, EFUSION_PASSWORD
 */
async function readEfusion() {
  const base = (process.env.EFUSION_BASE_URL ?? "").replace(/\/+$/, "");
  if (!base) throw new Error("EFUSION_BASE_URL is required for SOURCE=efusion");

  // TODO: adapt to your eFusion API module. Typical shape:
  //
  // const auth = "Basic " + Buffer.from(
  //   `${process.env.EFUSION_USERNAME}:${process.env.EFUSION_PASSWORD}`).toString("base64");
  //
  // 1) Who is in the building — most installs expose this as a muster /
  //    anti-passback "in-plant" report or cardholder-status query:
  // const inPlant = await (await fetch(`${base}/api/musterReport`, { headers: { Authorization: auth } })).json();
  //
  // 2) Recent access-granted events (poll since last event id / timestamp):
  // const events = await (await fetch(`${base}/api/events?since=...`, { headers: { Authorization: auth } })).json();
  //
  // Map both into the shapes documented above. Use the eFusion event id as
  // externalId so FrontDesk can dedupe.
  throw new Error(
    "SOURCE=efusion is a template — edit readEfusion() in index.mjs for your eFusion API module.",
  );
}

const sources = { mock: readMock, "efusion-sql": readEfusionSql, efusion: readEfusion };
const readSource = sources[SOURCE];
if (!readSource) {
  console.error(`Unknown SOURCE "${SOURCE}" (expected: ${Object.keys(sources).join(", ")})`);
  process.exit(1);
}

// ---------------------------------------------------------------------------

async function pushOnce() {
  const snapshot = await readSource();
  const res = await fetch(`${FRONTDESK_URL}/api/integrations/occupancy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BRIDGE_TOKEN}`,
    },
    body: JSON.stringify(snapshot),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`FrontDesk responded ${res.status}: ${body.slice(0, 300)}`);
  }
  const result = await res.json();
  console.log(
    `[${new Date().toISOString()}] pushed ${result.occupants} occupants, ${result.eventsAdded} new events`,
  );
}

console.log(
  `FrontDesk bridge starting: source=${SOURCE}, target=${FRONTDESK_URL}, every ${POLL_INTERVAL_MS / 1000}s`,
);

let stopped = false;
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => (stopped = true));

while (!stopped) {
  try {
    await pushOnce();
  } catch (err) {
    console.error(`[${new Date().toISOString()}] push failed: ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
}
console.log("Bridge stopped.");
