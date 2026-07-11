#!/usr/bin/env node
// FrontDesk access-control bridge.
//
// Runs on the LAN next to the Maxxess (eFusion) server, reads current
// building occupancy + recent door events, and pushes them OUTBOUND over
// HTTPS to the FrontDesk server. Maxxess never needs to be reachable from
// the internet.
//
// Zero dependencies — requires Node 18+ (built-in fetch).
//
// Config (env vars, see .env.example):
//   FRONTDESK_URL          e.g. https://sec.obtv.io
//   BRIDGE_TOKEN           must match MAXXESS_BRIDGE_TOKEN on the FrontDesk server
//   POLL_INTERVAL_SECONDS  default 60
//   SOURCE                 "mock" (test data) or "efusion" (adapt the adapter below)

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
 * Maxxess eFusion adapter — TEMPLATE.
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

const sources = { mock: readMock, efusion: readEfusion };
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
