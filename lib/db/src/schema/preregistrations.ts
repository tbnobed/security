import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const preregistrationsTable = pgTable("preregistrations", {
  id: serial("id").primaryKey(),
  guestName: text("guest_name").notNull(),
  company: text("company").notNull().default(""),
  phone: text("phone"),
  email: text("email"),
  hostName: text("host_name").notNull(),
  purposeOfVisit: text("purpose_of_visit"),
  site: text("site").notNull(),
  expectedArrival: timestamp("expected_arrival", { withTimezone: true }).notNull(),
  expectedDeparture: timestamp("expected_departure", { withTimezone: true }),
  status: text("status").notNull().default("pending"),
  createdByClerkId: text("created_by_clerk_id"),
  // Set when a client-portal account created this pre-registration (visit
  // scoping + check-in notification back to the client).
  clientUserId: text("client_user_id"),
  clientEmployeeId: integer("client_employee_id"),
  convertedGuestId: integer("converted_guest_id"),
  studios: text("studios").array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPreregistrationSchema = createInsertSchema(preregistrationsTable).omit({
  id: true,
  createdAt: true,
  convertedGuestId: true,
});
export type InsertPreregistration = z.infer<typeof insertPreregistrationSchema>;
export type Preregistration = typeof preregistrationsTable.$inferSelect;
