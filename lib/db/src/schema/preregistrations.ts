import { pgTable, text, serial, timestamp, integer, boolean, uniqueIndex } from "drizzle-orm/pg-core";
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
  hostEmail: text("host_email"),
  purposeOfVisit: text("purpose_of_visit"),
  site: text("site").notNull(),
  expectedArrival: timestamp("expected_arrival", { withTimezone: true }).notNull(),
  expectedDeparture: timestamp("expected_departure", { withTimezone: true }),
  status: text("status").notNull().default("pending"),
  createdByClerkId: text("created_by_clerk_id"),
  // Set when a client-portal account created this pre-registration.
  // clientCompanyId is the visit-scoping key (shared across all logins of the
  // company); clientUserId records which login created it (attribution +
  // check-in notification back to that client).
  clientCompanyId: integer("client_company_id"),
  clientUserId: text("client_user_id"),
  clientEmployeeId: integer("client_employee_id"),
  convertedGuestId: integer("converted_guest_id"),
  // Unique fast-track code for QR check-in at the desk (e.g. "FT-A1B2C3").
  fastTrackCode: text("fast_track_code"),
  studios: text("studios").array().notNull().default(sql`'{}'::text[]`),
  // Approval workflow. "approved" (default — bypass when no workflow configured),
  // "pending" (awaiting the stage-N approver), or "denied". Approvers are
  // snapshotted at creation so config changes don't affect in-flight requests.
  approvalStatus: text("approval_status").notNull().default("approved"),
  approvalStage: integer("approval_stage"), // 1 | 2 while pending
  approver1Id: text("approver1_id"),
  approver2Id: text("approver2_id"),
  // Unguessable single-use tokens for the email one-click approve/deny pages.
  approval1Token: text("approval1_token"),
  approval2Token: text("approval2_token"),
  approval1DecidedAt: timestamp("approval1_decided_at", { withTimezone: true }),
  approvalDecidedById: text("approval_decided_by_id"),
  approvalDecidedAt: timestamp("approval_decided_at", { withTimezone: true }),
  // Registered less than the pre-approval threshold (4h) before expected arrival.
  lateRegistration: boolean("late_registration").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // A colliding fast-track code could resolve a scan to the wrong guest —
  // enforce uniqueness at the DB level (NULLs are distinct, so rows without
  // a code are unaffected). Inserts retry with a fresh code on violation.
  uniqueIndex("preregistrations_fast_track_code_unique").on(table.fastTrackCode),
]);

export const insertPreregistrationSchema = createInsertSchema(preregistrationsTable).omit({
  id: true,
  createdAt: true,
  convertedGuestId: true,
});
export type InsertPreregistration = z.infer<typeof insertPreregistrationSchema>;
export type Preregistration = typeof preregistrationsTable.$inferSelect;
