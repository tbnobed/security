import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db, alertRecipientsTable } from "@workspace/db";
import {
  ListAlertRecipientsResponse,
  CreateAlertRecipientBody,
  CreateAlertRecipientResponse,
  DeleteAlertRecipientParams,
  GetAlertStatusResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../lib/auth";
import { isEmailConfigured, getFromEmail } from "../lib/email";

const router = Router();

function toRecipientResponse(r: typeof alertRecipientsTable.$inferSelect) {
  return {
    id: r.id,
    eventType: r.eventType as "preregistration" | "checkin" | "checkout" | "overdue",
    email: r.email,
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/alert-status", requireAdmin, async (_req, res): Promise<void> => {
  res.json(
    GetAlertStatusResponse.parse({
      emailConfigured: isEmailConfigured(),
      fromEmail: getFromEmail(),
    }),
  );
});

router.get("/alert-recipients", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(alertRecipientsTable)
    .orderBy(alertRecipientsTable.eventType, alertRecipientsTable.createdAt);
  res.json(ListAlertRecipientsResponse.parse(rows.map(toRecipientResponse)));
});

router.post("/alert-recipients", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateAlertRecipientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();

  const [existing] = await db
    .select()
    .from(alertRecipientsTable)
    .where(
      sql`${alertRecipientsTable.eventType} = ${parsed.data.eventType} and lower(${alertRecipientsTable.email}) = ${email}`,
    );

  if (existing) {
    res.status(409).json({ error: "This address is already configured for that alert" });
    return;
  }

  let row: typeof alertRecipientsTable.$inferSelect;
  try {
    [row] = await db
      .insert(alertRecipientsTable)
      .values({ eventType: parsed.data.eventType, email })
      .returning();
  } catch (err) {
    if ((err as { code?: string } | null)?.code === "23505") {
      res.status(409).json({ error: "This address is already configured for that alert" });
      return;
    }
    throw err;
  }

  res.status(201).json(CreateAlertRecipientResponse.parse(toRecipientResponse(row)));
});

router.delete("/alert-recipients/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteAlertRecipientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(alertRecipientsTable).where(eq(alertRecipientsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
