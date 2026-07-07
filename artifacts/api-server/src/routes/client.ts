import { Router } from "express";
import { and, desc, eq, gte, ilike, lt, sql } from "drizzle-orm";
import {
  db,
  clientEmployeesTable,
  preregistrationsTable,
  guestsTable,
  auditTable,
} from "@workspace/db";
import {
  ListRosterEmployeesQueryParams,
  ListRosterEmployeesResponse,
  CreateRosterEmployeeBody,
  CreateRosterEmployeeResponse,
  ImportRosterEmployeesBody,
  ImportRosterEmployeesResponse,
  UpdateRosterEmployeeParams,
  UpdateRosterEmployeeBody,
  UpdateRosterEmployeeResponse,
  DeleteRosterEmployeeParams,
  ListRosterEmployeeVisitsParams,
  ListRosterEmployeeVisitsResponse,
  ClientBulkPreregisterBody,
  ClientBulkPreregisterResponse,
  ListClientVisitsTodayResponse,
} from "@workspace/api-zod";
import { requireClient } from "../lib/auth";
import { sendVisitorAlert } from "../lib/alerts";
import type { AppUser } from "@workspace/db";

const router = Router();

router.use("/client", requireClient);

function getClientUser(res: { locals: Record<string, unknown> }): AppUser {
  return res.locals.clientUser as AppUser;
}

function clientOperatorName(client: AppUser): string {
  const who = client.displayName ?? client.email ?? client.clerkId;
  return client.companyName ? `${who} (${client.companyName})` : who;
}

function toEmployeeResponse(e: typeof clientEmployeesTable.$inferSelect) {
  return {
    id: e.id,
    name: e.name,
    title: e.title ?? null,
    phone: e.phone ?? null,
    email: e.email ?? null,
    createdAt: e.createdAt.toISOString(),
  };
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return (e?.code ?? e?.cause?.code) === "23505";
}

router.get("/client/employees", async (req, res): Promise<void> => {
  const parsed = ListRosterEmployeesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const client = getClientUser(res);

  const conditions = [eq(clientEmployeesTable.clientUserId, client.clerkId)];
  if (parsed.data.q && parsed.data.q.trim().length > 0) {
    conditions.push(ilike(clientEmployeesTable.name, `%${parsed.data.q.trim()}%`));
  }

  const rows = await db
    .select()
    .from(clientEmployeesTable)
    .where(and(...conditions))
    .orderBy(sql`lower(${clientEmployeesTable.name})`);

  res.json(ListRosterEmployeesResponse.parse(rows.map(toEmployeeResponse)));
});

router.post("/client/employees", async (req, res): Promise<void> => {
  const parsed = CreateRosterEmployeeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const client = getClientUser(res);

  let employee: typeof clientEmployeesTable.$inferSelect;
  try {
    [employee] = await db
      .insert(clientEmployeesTable)
      .values({
        clientUserId: client.clerkId,
        name: parsed.data.name.trim(),
        title: parsed.data.title?.trim() || null,
        phone: parsed.data.phone?.trim() || null,
        email: parsed.data.email?.trim() || null,
      })
      .returning();
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "An employee with this name already exists" });
      return;
    }
    throw err;
  }

  await db.insert(auditTable).values({
    eventType: "client_employee_added",
    guestId: null,
    guestName: employee.name,
    operatorClerkId: client.clerkId,
    operatorName: clientOperatorName(client),
    metadata: JSON.stringify({ company: client.companyName, employeeId: employee.id }),
  });

  res.status(201).json(CreateRosterEmployeeResponse.parse(toEmployeeResponse(employee)));
});

