import { Router } from "express";
import { and, desc, eq, ilike, isNull, lte, or, sql } from "drizzle-orm";
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
  CreateGuestResponse,
  GetGuestResponse,
  ListGuestsResponse,
  SearchGuestsResponse,
  ListOverdueGuestsResponse,
  GetGuestBadgeResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { generateBadgeId } from "../lib/badge";
import { getAuth } from "@clerk/express";
import { usersTable } from "@workspace/db";

const router = Router();

function toGuestResponse(g: typeof guestsTable.$inferSelect) {
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
    timeOnSiteMinutes,
    isOverdue,
  };
}

async function getOperatorName(clerkId: string): Promise<string> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  return user?.displayName ?? user?.email ?? clerkId;
}

router.get("/guests", requireAuth, async (req, res): Promise<void> => {
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

router.post("/guests", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateGuestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const auth = getAuth(req);
  const clerkId = auth?.userId ?? "unknown";

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

  res.status(201).json(CreateGuestResponse.parse(toGuestResponse(guest)));
});

router.get("/guests/search", requireAuth, async (req, res): Promise<void> => {
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

router.get("/guests/overdue", requireAuth, async (req, res): Promise<void> => {
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

router.get("/guests/:id", requireAuth, async (req, res): Promise<void> => {
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

router.patch("/guests/:id", requireAuth, async (req, res): Promise<void> => {
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

router.post("/guests/:id/checkout", requireAuth, async (req, res): Promise<void> => {
  const params = CheckoutGuestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const auth = getAuth(req);
  const clerkId = auth?.userId ?? "unknown";

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

  res.json(toGuestResponse(guest));
});

router.get("/guests/:id/badge", requireAuth, async (req, res): Promise<void> => {
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
      photoUrl: guest.photoUrl ?? null,
    }),
  );
});

export default router;
