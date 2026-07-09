import { pgTable, text, serial, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Client companies: the ownership scope for client-portal data. Multiple
// client-portal logins (app_users role=client) can belong to the same company
// and share one roster + pre-registration view.
export const clientCompaniesTable = pgTable(
  "client_companies",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Case-insensitive company-name uniqueness.
    uniqueIndex("client_companies_name_lower_unique").on(sql`lower(${table.name})`),
  ],
);

export const insertClientCompanySchema = createInsertSchema(clientCompaniesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertClientCompany = z.infer<typeof insertClientCompanySchema>;
export type ClientCompany = typeof clientCompaniesTable.$inferSelect;