router.post("/client/employees/import", async (req, res): Promise<void> => {
  const parsed = ImportRosterEmployeesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const client = getClientUser(res);

  let imported = 0;
  let skipped = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < parsed.data.rows.length; i++) {
    const row = parsed.data.rows[i];
    const name = row.name.trim();
    if (name.length === 0) {
      errors.push({ row: i + 1, message: "Name is required" });
      continue;
    }
    try {
      const inserted = await db
        .insert(clientEmployeesTable)
        .values({
          clientUserId: client.clerkId,
          name,
          title: row.title?.trim() || null,
          phone: row.phone?.trim() || null,
          email: row.email?.trim() || null,
        })
        .onConflictDoNothing()
        .returning({ id: clientEmployeesTable.id });
      if (inserted.length > 0) imported++;
      else skipped++;
    } catch (err) {
      errors.push({ row: i + 1, message: err instanceof Error ? err.message : "Insert failed" });
    }
  }

  if (imported > 0) {
    await db.insert(auditTable).values({
      eventType: "client_employees_imported",
      guestId: null,
      guestName: `${imported} employees`,
      operatorClerkId: client.clerkId,
      operatorName: clientOperatorName(client),
      metadata: JSON.stringify({ company: client.companyName, imported, skipped }),
    });
  }

  res.json(ImportRosterEmployeesResponse.parse({ imported, skipped, errors }));
});

router.patch("/client/employees/:id", async (req, res): Promise<void> => {
  const params = UpdateRosterEmployeeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateRosterEmployeeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const client = getClientUser(res);

  const updates: Partial<typeof clientEmployeesTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim();
  if (parsed.data.title !== undefined) updates.title = parsed.data.title?.trim() || null;
  if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone?.trim() || null;
  if (parsed.data.email !== undefined) updates.email = parsed.data.email?.trim() || null;

  if (Object.keys(updates).length === 0) {
    const [existing] = await db
      .select()
      .from(clientEmployeesTable)
      .where(
        and(
          eq(clientEmployeesTable.id, params.data.id),
          eq(clientEmployeesTable.clientUserId, client.clerkId),
        ),
      );
    if (!existing) {
      res.status(404).json({ error: "Employee not found" });
      return;
    }
    res.json(UpdateRosterEmployeeResponse.parse(toEmployeeResponse(existing)));
    return;
  }

  let employee: typeof clientEmployeesTable.$inferSelect | undefined;
  try {
    [employee] = await db
      .update(clientEmployeesTable)
      .set(updates)
      .where(
        and(
          eq(clientEmployeesTable.id, params.data.id),
          eq(clientEmployeesTable.clientUserId, client.clerkId),
        ),
      )
      .returning();
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "An employee with this name already exists" });
      return;
    }
    throw err;
  }

  if (!employee) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }

  await db.insert(auditTable).values({
    eventType: "client_employee_edited",
    guestId: null,
    guestName: employee.name,
    operatorClerkId: client.clerkId,
    operatorName: clientOperatorName(client),
    metadata: JSON.stringify({ company: client.companyName, employeeId: employee.id }),
  });

  res.json(UpdateRosterEmployeeResponse.parse(toEmployeeResponse(employee)));
});

router.delete("/client/employees/:id", async (req, res): Promise<void> => {
  const params = DeleteRosterEmployeeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const client = getClientUser(res);

  const deleted = await db
    .delete(clientEmployeesTable)
    .where(
      and(
        eq(clientEmployeesTable.id, params.data.id),
        eq(clientEmployeesTable.clientUserId, client.clerkId),
      ),
    )
    .returning({ id: clientEmployeesTable.id, name: clientEmployeesTable.name });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }

  await db.insert(auditTable).values({
    eventType: "client_employee_deleted",
    guestId: null,
    guestName: deleted[0].name,
    operatorClerkId: client.clerkId,
    operatorName: clientOperatorName(client),
    metadata: JSON.stringify({ company: client.companyName, employeeId: deleted[0].id }),
  });

  res.sendStatus(204);
});

function toVisit(
  p: typeof preregistrationsTable.$inferSelect,
  g: typeof guestsTable.$inferSelect | null,
) {
  const status =
    g == null ? "expected" : g.status === "active" ? "on_site" : "checked_out";
  return {
    preregistrationId: p.id,
    clientEmployeeId: p.clientEmployeeId ?? null,
    guestName: p.guestName,
    hostName: p.hostName ?? null,
    purposeOfVisit: p.purposeOfVisit ?? null,
    studios: p.studios,
    status,
    expectedArrival: p.expectedArrival.toISOString(),
    checkinAt: g?.checkinAt?.toISOString() ?? null,
    checkoutAt: g?.checkoutAt?.toISOString() ?? null,
  };
}

