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
import { requireOperator } from "../lib/auth";
import { generateBadgeId } from "../lib/badge";
import { getSessionUserId } from "../lib/auth";
import { usersTable } from "@workspace/db";
import { sendVisitorAlert, sendClientCheckinNotification } from "../lib/alerts";
import { upsertKnownGuest } from "../lib/known-guests";
import { getWorkflowConfig, buildApprovalFields, notifyStageApprover } from "../lib/approvals";

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

router.get("/preregistrations", requireOperator, async (req, res): Promise<void> => {
  const parsed = ListPreregistrationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let pregs;
  if (parsed.data.date) {
    const dayStart = new Date(parsed.data.date + "T00:00:00Z");
    const windowDays = parsed.data.range === "week" ? 7 : 1;
    const dayEnd = new Date(dayStart.getTime() + windowDays * 24 * 60 * 60 * 1000);
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

router.post("/preregistrations", requireOperator, async (req, res): Promise<void> => {
  const parsed = CreatePreregistrationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const clerkId = getSessionUserId(req) ?? "unknown";

  const expectedArrival = new Date(parsed.data.expectedArrival);
  const workflow = await getWorkflowConfig();

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
      expectedArrival,
      expectedDeparture: parsed.data.expectedDeparture
        ? new Date(parsed.data.expectedDeparture)
        : null,
      studios: parsed.data.studios ?? [],
      createdByClerkId: clerkId,
      status: "pending",
      ...buildApprovalFields(expectedArrival, workflow),
    })
    .returning();

  if (preg.approvalStatus === "pending") {
    void notifyStageApprover(preg, 1);
  }

  const operatorName = await getOperatorName(clerkId);
  await db.insert(auditTable).values({
    eventType: "preregistration",
    guestId: null,
    guestName: preg.guestName,
    operatorClerkId: clerkId,
    operatorName,
    metadata: JSON.stringify({ site: preg.site }),
  });

  void sendVisitorAlert("preregistration", {
    guestName: preg.guestName,
    company: preg.company,
    hostName: preg.hostName,
    purposeOfVisit: preg.purposeOfVisit,
    site: preg.site,
    studios: preg.studios,
    operatorName,
    expectedArrival: preg.expectedArrival.toISOString(),
    expectedDeparture: preg.expectedDeparture?.toISOString() ?? null,
  });

  res.status(201).json(CreatePreregistrationResponse.parse(toPreregResponse(preg)));
});

router.delete("/preregistrations/:id", requireOperator, async (req, res): Promise<void> => {
  const params = DeletePreregistrationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(preregistrationsTable).where(eq(preregistrationsTable.id, params.data.id));
  res.sendStatus(204);
});

router.post("/preregistrations/:id/convert", requireOperator, async (req, res): Promise<void> => {
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

  if (preg.approvalStatus === "pending") {
    res.status(409).json({ error: "This pre-registration is still awaiting approval" });
    return;
  }
  if (preg.approvalStatus === "denied") {
    res.status(409).json({ error: "This pre-registration was denied and cannot be checked in" });
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

  if (preg.clientUserId) {
    void sendClientCheckinNotification(preg.clientUserId, {
      guestName: guest.name,
      company: guest.company,
      hostName: guest.hostName,
      purposeOfVisit: guest.purposeOfVisit,
      site: guest.site,
      studios: guest.studios,
      badgeId: guest.badgeId,
      checkinAt: guest.checkinAt.toISOString(),
    });
  }

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

  const expectedArrival = new Date(parsed.data.expectedArrival);
  const workflow = await getWorkflowConfig();

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
      expectedArrival,
      expectedDeparture: parsed.data.expectedDeparture
        ? new Date(parsed.data.expectedDeparture)
        : null,
      studios: parsed.data.studios ?? [],
      createdByClerkId: null,
      status: "pending",
      ...buildApprovalFields(expectedArrival, workflow),
    })
    .returning();

  if (preg.approvalStatus === "pending") {
    void notifyStageApprover(preg, 1);
  }

  await db.insert(auditTable).values({
    eventType: "preregistration",
    guestId: null,
    guestName: preg.guestName,
    operatorClerkId: "public",
    operatorName: "Self-registration",
    metadata: JSON.stringify({ site: preg.site, selfRegistered: true }),
  });

  void sendVisitorAlert("preregistration", {
    guestName: preg.guestName,
    company: preg.company,
    hostName: preg.hostName,
    purposeOfVisit: preg.purposeOfVisit,
    site: preg.site,
    studios: preg.studios,
    operatorName: "Self-registration",
    expectedArrival: preg.expectedArrival.toISOString(),
    expectedDeparture: preg.expectedDeparture?.toISOString() ?? null,
  });

  res.status(201).json(CreatePublicPreregistrationResponse.parse(toPreregResponse(preg)));
});

export default router;
