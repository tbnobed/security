import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Simple key-value store for app-wide admin-configurable settings
// (e.g. the uploaded badge logo). Values are plain text; JSON-encode if needed.
export const appSettingsTable = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AppSetting = typeof appSettingsTable.$inferSelect;
