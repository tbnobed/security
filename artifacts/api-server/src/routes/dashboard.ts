import { Router } from "express";
import { and, desc, eq, gte, lte, lt, count, sql } from "drizzle-orm";
import { db, guestsTable, auditTable, preregistrationsTable } from "@workspace/db";
import {
  GetDashboardSummaryResponse,
  GetRecentActivityQueryParams,
  GetRecentActivityResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getTime() + 86400000);

  const [activeResult] = await db
    .select({ count: count() })
    .from(guestsTable)
    .where(eq(guestsTable.status, "active"));

  const [todayCheckinsResult] = await db
    .select({ count: count() })
    .from(guestsTable)
    .where(gte(guestsTable.checkinAt, todayStart));

  const [todayCheckoutsResult] = await db
    .select({ count: count() })
    .from(guestsTable)
    .where(
      and(
        eq(guestsTable.status, "checked_out"),
        gte(guestsTable.checkoutAt, todayStart),
      ),
    );

  const [overdueResult] = await db
    .select({ count: count() })
    .from(guestsTable)
    .where(
      and(
        eq(guestsTable.status, "active"),
        lte(guestsTable.expectedDeparture, now),
      ),
    );

  const [expectedTodayResult] = await db
    .select({ count: count() })
    .from(preregistrationsTable)
    .where(
      and(
        eq(preregistrationsTable.status, "pending"),
        gte(preregistrationsTable.expectedArrival, todayStart),
        lt(preregistrationsTable.expectedArrival, tomorrowStart),
      ),
    );

  const siteBreakdown = await db
    .select({
      site: guestsTable.site,
      count: count(),
    })
    .from(guestsTable)
    .where(eq(guestsTable.status, "active"))
    .groupBy(guestsTable.site);

  res.json(
    GetDashboardSummaryResponse.parse({
      activeGuestCount: activeResult.count,
      todayCheckins: todayCheckinsResult.count,
      todayCheckouts: todayCheckoutsResult.count,
      overdueCount: overdueResult.count,
      expectedTodayCount: expectedTodayResult.count,
      siteBreakdown: siteBreakdown.map((s) => ({ site: s.site, count: s.count })),
    }),
  );
});

router.get("/dashboard/recent-activity", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetRecentActivityQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const limit = parsed.data.limit ?? 20;

  const entries = await db
    .select()
    .from(auditTable)
    .orderBy(desc(auditTable.timestamp))
    .limit(limit);

  const guestSites: Record<number, string> = {};
  for (const e of entries) {
    if (e.guestId && !guestSites[e.guestId]) {
      const [g] = await db.select({ site: guestsTable.site }).from(guestsTable).where(eq(guestsTable.id, e.guestId));
      if (g) guestSites[e.guestId] = g.site;
    }
  }

  res.json(
    GetRecentActivityResponse.parse(
      entries.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        guestName: e.guestName,
        company: null,
        operatorName: e.operatorName,
        site: e.guestId ? (guestSites[e.guestId] ?? null) : null,
        timestamp: e.timestamp.toISOString(),
      })),
    ),
  );
});

export default router;
