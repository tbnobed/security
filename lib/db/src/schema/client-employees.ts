import { pgTable, text, serial, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientEmployeesTable = pgTable(
  "client_employees",
  {
    id: serial("id").primaryKey(),
    // The client account (app_users.clerk_id) that owns this roster entry.
    clientUserId: text("client_user_id").notNull(),
    name: text("name").notNull(),
    title: text("title"),
    phone: text("phone"),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Case-insensitive per-client name uniqueness.
    uniqueIndex("client_employees_owner_name_lower_unique").on(
      table.clientUserId,
      sql`lower(${table.name})`,
    ),
  ],
);

export const insertClientEmployeeSchema = createInsertSchema(clientEmployeesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertClientEmployee = z.infer<typeof insertClientEmployeeSchema>;
export type ClientEmployee = typeof clientEmployeesTable.$inferSelect;
