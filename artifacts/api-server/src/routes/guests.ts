import { Router } from "express";
import { and, desc, eq, gte, ilike, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db, guestsTable, auditTable, watchlistTable } from "@workspace/db";
import {
  ListGuestsQueryParams,
  CreateGuestBody,
  GetGuestParams,
  UpdateGuestBody,
  UpdateGuestParams,
  CheckoutGuestParams,
  GetGuestBadgeParams,
  SearchGuestsQueryParams,
  ListGuestHistoryQueryParams,
  ListGuestHistoryResponse,
  CreateGuestResponse,
  GetGuestResponse,
  ListGuestsResponse,
  SearchGuestsResponse,
  ListOverdueGuestsResponse,
  GetGuestBadgeResponse,
} from "@workspace/api-zod";
import { requireOperator } from "../lib/auth";
import { generateBadgeId } from "../lib/badge";
import { getSessionUserId } from "../lib/auth";
import { usersTable } from "@workspace/db";
import { sendVisitorAlert } from "../lib/alerts";
import { upsertKnownGuest } from "../lib/known-guests";

const router = Router();

export function toGuestResponse(g: typeof guestsTable.$inferSelect) {
  const now = new Date();
  const checkin = new Date(g.checkinAt);
  const timeOnSiteMinutes = g.checkoutAt
    ? Math.round((new Date(g.checkoutAt).getTime() - checkin.getTime()) / 60000)
    : Math.round((now.getTime() - checkin.getTime()) / 60000);

  const isOverdue =
    g.status === "active" &&
    g.expectedDeparture != null &&
    new Date(g.expectedDeparture) < now;

  return {
    ...g,
    phone: g.phone ?? null,
    email: g.email ?? null,
    checkoutAt: g.checkoutAt?.toISOString() ?? null,
    expectedDeparture: g.expectedDeparture?.toISOString() ?? null,
    photoUrl: g.photoUrl ?? null,
    checkedInByClerkId: g.checkedInByClerkId ?? null,
    checkedOutByClerkId: g.checkedOutByClerkId ?? null,
    preregistrationId: g.preregistrationId ?? null,
    checkinAt: g.checkinAt.toISOString(),
    badgePrintedAt: g.badgePrintedAt?.toISOString() ?? null,
    timeOnSiteMinutes,
    isOverdue,
  };
}

async function getOperatorName(clerkId: string): Promise<string> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  return user?.displayName ?? user?.email ?? clerkId;
}

router.get("/guests", requireOperator, async (req, res): Promise<void> => {
  const parsed = ListGuestsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { status, host, company, site, search } = parsed.data;

  const conditions = [];
  if (status && status !== "all") {
    conditions.push(eq(guestsTable.status, status));
  }
  if (!status || status === "active") {
    // default to active if no status param
  }
  if (host) conditions.push(ilike(guestsTable.hostName, `%${host}%`));
  if (company) conditions.push(ilike(guestsTable.company, `%${company}%`));
  if (site) conditions.push(ilike(guestsTable.site, `%${site}%`));
  if (search) {
    conditions.push(
      or(
        ilike(guestsTable.name, `%${search}%`),
        ilike(guestsTable.badgeId, `%${search}%`),
        ilike(guestsTable.company, `%${search}%`),
      )!,
    );
  }

  // If status is not specified, default to active
  if (!status) {
    conditions.push(eq(guestsTable.status, "active"));
  }

  const guests = await db
    .select()
    .from(guestsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(guestsTable.checkinAt));

  res.json(ListGuestsResponse.parse(guests.map(toGuestResponse)));
});

