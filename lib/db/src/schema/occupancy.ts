import { pgTable, text, serial, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Building occupancy pushed by the external access-control bridge (e.g. the
// Maxxess bridge utility running on the customer LAN). The whole table is a
// SNAPSHOT: each bridge push replaces all rows atomically. Rows are
// cardholders (staff/contractors) — visitors are tracked separately in guests.
export const buildingOccupancyTable = pgTable("building_occupancy", {
  id: serial("id").primaryKey(),
  cardholderName: text("cardholder_name").notNull(),
  cardNumber: text("card_number"),
  department: text("department"),
  // Last door/reader the cardholder was seen at, per the access system.
  location: text("location"),
  // When they entered / were last seen, per the access system.
  sinceAt: timestamp("since_at", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

// Recent door entry/exit events pushed by the bridge. Append-only with
// dedupe on the source system's event id; pruned to a retention window on
// each ingest so the table stays bounded.
export const accessEventsTable = pgTable(
  "access_events",
  {
    id: serial("id").primaryKey(),
    // Unique id from the source system (dedupe key across bridge retries).
    externalId: text("external_id").notNull(),
    cardholderName: text("cardholder_name").notNull(),
    cardNumber: text("card_number"),
    door: text("door").notNull(),
    // "in" | "out" | "unknown"
    direction: text("direction").notNull().default("unknown"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("access_events_external_id_unique").on(table.externalId)],
);

export type BuildingOccupant = typeof buildingOccupancyTable.$inferSelect;
export type AccessEvent = typeof accessEventsTable.$inferSelect;
