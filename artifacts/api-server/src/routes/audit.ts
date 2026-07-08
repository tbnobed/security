import { Router } from "express";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db, auditTable } from "@workspace/db";
import {
  ListAuditLogQueryParams,
  ListAuditLogResponse,
  ExportAuditLogQueryParams,
} from "@workspace/api-zod";
import { requireSupervisor } from "../lib/auth";

const router = Router();

function toAuditResponse(a: typeof auditTable.$inferSelect) {
  return {
    ...a,
    guestId: a.guestId ?? null,
    metadata: a.metadata ?? null,
    timestamp: a.timestamp.toISOString(),
  };
}

router.get("/audit", requireSupervisor, async (req, res): Promise<void> => {
  const parsed = ListAuditLogQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const conditions = [];
  if (parsed.data.startDate) {
    conditions.push(gte(auditTable.timestamp, new Date(parsed.data.startDate + "T00:00:00Z")));
  }
  if (parsed.data.endDate) {
    conditions.push(lte(auditTable.timestamp, new Date(parsed.data.endDate + "T23:59:59Z")));
  }
  if (parsed.data.guestId) {
    conditions.push(eq(auditTable.guestId, parsed.data.guestId));
  }
  if (parsed.data.operatorId) {
    conditions.push(eq(auditTable.operatorClerkId, parsed.data.operatorId));
  }

  const limit = parsed.data.limit ?? 100;

  const entries = await db
    .select()
    .from(auditTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditTable.timestamp))
    .limit(limit);

  res.json(ListAuditLogResponse.parse(entries.map(toAuditResponse)));
});

router.get("/audit/export", requireSupervisor, async (req, res): Promise<void> => {
  const parsed = ExportAuditLogQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const conditions = [
    gte(auditTable.timestamp, new Date(parsed.data.startDate + "T00:00:00Z")),
    lte(auditTable.timestamp, new Date(parsed.data.endDate + "T23:59:59Z")),
  ];

  const entries = await db
    .select()
    .from(auditTable)
    .where(and(...conditions))
    .orderBy(desc(auditTable.timestamp));

  const headers = ["ID", "Event Type", "Guest Name", "Guest ID", "Operator Name", "Operator ID", "Timestamp", "Metadata"];
  const rows = entries.map((e) => [
    e.id,
    e.eventType,
    `"${e.guestName}"`,
    e.guestId ?? "",
    `"${e.operatorName}"`,
    e.operatorClerkId,
    e.timestamp.toISOString(),
    `"${(e.metadata ?? "").replace(/"/g, '""')}"`,
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="audit_${parsed.data.startDate}_${parsed.data.endDate}.csv"`,
  );
  res.send(csv);
});

export default router;
