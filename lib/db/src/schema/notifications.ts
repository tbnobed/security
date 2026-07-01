import { pgTable, text, serial, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Recipient email addresses for visitor-event alerts. One row per
 * (eventType, email). An event type with zero rows is effectively disabled —
 * no alert is sent for it.
 */
export const alertRecipientsTable = pgTable(
  "alert_recipients",
  {
    id: serial("id").primaryKey(),
    eventType: text("event_type").notNull(),
    email: text("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A given address is only listed once per event type (case-insensitive).
    uniqueIndex("alert_recipients_type_email_unique").on(
      table.eventType,
      sql`lower(${table.email})`,
    ),
  ],
);

export const insertAlertRecipientSchema = createInsertSchema(alertRecipientsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAlertRecipient = z.infer<typeof insertAlertRecipientSchema>;
export type AlertRecipient = typeof alertRecipientsTable.$inferSelect;