router.get("/client/employees/:id/visits", async (req, res): Promise<void> => {
  const params = ListRosterEmployeeVisitsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const client = getClientUser(res);

  const [employee] = await db
    .select()
    .from(clientEmployeesTable)
    .where(
      and(
        eq(clientEmployeesTable.id, params.data.id),
        eq(clientEmployeesTable.clientUserId, client.clerkId),
      ),
    );
  if (!employee) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }

  const rows = await db
    .select({ prereg: preregistrationsTable, guest: guestsTable })
    .from(preregistrationsTable)
    .leftJoin(guestsTable, eq(guestsTable.id, preregistrationsTable.convertedGuestId))
    .where(
      and(
        eq(preregistrationsTable.clientUserId, client.clerkId),
        eq(preregistrationsTable.clientEmployeeId, params.data.id),
      ),
    )
    .orderBy(desc(preregistrationsTable.expectedArrival));

  res.json(ListRosterEmployeeVisitsResponse.parse(rows.map((r) => toVisit(r.prereg, r.guest))));
});

router.get("/client/visits/today", async (req, res): Promise<void> => {
  const client = getClientUser(res);

  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const rows = await db
    .select({ prereg: preregistrationsTable, guest: guestsTable })
    .from(preregistrationsTable)
    .leftJoin(guestsTable, eq(guestsTable.id, preregistrationsTable.convertedGuestId))
    .where(
      and(
        eq(preregistrationsTable.clientUserId, client.clerkId),
        gte(preregistrationsTable.expectedArrival, dayStart),
        lt(preregistrationsTable.expectedArrival, dayEnd),
      ),
    )
    .orderBy(preregistrationsTable.expectedArrival);

  res.json(ListClientVisitsTodayResponse.parse(rows.map((r) => toVisit(r.prereg, r.guest))));
});

router.post("/client/preregistrations/bulk", async (req, res): Promise<void> => {
  const parsed = ClientBulkPreregisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const client = getClientUser(res);

  const uniqueIds = [...new Set(parsed.data.employeeIds)];
  const employees = await db
    .select()
    .from(clientEmployeesTable)
    .where(eq(clientEmployeesTable.clientUserId, client.clerkId));
  const byId = new Map(employees.map((e) => [e.id, e]));

  const missing = uniqueIds.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    res.status(400).json({ error: `Unknown employee ids: ${missing.join(", ")}` });
    return;
  }

  const operatorName = clientOperatorName(client);
  const expectedArrival = new Date(parsed.data.expectedArrival);
  const expectedDeparture = parsed.data.expectedDeparture
    ? new Date(parsed.data.expectedDeparture)
    : null;

  const created = await db
    .insert(preregistrationsTable)
    .values(
      uniqueIds.map((id) => {
        const emp = byId.get(id)!;
        return {
          guestName: emp.name,
          company: client.companyName ?? "",
          phone: emp.phone ?? null,
          email: emp.email ?? null,
          hostName: parsed.data.hostName,
          purposeOfVisit: parsed.data.purposeOfVisit ?? null,
          site: parsed.data.site,
          expectedArrival,
          expectedDeparture,
          studios: parsed.data.studios ?? [],
          createdByClerkId: client.clerkId,
          clientUserId: client.clerkId,
          clientEmployeeId: emp.id,
          status: "pending" as const,
        };
      }),
    )
    .returning();

  await db.insert(auditTable).values(
    created.map((preg) => ({
      eventType: "preregistration",
      guestId: null,
      guestName: preg.guestName,
      operatorClerkId: client.clerkId,
      operatorName,
      metadata: JSON.stringify({ site: preg.site, clientPortal: true, company: client.companyName }),
    })),
  );

  for (const preg of created) {
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
  }

  res.status(201).json(
    ClientBulkPreregisterResponse.parse({
      created: created.length,
      preregistrations: created.map((p) => ({
        ...p,
        phone: p.phone ?? null,
        email: p.email ?? null,
        purposeOfVisit: p.purposeOfVisit ?? null,
        expectedArrival: p.expectedArrival.toISOString(),
        expectedDeparture: p.expectedDeparture?.toISOString() ?? null,
        createdByClerkId: p.createdByClerkId ?? null,
        convertedGuestId: p.convertedGuestId ?? null,
      })),
    }),
  );
});

export default router;
