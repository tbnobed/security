import { Router } from "express";
import { and, eq, gte, ilike, lt, sql } from "drizzle-orm";
import {
  db,
  preregistrationsTable,
  guestsTable,
  auditTable,
  watchlistTable,
} from "@workspace/db";
import {
  KioskListPreregistrationsQueryParams,
  KioskListPreregistrationsResponse,
  KioskCheckinBody,
  KioskCheckinResponse,
} from "@workspace/api-zod";
import { requireAuth, getSessionUserId } from "../lib/auth";
import { generateBadgeId } from "../lib/badge";
import { sendVisitorAlert } from "../lib/alerts";
import { upsertKnownGuest } from "../lib/known-guests";

const router = Router();

function todayWindow(): { dayStart: Date; dayEnd: Date } {
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  return { dayStart, dayEnd };
}

router.get("/kiosk/preregistrations", requireAuth, async (req, res): Promise<void> => {
  const parsed = KioskListPreregistrationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { dayStart, dayEnd } = todayWindow();
  const rows = await db
    .select({
      id: preregistrationsTable.id,
      guestName: preregistrationsTable.guestName,
      company: preregistrationsTable.company,
      hostName: preregistrationsTable.hostName,
      expectedArrival: preregistrationsTable.expectedArrival,
    })
    .from(preregistrationsTable)
    .where(
      and(
        eq(preregistrationsTable.status, "pending"),
        gte(preregistrationsTable.expectedArrival, dayStart),
        lt(preregistrationsTable.expectedArrival, dayEnd),
        ilike(preregistrationsTable.guestName, `%${parsed.data.q}%`),
      ),
    )
    .orderBy(preregistrationsTable.expectedArrival)
    .limit(8);

  res.json(
    KioskListPreregistrationsResponse.parse(
      rows.map((r) => ({ ...r, expectedArrival: r.expectedArrival.toISOString() })),
    ),
  );
});

router.post("/kiosk/checkin", requireAuth, async (req, res): Promise<void> => {
  const body = KioskCheckinBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [preg] = await db
    .select()
    .from(preregistrationsTable)
    .where(eq(preregistrationsTable.id, body.data.preregistrationId));

  if (!preg || preg.status !== "pending") {
    res.status(404).json({ error: "Pre-registration not found or already checked in" });
    return;
  }

  const { dayStart, dayEnd } = todayWindow();
  if (preg.expectedArrival < dayStart || preg.expectedArrival >= dayEnd) {
    res.status(404).json({ error: "Pre-registration is not for today" });
    return;
  }

  // Watchlist check — self check-in must never admit blocked or flagged guests.
  // Bidirectional match: halt if the guest name contains a watchlist name OR a
  // watchlist entry contains the guest name (e.g. watchlist "John" vs guest
  // "John Doe" and vice versa). Deliberately generic message: don't reveal
  // watchlist status to the guest.
  const watchlistMatches = await db
    .select()
    .from(watchlistTable)
    .where(
      sql`${watchlistTable.name} ILIKE '%' || ${preg.guestName} || '%' OR ${preg.guestName} ILIKE '%' || ${watchlistTable.name} || '%'`,
    );

  if (watchlistMatches.length > 0) {
    req.log.warn(
      { preregistrationId: preg.id, matches: watchlistMatches.length },
      "kiosk check-in halted by watchlist match",
    );
    res.status(403).json({ error: "Please see the security desk to complete check-in." });
    return;
  }

  const kioskUserId = getSessionUserId(req) ?? "unknown";
  const badgeId = generateBadgeId();

  // Atomically claim the pre-registration and create the guest in a single
  // transaction so two simultaneous kiosk requests can't double-convert it.
  const guest = await db.transaction(async (tx) => {
    const claimed = await tx
      .update(preregistrationsTable)
      .set({ status: "converted" })
      .where(
        and(
          eq(preregistrationsTable.id, preg.id),
          eq(preregistrationsTable.status, "pending"),
        ),
      )
      .returning({ id: preregistrationsTable.id });

    if (claimed.length === 0) return null;

    const [created] = await tx
      .insert(guestsTable)
      .values({
        badgeId,
        name: preg.guestName,
        company: preg.company,
        phone: preg.phone ?? null,
        email: preg.email ?? null,
        hostName: preg.hostName,
        purposeOfVisit: preg.purposeOfVisit ?? "Pre-registered visit",
        site: preg.site,
        studios: preg.studios,
        expectedDeparture: preg.expectedDeparture ?? null,
        photoUrl: body.data.photoUrl ?? null,
        checkedInByClerkId: kioskUserId,
        preregistrationId: preg.id,
        status: "active",
        checkinSource: "kiosk",
      })
      .returning();

    await tx
      .update(preregistrationsTable)
      .set({ convertedGuestId: created.id })
      .where(eq(preregistrationsTable.id, preg.id));

    return created;
  });

  if (!guest) {
    res.status(404).json({ error: "Pre-registration not found or already checked in" });
    return;
  }

  await db.insert(auditTable).values({
    eventType: "checkin",
    guestId: guest.id,
    guestName: guest.name,
    operatorClerkId: kioskUserId,
    operatorName: "Self check-in (kiosk)",
    metadata: JSON.stringify({
      site: guest.site,
      badgeId: guest.badgeId,
      fromPreregistration: true,
      kiosk: true,
    }),
  });

  void sendVisitorAlert("checkin", {
    guestName: guest.name,
    company: guest.company,
    hostName: guest.hostName,
    purposeOfVisit: guest.purposeOfVisit,
    site: guest.site,
    studios: guest.studios,
    badgeId: guest.badgeId,
    operatorName: "Self check-in (kiosk)",
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

  const now = new Date();
  const timeOnSiteMinutes = Math.round((now.getTime() - guest.checkinAt.getTime()) / 60000);
  const isOverdue =
    guest.status === "active" &&
    guest.expectedDeparture != null &&
    new Date(guest.expectedDeparture) < now;

  res.status(201).json(
    KioskCheckinResponse.parse({
      ...guest,
      phone: guest.phone ?? null,
      email: guest.email ?? null,
      checkoutAt: null,
      expectedDeparture: guest.expectedDeparture?.toISOString() ?? null,
      photoUrl: guest.photoUrl ?? null,
      checkedInByClerkId: guest.checkedInByClerkId ?? null,
      checkedOutByClerkId: null,
      preregistrationId: guest.preregistrationId ?? null,
      checkinAt: guest.checkinAt.toISOString(),
      timeOnSiteMinutes,
      isOverdue,
    }),
  );
});

export default router;
