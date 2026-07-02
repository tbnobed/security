import { Router } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { db, knownGuestsTable, guestsTable, auditTable } from "@workspace/db";
import {
  ListKnownGuestsQueryParams,
  ListKnownGuestsResponse,
  UpdateKnownGuestParams,
  UpdateKnownGuestBody,
  UpdateKnownGuestResponse,
  ListKnownGuestVisitsParams,
  ListKnownGuestVisitsResponse,
} from "@workspace/api-zod";
import { requireAuth, getSessionUserId } from "../lib/auth";
import { toGuestResponse } from "./guests";

const router = Router();

const visitStats = {
  visitCount: sql<number>`count(${guestsTable.id})::int`,
  lastVisitAt: sql<string | null>`max(${guestsTable.checkinAt})`,
};

function knownGuestStatsQuery() {
  return db
    .select({ kg: knownGuestsTable, ...visitStats })
    .from(knownGuestsTable)
    .leftJoin(guestsTable, sql`lower(${guestsTable.name}) = lower(${knownGuestsTable.name})`)
    .groupBy(knownGuestsTable.id);
}

function toKnownGuestResponse(row: {
  kg: typeof knownGuestsTable.$inferSelect;
  visitCount: number;
  lastVisitAt: string | Date | null;
}) {
  return {
    id: row.kg.id,
    name: row.kg.name,
    company: row.kg.company ?? null,
    phone: row.kg.phone ?? null,
    email: row.kg.email ?? null,
    photoUrl: row.kg.photoUrl ?? null,
    isVip: row.kg.isVip,
    visitCount: row.visitCount,
    lastVisitAt: row.lastVisitAt ? new Date(row.lastVisitAt).toISOString() : null,
    createdAt: row.kg.createdAt.toISOString(),
  };
}

router.get("/known-guests", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListKnownGuestsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { q, vip } = parsed.data;

  const conditions = [];
  if (q && q.trim()) {
    const pattern = `%${q.trim()}%`;
    conditions.push(
      sql`(${knownGuestsTable.name} ILIKE ${pattern} OR ${knownGuestsTable.company} ILIKE ${pattern})`,
    );
  }
  if (vip === true) {
    conditions.push(eq(knownGuestsTable.isVip, true));
  }

  const rows = await knownGuestStatsQuery()
    .where(conditions.length > 0 ? sql.join(conditions, sql` AND `) : undefined)
    .orderBy(desc(knownGuestsTable.isVip), knownGuestsTable.name)
    .limit(200);

  res.json(ListKnownGuestsResponse.parse(rows.map(toKnownGuestResponse)));
});

router.patch("/known-guests/:id", requireAuth, async (req, res): Promise<void> => {
  const parsedParams = UpdateKnownGuestParams.safeParse(req.params);
  const parsedBody = UpdateKnownGuestBody.safeParse(req.body);
  if (!parsedParams.success || !parsedBody.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const [updated] = await db
    .update(knownGuestsTable)
    .set({ isVip: parsedBody.data.isVip, updatedAt: new Date() })
    .where(eq(knownGuestsTable.id, parsedParams.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Known guest not found" });
    return;
  }

  const clerkId = getSessionUserId(req) ?? "unknown";
  await db.insert(auditTable).values({
    eventType: "known_guest_vip",
    guestName: updated.name,
    operatorClerkId: clerkId,
    operatorName: clerkId,
    metadata: JSON.stringify({ knownGuestId: updated.id, isVip: updated.isVip }),
  });

  const [row] = await knownGuestStatsQuery().where(eq(knownGuestsTable.id, updated.id));

  res.json(UpdateKnownGuestResponse.parse(toKnownGuestResponse(row)));
});

router.get("/known-guests/:id/visits", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListKnownGuestVisitsParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [kg] = await db
    .select()
    .from(knownGuestsTable)
    .where(eq(knownGuestsTable.id, parsed.data.id));

  if (!kg) {
    res.status(404).json({ error: "Known guest not found" });
    return;
  }

  const visits = await db
    .select()
    .from(guestsTable)
    .where(sql`lower(${guestsTable.name}) = lower(${kg.name})`)
    .orderBy(desc(guestsTable.checkinAt))
    .limit(100);

  res.json(ListKnownGuestVisitsResponse.parse(visits.map(toGuestResponse)));
});

export default router;
