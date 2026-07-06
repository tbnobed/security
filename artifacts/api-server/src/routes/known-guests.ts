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
  DeleteKnownGuestParams,
} from "@workspace/api-zod";
import { requireOperator, getSessionUserId } from "../lib/auth";
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

router.get("/known-guests", requireOperator, async (req, res): Promise<void> => {
  const parsed = ListKnownGuestsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { q, vip } = parsed.data;
  const page = parsed.data.page ?? 1;
  const pageSize = parsed.data.pageSize ?? 20;

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
  const where = conditions.length > 0 ? sql.join(conditions, sql` AND `) : undefined;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(knownGuestsTable)
    .where(where);

  const rows = await knownGuestStatsQuery()
    .where(where)
    .orderBy(desc(knownGuestsTable.isVip), knownGuestsTable.name)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  res.json(
    ListKnownGuestsResponse.parse({
      items: rows.map(toKnownGuestResponse),
      total,
      page,
      pageSize,
    }),
  );
});

router.patch("/known-guests/:id", requireOperator, async (req, res): Promise<void> => {
  const parsedParams = UpdateKnownGuestParams.safeParse(req.params);
  const parsedBody = UpdateKnownGuestBody.safeParse(req.body);
  if (!parsedParams.success || !parsedBody.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const body = parsedBody.data;
  const changes: Partial<typeof knownGuestsTable.$inferInsert> = {};
  if (body.name !== undefined) changes.name = body.name.trim();
  if (body.company !== undefined) changes.company = body.company?.trim() || null;
  if (body.phone !== undefined) changes.phone = body.phone?.trim() || null;
  if (body.email !== undefined) changes.email = body.email?.trim() || null;
  if (body.isVip !== undefined) changes.isVip = body.isVip;

  if (Object.keys(changes).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  let updated: typeof knownGuestsTable.$inferSelect | undefined;
  try {
    [updated] = await db
      .update(knownGuestsTable)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(knownGuestsTable.id, parsedParams.data.id))
      .returning();
  } catch (err) {
    const code =
      (err as { code?: string })?.code ??
      (err as { cause?: { code?: string } })?.cause?.code;
    if (code === "23505") {
      res.status(409).json({ error: "Another known guest already has that name" });
      return;
    }
    throw err;
  }

  if (!updated) {
    res.status(404).json({ error: "Known guest not found" });
    return;
  }

  const clerkId = getSessionUserId(req) ?? "unknown";
  const onlyVipChange = Object.keys(changes).length === 1 && "isVip" in changes;
  await db.insert(auditTable).values({
    eventType: onlyVipChange ? "known_guest_vip" : "known_guest_edited",
    guestName: updated.name,
    operatorClerkId: clerkId,
    operatorName: clerkId,
    metadata: JSON.stringify({ knownGuestId: updated.id, fields: Object.keys(changes) }),
  });

  const [row] = await knownGuestStatsQuery().where(eq(knownGuestsTable.id, updated.id));

  res.json(UpdateKnownGuestResponse.parse(toKnownGuestResponse(row)));
});

router.delete("/known-guests/:id", requireOperator, async (req, res): Promise<void> => {
  const parsed = DeleteKnownGuestParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [deleted] = await db
    .delete(knownGuestsTable)
    .where(eq(knownGuestsTable.id, parsed.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Known guest not found" });
    return;
  }

  const clerkId = getSessionUserId(req) ?? "unknown";
  await db.insert(auditTable).values({
    eventType: "known_guest_deleted",
    guestName: deleted.name,
    operatorClerkId: clerkId,
    operatorName: clerkId,
    metadata: JSON.stringify({ knownGuestId: deleted.id }),
  });

  res.status(204).end();
});

router.get("/known-guests/:id/visits", requireOperator, async (req, res): Promise<void> => {
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
