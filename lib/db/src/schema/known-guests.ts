import { pgTable, text, serial, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const knownGuestsTable = pgTable(
  "known_guests",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    company: text("company"),
    phone: text("phone"),
    email: text("email"),
    photoUrl: text("photo_url"),
    isVip: boolean("is_vip").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("known_guests_name_lower_idx").on(sql`lower(${table.name})`)],
);

export const insertKnownGuestSchema = createInsertSchema(knownGuestsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertKnownGuest = z.infer<typeof insertKnownGuestSchema>;
export type KnownGuest = typeof knownGuestsTable.$inferSelect;
