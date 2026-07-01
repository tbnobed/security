import { pgTable, text, serial, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const studiosTable = pgTable(
  "studios",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Case-insensitive uniqueness so "Studio A" and "studio a" can't both exist.
    uniqueIndex("studios_name_lower_unique").on(sql`lower(${table.name})`),
  ],
);

export const insertStudioSchema = createInsertSchema(studiosTable).omit({
  id: true,
  createdAt: true,
});
export type InsertStudio = z.infer<typeof insertStudioSchema>;
export type Studio = typeof studiosTable.$inferSelect;
