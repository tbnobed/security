import { db, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

/**
 * The app's public origin (e.g. https://sec.obtv.io), learned from
 * AUTHENTICATED requests only and used as a base-URL fallback for approval
 * email links when APP_BASE_URL is not configured.
 *
 * SECURITY: the Host header on unauthenticated requests (public prereg form,
 * token decision page) is attacker-controllable — an injected Host would
 * poison approver emails with attacker-domain links that exfiltrate decision
 * tokens. Only requests carrying a valid operator session may teach us the
 * origin (an attacker cannot authenticate, and a real operator's browser
 * always sends the genuine Host).
 */

const KEY = "app_public_origin";

let cached: string | null = null;
let loaded = false;

export async function loadPublicOrigin(): Promise<void> {
  try {
    const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, KEY));
    cached = row?.value ?? null;
  } catch (err) {
    logger.error({ err }, "loadPublicOrigin failed");
  } finally {
    loaded = true;
  }
}

export function getPublicOrigin(): string | null {
  return cached;
}

/** Record the origin of an authenticated request. Fire-and-forget safe. */
export function notePublicOrigin(origin: string | undefined): void {
  if (!origin || !loaded || origin === cached) return;
  if (!/^https?:\/\/[a-zA-Z0-9.-]+(:\d+)?$/.test(origin)) return;
  logger.info({ from: cached, to: origin }, "Learned public origin updated");
  cached = origin;
  void db
    .insert(appSettingsTable)
    .values({ key: KEY, value: origin })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: origin } })
    .catch((err) => logger.error({ err }, "notePublicOrigin persist failed"));
}
