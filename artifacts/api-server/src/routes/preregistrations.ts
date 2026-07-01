import { Router } from "express";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db, preregistrationsTable, guestsTable, auditTable } from "@workspace/db";
import {
  ListPreregistrationsQueryParams,
  CreatePreregistrationBody,
  DeletePreregistrationParams,
  ConvertPreregistrationParams,
  ConvertPreregistrationBody,
  CreatePublicPreregistrationBody,
  ListPreregistrationsResponse,
  CreatePreregistrationResponse,
  ConvertPreregistrationResponse,
  CreatePublicPreregistrationResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { generateBadgeId } from "../lib/badge";
import { getSessionUserId } from "../lib/auth";
import { usersTable } from "@workspace/db";

const router = Router();

function toPreregResponse(p: typeof preregistrationsTable.$inferSelect) {
  return {
    ...p,
    phone: p.phone ?? null,
    email: p.email ?? null,
    purposeOfVisit: p.purposeOfVisit ?? null,
    expectedDeparture: p.expectedDeparture?.toISOString() ?? null,
    expectedArrival: p.expectedArrival.toISOString(),
    createdByClerkId: p.createdByClerkId ?? null,
    convertedGuestId: p.convertedGuestId ?? null,
  };
}

async function getOperatorName(clerkId: string): Promise<string> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  return user?.displayName ?? user?.email ?? clerkId;
}

router.get("/preregistrations", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListPreregistrationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let pregs;
  if (parsed.data.date) {
    const dayStart = new Date(parsed.data.date + "T00:00:00Z");
    const dayEnd = new Date(parsed.data.date + "T23:59:59Z");
    pregs = await db
      .select()
      .from(preregistrationsTable)
      .where(
        and(
          gte(preregistrationsTable.expectedArrival, dayStart),
          lt(preregistrationsTable.expectedArrival, dayEnd),
        ),
      )
      .orderBy(preregistrationsTable.expectedArrival);
  } else {
    pregs = await db
      .select()
      .from(preregistrationsTable)
      .orderBy(desc(preregistrationsTable.expectedArrival));
  }

  res.json(ListPreregistrationsResponse.parse(pregs.map(toPreregResponse)));
});

router.post("/preregistrations", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreatePreregistrationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const clerkId = getSessionUserId(req) ?? "unknown";

  const [preg] = await db
    .insert(preregistrationsTable)
    .values({
      guestName: parsed.data.guestName,
      company: parsed.data.company ?? "",
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      hostName: parsed.data.hostName,
      purposeOfVisit: parsed.data.purposeOfVisit ?? null,
      site: parsed.data.site,
      expectedArrival: new Date(parsed.data.expectedArrival),
      expectedDeparture: parsed.data.expectedDeparture
        ? new Date(parsed.data.expectedDeparture)
        : null,
      studios: parsed.data.studios ?? [],
      createdByClerkId: clerkId,
      status: "pending",
    })
    .returning();

  const operatorName = await getOperatorName(clerkId);
  await db.insert(auditTable).values({
    eventType: "preregistration",
    guestId: null,
    guestName: preg.guestName,
    operatorClerkId: clerkId,
    operatorName,
    metadata: JSON.stringify({ site: preg.site }),
  });

  res.status(201).json(CreatePreregistrationResponse.parse(toPreregResponse(preg)));
});

router.delete("/preregistrations/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeletePreregistrationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(preregistrationsTable).where(eq(preregistrationsTable.id, params.data.id));
  res.sendStatus(204);
});

router.post("/preregistrations/:id/convert", requireAuth, async (req, res): Promise<void> => {
  const params = ConvertPreregistrationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [preg] = await db
    .select()
    .from(preregistrationsTable)
    .where(eq(preregistrationsTable.id, params.data.id));

  if (!preg) {
    res.status(404).json({ error: "Pre-registration not found" });
    return;
  }

  const body = ConvertPreregistrationBody.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const clerkId = getSessionUserId(req) ?? "unknown";
  const badgeId = generateBadgeId();

  const [guest] = await db
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
      checkedInByClerkId: clerkId,
      preregistrationId: preg.id,
      status: "active",
    })
    .returning();

  await db
    .update(preregistrationsTable)
    .set({ status: "converted", convertedGuestId: guest.id })
    .where(eq(preregistrationsTable.id, preg.id));

  const operatorName = await getOperatorName(clerkId);
  await db.insert(auditTable).values({
    eventType: "checkin",
    guestId: guest.id,
    guestName: guest.name,
    operatorClerkId: clerkId,
    operatorName,
    metadata: JSON.stringify({ site: guest.site, badgeId: guest.badgeId, fromPreregistration: true }),
  });

  const now = new Date();
  const timeOnSiteMinutes = Math.round((now.getTime() - guest.checkinAt.getTime()) / 60000);
  const isOverdue =
    guest.status === "active" &&
    guest.expectedDeparture != null &&
    new Date(guest.expectedDeparture) < now;

  res.status(201).json(
    ConvertPreregistrationResponse.parse({
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

router.post("/public/preregistrations", async (req, res): Promise<void> => {
  const parsed = CreatePublicPreregistrationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [preg] = await db
    .insert(preregistrationsTable)
    .values({
      guestName: parsed.data.guestName,
      company: parsed.data.company ?? "",
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      hostName: parsed.data.hostName,
      purposeOfVisit: parsed.data.purposeOfVisit ?? null,
      site: parsed.data.site,
      expectedArrival: new Date(parsed.data.expectedArrival),
      expectedDeparture: parsed.data.expectedDeparture
        ? new Date(parsed.data.expectedDeparture)
        : null,
      studios: parsed.data.studios ?? [],
      createdByClerkId: null,
      status: "pending",
    })
    .returning();

  await db.insert(auditTable).values({
    eventType: "preregistration",
    guestId: null,
    guestName: preg.guestName,
    operatorClerkId: "public",
    operatorName: "Self-registration",
    metadata: JSON.stringify({ site: preg.site, selfRegistered: true }),
  });

  res.status(201).json(CreatePublicPreregistrationResponse.parse(toPreregResponse(preg)));
});

export default router;
