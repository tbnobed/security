import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const guestsTable = pgTable("guests", {
  id: serial("id").primaryKey(),
  badgeId: text("badge_id").notNull().unique(),
  name: text("name").notNull(),
  company: text("company").notNull(),
  phone: text("phone"),
  email: text("email"),
  hostName: text("host_name").notNull(),
  purposeOfVisit: text("purpose_of_visit").notNull(),
  site: text("site").notNull(),
  status: text("status").notNull().default("active"),
  checkinAt: timestamp("checkin_at", { withTimezone: true }).notNull().defaultNow(),
  checkoutAt: timestamp("checkout_at", { withTimezone: true }),
  expectedDeparture: timestamp("expected_departure", { withTimezone: true }),
  photoUrl: text("photo_url"),
  checkedInByClerkId: text("checked_in_by_clerk_id"),
  checkedOutByClerkId: text("checked_out_by_clerk_id"),
  preregistrationId: integer("preregistration_id"),
  studios: text("studios").array().notNull().default(sql`'{}'::text[]`),
});

export const insertGuestSchema = createInsertSchema(guestsTable).omit({
  id: true,
  checkinAt: true,
  checkoutAt: true,
});
export type InsertGuest = z.infer<typeof insertGuestSchema>;
export type Guest = typeof guestsTable.$inferSelect;
