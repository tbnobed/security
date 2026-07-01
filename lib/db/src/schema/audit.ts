import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const auditTable = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  guestId: integer("guest_id"),
  guestName: text("guest_name").notNull(),
  operatorClerkId: text("operator_clerk_id").notNull(),
  operatorName: text("operator_name").notNull(),
  metadata: text("metadata"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAuditSchema = createInsertSchema(auditTable).omit({
  id: true,
  timestamp: true,
});
export type InsertAudit = z.infer<typeof insertAuditSchema>;
export type AuditEntry = typeof auditTable.$inferSelect;