router.post("/guests", requireOperator, async (req, res): Promise<void> => {
  const parsed = CreateGuestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const clerkId = getSessionUserId(req) ?? "unknown";

  // Watchlist check
  const watchlistMatches = await db
    .select()
    .from(watchlistTable)
    .where(ilike(watchlistTable.name, `%${parsed.data.name}%`));

  if (watchlistMatches.length > 0) {
    const blocked = watchlistMatches.filter((w) => w.action === "block");
    if (blocked.length > 0) {
      res.status(403).json({
        message: `Guest "${parsed.data.name}" is on the blocked list. Entry denied.`,
        entries: blocked.map((w) => ({
          ...w,
          createdAt: w.createdAt.toISOString(),
          company: w.company ?? null,
          addedByClerkId: w.addedByClerkId ?? null,
        })),
      });
      return;
    }
  }

  const badgeId = generateBadgeId();

  const [guest] = await db
    .insert(guestsTable)
    .values({
      badgeId,
      name: parsed.data.name,
      company: parsed.data.company,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      hostName: parsed.data.hostName,
      purposeOfVisit: parsed.data.purposeOfVisit,
      site: parsed.data.site,
      studios: parsed.data.studios ?? [],
      expectedDeparture: parsed.data.expectedDeparture
        ? new Date(parsed.data.expectedDeparture)
        : null,
      photoUrl: parsed.data.photoUrl ?? null,
      checkedInByClerkId: clerkId,
      preregistrationId: parsed.data.preregistrationId ?? null,
      status: "active",
    })
    .returning();

  // Audit log
  const operatorName = await getOperatorName(clerkId);
  await db.insert(auditTable).values({
    eventType: "checkin",
    guestId: guest.id,
    guestName: guest.name,
    operatorClerkId: clerkId,
    operatorName,
    metadata: JSON.stringify({ site: guest.site, badgeId: guest.badgeId }),
  });

  // Watchlist flag audit
  if (watchlistMatches.length > 0) {
    await db.insert(auditTable).values({
      eventType: "watchlist_flag",
      guestId: guest.id,
      guestName: guest.name,
      operatorClerkId: clerkId,
      operatorName,
      metadata: JSON.stringify({ watchlistIds: watchlistMatches.map((w) => w.id) }),
    });
  }

  void sendVisitorAlert("checkin", {
    guestName: guest.name,
    company: guest.company,
    hostName: guest.hostName,
    purposeOfVisit: guest.purposeOfVisit,
    site: guest.site,
    studios: guest.studios,
    badgeId: guest.badgeId,
    operatorName,
    expectedDeparture: guest.expectedDeparture?.toISOString() ?? null,
    checkinAt: guest.checkinAt.toISOString(),
  });

  void upsertKnownGuest({
    name: guest.name,
    company: guest.company,
    phone: guest.phone,
    email: guest.email,
    photoUrl: guest.photoUrl,
  });

  res.status(201).json(CreateGuestResponse.parse(toGuestResponse(guest)));
});

router.get("/guests/search", requireOperator, async (req, res): Promise<void> => {
  const parsed = SearchGuestsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { q } = parsed.data;

  const guests = await db
    .select()
    .from(guestsTable)
    .where(
      and(
        eq(guestsTable.status, "active"),
        or(
          ilike(guestsTable.name, `%${q}%`),
          ilike(guestsTable.badgeId, `%${q}%`),
          ilike(guestsTable.company, `%${q}%`),
        )!,
      ),
    )
    .orderBy(desc(guestsTable.checkinAt))
    .limit(20);

  res.json(SearchGuestsResponse.parse(guests.map(toGuestResponse)));
});

