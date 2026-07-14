import { and, eq, sql } from "drizzle-orm";
import { db, guestsTable, appSettingsTable, auditTable } from "@workspace/db";
import { logger } from "./logger";

const CHECK_INTERVAL_MS = 60_000;

export const AUTO_CHECKOUT_TIME_KEY = "auto_checkout_time";
export const AUTO_CHECKOUT_LAST_RUN_KEY = "auto_checkout_last_run_date";

export const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

let running = false;

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key));
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(appSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({
      target: appSettingsTable.key,
      set: { value, updatedAt: sql`now()` },
    });
}

/** Server-local YYYY-MM-DD (TZ env controls the deployment's local day). */
export function localDateStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Server-local HH:MM. */
export function localTimeStr(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * One sweep: if a nightly auto check-out time is configured, the local time
 * has passed it, and it hasn't already run today, check out every active
 * guest and audit each one. The last-run date is stamped up front so an
 * unexpected crash mid-sweep can't cause a duplicate mass checkout; each
 * guest update is independent.
 */
async function sweepAutoCheckout(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const configured = await getSetting(AUTO_CHECKOUT_TIME_KEY);
    if (!configured || !TIME_RE.test(configured)) return;

    const now = new Date();
    const today = localDateStr(now);
    if (localTimeStr(now) < configured) return;

    const lastRun = await getSetting(AUTO_CHECKOUT_LAST_RUN_KEY);
    if (lastRun === today) return;

    await setSetting(AUTO_CHECKOUT_LAST_RUN_KEY, today);

    const active = await db.select().from(guestsTable).where(eq(guestsTable.status, "active"));
    let checkedOut = 0;
    for (const guest of active) {
      // Conditional update: skip (and don't audit) if someone checked the
      // guest out manually between the select and this update.
      const updated = await db
        .update(guestsTable)
        .set({ status: "checked_out", checkoutAt: new Date() })
        .where(and(eq(guestsTable.id, guest.id), eq(guestsTable.status, "active")))
        .returning({ id: guestsTable.id });
      if (updated.length === 0) continue;
      await db.insert(auditTable).values({
        eventType: "auto_checkout",
        guestId: guest.id,
        guestName: guest.name,
        operatorClerkId: "system",
        operatorName: "Auto check-out",
        metadata: JSON.stringify({ badgeId: guest.badgeId, scheduledTime: configured }),
      });
      checkedOut++;
    }
    if (checkedOut > 0) {
      logger.info({ checkedOut, scheduledTime: configured }, "Nightly auto check-out completed");
    }
  } catch (err) {
    logger.error({ err }, "Auto check-out sweep failed");
  } finally {
    running = false;
  }
}

/** Start the recurring nightly auto check-out sweep (no-op when unconfigured). */
export function startAutoCheckoutScheduler(): void {
  const timer = setInterval(() => {
    void sweepAutoCheckout();
  }, CHECK_INTERVAL_MS);
  timer.unref?.();
  logger.info({ intervalMs: CHECK_INTERVAL_MS }, "Auto check-out scheduler started");
}
