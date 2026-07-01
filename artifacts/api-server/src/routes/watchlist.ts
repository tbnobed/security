import { Router } from "express";
import { desc, eq, ilike } from "drizzle-orm";
import { db, watchlistTable, auditTable } from "@workspace/db";
import {
  ListWatchlistResponse,
  CreateWatchlistEntryBody,
  CreateWatchlistEntryResponse,
  DeleteWatchlistEntryParams,
  CheckWatchlistQueryParams,
  CheckWatchlistResponse,
} from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../lib/auth";
import { getSessionUserId } from "../lib/auth";
import { usersTable } from "@workspace/db";

const router = Router();

function toWatchlistResponse(w: typeof watchlistTable.$inferSelect) {
  return {
    ...w,
    company: w.company ?? null,
    addedByClerkId: w.addedByClerkId ?? null,
    createdAt: w.createdAt.toISOString(),
  };
}

async function getOperatorName(clerkId: string): Promise<string> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  return user?.displayName ?? user?.email ?? clerkId;
}

router.get("/watchlist", requireAdmin, async (req, res): Promise<void> => {
  const entries = await db
    .select()
    .from(watchlistTable)
    .orderBy(desc(watchlistTable.createdAt));

  res.json(ListWatchlistResponse.parse(entries.map(toWatchlistResponse)));
});

router.post("/watchlist", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateWatchlistEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const clerkId = getSessionUserId(req) ?? "unknown";

  const [entry] = await db
    .insert(watchlistTable)
    .values({
      name: parsed.data.name,
      company: parsed.data.company ?? null,
      reason: parsed.data.reason,
      action: parsed.data.action ?? "flag",
      addedByClerkId: clerkId,
    })
    .returning();

  const operatorName = await getOperatorName(clerkId);
  await db.insert(auditTable).values({
    eventType: "watchlist_flag",
    guestId: null,
    guestName: entry.name,
    operatorClerkId: clerkId,
    operatorName,
    metadata: JSON.stringify({ action: entry.action, reason: entry.reason }),
  });

  res.status(201).json(CreateWatchlistEntryResponse.parse(toWatchlistResponse(entry)));
});

router.delete("/watchlist/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteWatchlistEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(watchlistTable).where(eq(watchlistTable.id, params.data.id));
  res.sendStatus(204);
});

router.get("/watchlist/check", requireAuth, async (req, res): Promise<void> => {
  const parsed = CheckWatchlistQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const entries = await db
    .select()
    .from(watchlistTable)
    .where(ilike(watchlistTable.name, `%${parsed.data.name}%`));

  res.json(
    CheckWatchlistResponse.parse({
      matched: entries.length > 0,
      entries: entries.map(toWatchlistResponse),
    }),
  );
});

export default router;
