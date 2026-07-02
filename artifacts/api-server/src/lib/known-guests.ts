import { sql } from "drizzle-orm";
import { db, knownGuestsTable } from "@workspace/db";
import { logger } from "./logger";

interface KnownGuestSnapshot {
  name: string;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  photoUrl?: string | null;
}

export async function upsertKnownGuest(snapshot: KnownGuestSnapshot): Promise<void> {
  const name = snapshot.name.trim();
  if (!name) return;
  const company = snapshot.company?.trim() || null;
  const phone = snapshot.phone?.trim() || null;
  const email = snapshot.email?.trim() || null;
  const photoUrl = snapshot.photoUrl?.trim() || null;
  try {
    // Single atomic statement so concurrent check-ins for the same name can
    // never lose a snapshot (conflict target matches the lower(name) unique index).
    // New non-null values win; otherwise the existing profile value is kept.
    await db.execute(sql`
      INSERT INTO ${knownGuestsTable} (name, company, phone, email, photo_url)
      VALUES (${name}, ${company}, ${phone}, ${email}, ${photoUrl})
      ON CONFLICT (lower(name)) DO UPDATE SET
        name = EXCLUDED.name,
        company = COALESCE(EXCLUDED.company, ${knownGuestsTable}.company),
        phone = COALESCE(EXCLUDED.phone, ${knownGuestsTable}.phone),
        email = COALESCE(EXCLUDED.email, ${knownGuestsTable}.email),
        photo_url = COALESCE(EXCLUDED.photo_url, ${knownGuestsTable}.photo_url),
        updated_at = now()
    `);
  } catch (err) {
    // Never let profile bookkeeping break a check-in.
    logger.warn({ err, name }, "known guest upsert failed");
  }
}
