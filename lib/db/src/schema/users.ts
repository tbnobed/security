import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("app_users", {
  // Opaque internal user id (primary key). Historically a Clerk user id; now a
  // locally generated id since auth is self-contained. Field/column name kept as
  // `clerkId`/`clerk_id` to avoid churning the API contract and audit columns.
  clerkId: text("clerk_id").primaryKey(),
  displayName: text("display_name"),
  email: text("email"),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("security"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type AppUser = typeof usersTable.$inferSelect;
