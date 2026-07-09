import { pgTable, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable(
  "app_users",
  {
    // Opaque internal user id (primary key). Historically a Clerk user id; now a
    // locally generated id since auth is self-contained. Field/column name kept as
    // `clerkId`/`clerk_id` to avoid churning the API contract and audit columns.
    clerkId: text("clerk_id").primaryKey(),
    displayName: text("display_name"),
    email: text("email"),
    passwordHash: text("password_hash"),
    role: text("role").notNull().default("security"),
    // Client-portal accounts (role === "client") only:
    // Company scope (client_companies.id). Multiple client logins may share one
    // company; roster + pre-registration data is scoped by this, not by user.
    // Nullable for lazy migration — requireClient self-heals legacy accounts
    // (creates the company from companyName and backfills owned rows).
    clientCompanyId: integer("client_company_id"),
    // Display name of the company (kept in sync with client_companies.name).
    companyName: text("company_name"),
    notifyEmail: text("notify_email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Case-insensitive email uniqueness enforced at the DB level. NULL emails are
    // permitted and remain distinct (login is by email, so only emailed accounts sign in).
    uniqueIndex("app_users_email_lower_unique").on(sql`lower(${table.email})`),
  ],
);

export const insertUserSchema = createInsertSchema(usersTable).omit({ createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type AppUser = typeof usersTable.$inferSelect;
