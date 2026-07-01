import { and, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { db, guestsTable, alertRecipientsTable } from "@workspace/db";
import { sendVisitorAlert } from "./alerts";
import { isEmailConfigured } from "./email";
import { logger } from "./logger";

const CHECK_INTERVAL_MS = 60_000;

let running = false;

/**
 * One sweep for newly-overdue guests. An "overdue" guest is active, has an
 * expected departure in the past, and has not yet had an overdue alert sent
 * (tracked via guests.overdueAlertSentAt so each guest is alerted at most once).
 */
async function sweepOverdue(): Promise<void> {
  if (running) return; // avoid overlap if a sweep runs long
  running = true;
  try {
    if (!isEmailConfigured()) return;

    // No point querying/marking guests if nobody is configured to receive them —
    // leaving overdueAlertSentAt null lets recipients added later still get alerts.
    const overdueRecipients = await db
      .select()
      .from(alertRecipientsTable)
      .where(eq(alertRecipientsTable.eventType, "overdue"));
    if (overdueRecipients.length === 0) return;

    const now = new Date();
    const guests = await db
      .select()
      .from(guestsTable)
      .where(
        and(
          eq(guestsTable.status, "active"),
          isNotNull(guestsTable.expectedDeparture),
          lte(guestsTable.expectedDeparture, now),
          isNull(guestsTable.overdueAlertSentAt),
        ),
      );

    for (const guest of guests) {
      const sent = await sendVisitorAlert("overdue", {
        guestName: guest.name,
        company: guest.company,
        hostName: guest.hostName,
        purposeOfVisit: guest.purposeOfVisit,
        site: guest.site,
        studios: guest.studios,
        badgeId: guest.badgeId,
        checkinAt: guest.checkinAt.toISOString(),
        expectedDeparture: guest.expectedDeparture?.toISOString() ?? null,
      });

      // Only mark once delivery is confirmed, so a transient email failure is
      // retried on the next tick instead of silently dropping the alert. One
      // overdue notification per guest is the intended behavior.
      if (sent) {
        await db
          .update(guestsTable)
          .set({ overdueAlertSentAt: new Date() })
          .where(eq(guestsTable.id, guest.id));
      }
    }
  } catch (err) {
    logger.error({ err }, "Overdue alert sweep failed");
  } finally {
    running = false;
  }
}

/** Start the recurring overdue-alert sweep. Safe no-op work when email is off. */
export function startOverdueScheduler(): void {
  const timer = setInterval(() => {
    void sweepOverdue();
  }, CHECK_INTERVAL_MS);
  // Don't keep the process alive solely for this timer.
  timer.unref?.();
  logger.info({ intervalMs: CHECK_INTERVAL_MS }, "Overdue alert scheduler started");
}
