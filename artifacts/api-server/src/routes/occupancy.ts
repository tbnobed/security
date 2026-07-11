import { Router, type Request, type Response, type NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { desc, asc, lt, sql, eq } from "drizzle-orm";
import { db, buildingOccupancyTable, accessEventsTable, appSettingsTable } from "@workspace/db";
import {
  IngestOccupancyBody,
  IngestOccupancyResponse,
  GetOccupancyResponse,
  ListAccessEventsResponse,
} from "@workspace/api-zod";
import { requireOperator } from "../lib/auth";
import { logger } from "../lib/logger";

const router = Router();

const LAST_SYNC_KEY = "occupancy_last_sync_at";
const EVENT_RETENTION_MS = 72 * 60 * 60 * 1000;

// Bearer-token auth for the LAN bridge (outbound-only push — the access
// system is never reachable from the internet). Token lives in the
// MAXXESS_BRIDGE_TOKEN env var on both ends; unset = ingest disabled.
function requireBridgeToken(req: Request, res: Response, next: NextFunction): void {
  const configured = process.env.MAXXESS_BRIDGE_TOKEN;
  if (!configured) {
    res.status(503).json({ error: "Occupancy ingest is not configured on this server" });
    return;
  }
  const header = req.headers.authorization ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(presented);
  const b = Buffer.from(configured);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({ error: "Invalid bridge token" });
    return;
  }
  next();
}

router.post("/integrations/occupancy", requireBridgeToken, async (req, res): Promise<void> => {
  const parsed = IngestOccupancyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const now = new Date();
  const { occupants, events } = parsed.data;

  let eventsAdded = 0;
  await db.transaction(async (tx) => {
    // The occupants list is a full snapshot: replace wholesale.
    await tx.delete(buildingOccupancyTable);
    if (occupants.length > 0) {
      await tx.insert(buildingOccupancyTable).values(
        occupants.map((o) => ({
          cardholderName: o.cardholderName,
          cardNumber: o.cardNumber ?? null,
          department: o.department ?? null,
          location: o.location ?? null,
          sinceAt: o.sinceAt ? new Date(o.sinceAt) : null,
          receivedAt: now,
        })),
      );
    }

    if (events && events.length > 0) {
      const inserted = await tx
        .insert(accessEventsTable)
        .values(
          events.map((e) => ({
            externalId: e.externalId,
            cardholderName: e.cardholderName,
            cardNumber: e.cardNumber ?? null,
            door: e.door,
            direction: e.direction ?? "unknown",
            occurredAt: new Date(e.occurredAt),
            receivedAt: now,
          })),
        )
        .onConflictDoNothing({ target: accessEventsTable.externalId })
        .returning({ id: accessEventsTable.id });
      eventsAdded = inserted.length;
    }

    // Keep the events table bounded.
    await tx
      .delete(accessEventsTable)
      .where(lt(accessEventsTable.occurredAt, new Date(now.getTime() - EVENT_RETENTION_MS)));

    await tx
      .insert(appSettingsTable)
      .values({ key: LAST_SYNC_KEY, value: now.toISOString(), updatedAt: now })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: { value: now.toISOString(), updatedAt: now },
      });
  });

  req.log.info(
    { occupants: occupants.length, eventsAdded },
    "Occupancy snapshot received from bridge",
  );
  res.json(IngestOccupancyResponse.parse({ occupants: occupants.length, eventsAdded }));
});

router.get("/occupancy", requireOperator, async (_req, res): Promise<void> => {
  const [rows, [sync]] = await Promise.all([
    db
      .select()
      .from(buildingOccupancyTable)
      .orderBy(asc(sql`lower(${buildingOccupancyTable.cardholderName})`)),
    db.select().from(appSettingsTable).where(eq(appSettingsTable.key, LAST_SYNC_KEY)),
  ]);
  res.json(
    GetOccupancyResponse.parse({
      occupants: rows.map((r) => ({
        id: r.id,
        cardholderName: r.cardholderName,
        cardNumber: r.cardNumber,
        department: r.department,
        location: r.location,
        sinceAt: r.sinceAt ? r.sinceAt.toISOString() : null,
      })),
      lastSyncAt: sync?.value ?? null,
    }),
  );
});

router.get("/occupancy/events", requireOperator, async (req, res): Promise<void> => {
  const raw = Number(req.query.limit);
  const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 200) : 100;
  const rows = await db
    .select()
    .from(accessEventsTable)
    .orderBy(desc(accessEventsTable.occurredAt), desc(accessEventsTable.id))
    .limit(limit);
  res.json(
    ListAccessEventsResponse.parse({
      items: rows.map((r) => ({
        id: r.id,
        externalId: r.externalId,
        cardholderName: r.cardholderName,
        cardNumber: r.cardNumber,
        door: r.door,
        direction: r.direction,
        occurredAt: r.occurredAt.toISOString(),
      })),
    }),
  );
});

export default router;