router.get("/guests/history", requireOperator, async (req, res): Promise<void> => {
  const parsed = ListGuestHistoryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { q, status, from, to, page, pageSize } = parsed.data;

  const conditions = [];
  if (status && status !== "all") {
    conditions.push(eq(guestsTable.status, status));
  }
  if (q) {
    conditions.push(
      or(
        ilike(guestsTable.name, `%${q}%`),
        ilike(guestsTable.badgeId, `%${q}%`),
        ilike(guestsTable.company, `%${q}%`),
      )!,
    );
  }
  const parseDay = (value: string): Date | null => {
    const d = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
  };
  let fromDate: Date | null = null;
  let toDateExclusive: Date | null = null;
  if (from) {
    fromDate = parseDay(from);
    if (!fromDate) {
      res.status(400).json({ error: `Invalid "from" date: ${from}` });
      return;
    }
  }
  if (to) {
    const toDate = parseDay(to);
    if (!toDate) {
      res.status(400).json({ error: `Invalid "to" date: ${to}` });
      return;
    }
    toDateExclusive = new Date(toDate.getTime() + 24 * 60 * 60 * 1000);
  }
  if (fromDate) {
    conditions.push(gte(guestsTable.checkinAt, fromDate));
  }
  if (toDateExclusive) {
    conditions.push(lt(guestsTable.checkinAt, toDateExclusive));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(guestsTable)
    .where(where);

  const guests = await db
    .select()
    .from(guestsTable)
    .where(where)
    .orderBy(desc(guestsTable.checkinAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  res.json(
    ListGuestHistoryResponse.parse({
      items: guests.map(toGuestResponse),
      total,
      page,
      pageSize,
    }),
  );
});

router.get("/guests/overdue", requireOperator, async (req, res): Promise<void> => {
  const now = new Date();
  const guests = await db
    .select()
    .from(guestsTable)
    .where(
      and(
        eq(guestsTable.status, "active"),
        lte(guestsTable.expectedDeparture, now),
      ),
    )
    .orderBy(guestsTable.expectedDeparture);

  res.json(ListOverdueGuestsResponse.parse(guests.map(toGuestResponse)));
});

router.get("/guests/:id", requireOperator, async (req, res): Promise<void> => {
  const params = GetGuestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [guest] = await db
    .select()
    .from(guestsTable)
    .where(eq(guestsTable.id, params.data.id));

  if (!guest) {
    res.status(404).json({ error: "Guest not found" });
    return;
  }

  res.json(GetGuestResponse.parse(toGuestResponse(guest)));
});

router.patch("/guests/:id", requireOperator, async (req, res): Promise<void> => {
  const params = UpdateGuestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateGuestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.company !== undefined) updateData.company = parsed.data.company;
  if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone;
  if (parsed.data.email !== undefined) updateData.email = parsed.data.email;
  if (parsed.data.hostName !== undefined) updateData.hostName = parsed.data.hostName;
  if (parsed.data.purposeOfVisit !== undefined) updateData.purposeOfVisit = parsed.data.purposeOfVisit;
  if (parsed.data.site !== undefined) updateData.site = parsed.data.site;
  if (parsed.data.expectedDeparture !== undefined) {
    updateData.expectedDeparture = parsed.data.expectedDeparture
      ? new Date(parsed.data.expectedDeparture)
      : null;
  }
  if (parsed.data.photoUrl !== undefined) updateData.photoUrl = parsed.data.photoUrl;

  const [guest] = await db
    .update(guestsTable)
    .set(updateData)
    .where(eq(guestsTable.id, params.data.id))
    .returning();

  if (!guest) {
    res.status(404).json({ error: "Guest not found" });
    return;
  }

  res.json(toGuestResponse(guest));
});

router.post("/guests/:id/checkout", requireOperator, async (req, res): Promise<void> => {
  const params = CheckoutGuestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const clerkId = getSessionUserId(req) ?? "unknown";

  const [guest] = await db
    .update(guestsTable)
    .set({
      status: "checked_out",
      checkoutAt: new Date(),
      checkedOutByClerkId: clerkId,
    })
    .where(and(eq(guestsTable.id, params.data.id), eq(guestsTable.status, "active")))
    .returning();

  if (!guest) {
    res.status(404).json({ error: "Active guest not found" });
    return;
  }

  const operatorName = await getOperatorName(clerkId);
  await db.insert(auditTable).values({
    eventType: "checkout",
    guestId: guest.id,
    guestName: guest.name,
    operatorClerkId: clerkId,
    operatorName,
    metadata: JSON.stringify({ site: guest.site, badgeId: guest.badgeId }),
  });

  void sendVisitorAlert("checkout", {
    guestName: guest.name,
    company: guest.company,
    hostName: guest.hostName,
    purposeOfVisit: guest.purposeOfVisit,
    site: guest.site,
    studios: guest.studios,
    badgeId: guest.badgeId,
    operatorName,
    checkinAt: guest.checkinAt.toISOString(),
    checkoutAt: guest.checkoutAt?.toISOString() ?? null,
  });

  res.json(toGuestResponse(guest));
});

router.get("/guests/:id/badge", requireOperator, async (req, res): Promise<void> => {
  const params = GetGuestBadgeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [guest] = await db.select().from(guestsTable).where(eq(guestsTable.id, params.data.id));
  if (!guest) {
    res.status(404).json({ error: "Guest not found" });
    return;
  }

  res.json(
    GetGuestBadgeResponse.parse({
      badgeId: guest.badgeId,
      guestName: guest.name,
      company: guest.company,
      hostName: guest.hostName,
      checkinAt: guest.checkinAt.toISOString(),
      site: guest.site,
      studios: guest.studios,
      photoUrl: guest.photoUrl ?? null,
    }),
  );
});

router.post("/guests/:id/print-badge", requireOperator, async (req, res): Promise<void> => {
  const params = GetGuestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [guest] = await db
    .update(guestsTable)
    .set({ badgePrintedAt: new Date() })
    .where(eq(guestsTable.id, params.data.id))
    .returning();

  if (!guest) {
    res.status(404).json({ error: "Guest not found" });
    return;
  }

  res.json(toGuestResponse(guest));
});

export default router;
