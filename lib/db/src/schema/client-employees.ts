import { pgTable, text, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientEmployeesTable = pgTable(
  "client_employees",
  {
    id: serial("id").primaryKey(),
    // Owning company (client_companies.id) — the scope for all roster queries.
    // Nullable only for legacy rows awaiting the requireClient lazy backfill.
    clientCompanyId: integer("client_company_id"),
    // The client account (app_users.clerk_id) that created this roster entry
    // (attribution only — ownership is by company).
    clientUserId: text("client_user_id").notNull(),
    name: text("name").notNull(),
    title: text("title"),
    phone: text("phone"),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Case-insensitive per-company name uniqueness (NULL company rows are
    // legacy/unmigrated and treated as distinct by Postgres).
    uniqueIndex("client_employees_company_name_lower_unique").on(
      table.clientCompanyId,
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
