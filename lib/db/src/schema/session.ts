import { pgTable, varchar, json, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Session store table for connect-pg-simple.
 * Shape must match connect-pg-simple's expected columns exactly.
 * Managed here (instead of createTableIfMissing) so it works in the
 * esbuild-bundled Docker build, where the library's table.sql isn't present.
 */
export const sessionTable = pgTable(
  "session",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6, withTimezone: false }).notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);
