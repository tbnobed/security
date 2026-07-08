import { Router } from "express";
import path from "path";
import fs from "fs";
import { randomBytes } from "crypto";
import { db, appSettingsTable, auditTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  GetBrandingSettingsResponse,
  UpdateBadgeLogoBody,
  UpdateBadgeLogoResponse,
} from "@workspace/api-zod";
import { requireAuth, requireAdmin, getSessionUserId } from "../lib/auth";

const router = Router();

const BADGE_LOGO_KEY = "badge_logo_url";
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB

const ALLOWED_MIMES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function uploadsDir(): string {
  const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(process.cwd(), "../..")
    : process.cwd();
  const dir = path.resolve(workspaceRoot, "artifacts/api-server/uploads");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

async function getBadgeLogoUrl(): Promise<string | null> {
  const [row] = await db
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, BADGE_LOGO_KEY));
  return row?.value ?? null;
}

/** Delete the previously uploaded logo file (if any) so stale files don't pile up. */
function removeLogoFile(url: string | null): void {
  if (!url) return;
  const filename = path.basename(url);
  if (!filename.startsWith("badge-logo_")) return;
  const filepath = path.join(uploadsDir(), filename);
  try {
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  } catch {
    // Non-fatal: an orphaned file is harmless.
  }
}

router.get("/settings/branding", requireAuth, async (_req, res): Promise<void> => {
  const badgeLogoUrl = await getBadgeLogoUrl();
  res.json(GetBrandingSettingsResponse.parse({ badgeLogoUrl }));
});

router.put("/settings/badge-logo", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateBadgeLogoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const match = /^data:(image\/[a-z+.-]+);base64,(.+)$/s.exec(parsed.data.imageData);
  if (!match) {
    res.status(400).json({ error: "Expected a base64 image data URL" });
    return;
  }
  const [, mime, base64] = match;
  const ext = ALLOWED_MIMES[mime!];
  if (!ext) {
    res.status(400).json({ error: "Logo must be a PNG, JPEG, or WebP image" });
    return;
  }

  const buffer = Buffer.from(base64!, "base64");
  if (buffer.length === 0) {
    res.status(400).json({ error: "Empty image data" });
    return;
  }
  if (buffer.length > MAX_LOGO_BYTES) {
    res.status(400).json({ error: "Logo must be 2MB or smaller" });
    return;
  }

  const previousUrl = await getBadgeLogoUrl();

  const filename = `badge-logo_${Date.now()}_${randomBytes(4).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(uploadsDir(), filename), buffer);
  const badgeLogoUrl = `/api/photos/${filename}`;

  await db
    .insert(appSettingsTable)
    .values({ key: BADGE_LOGO_KEY, value: badgeLogoUrl })
    .onConflictDoUpdate({
      target: appSettingsTable.key,
      set: { value: badgeLogoUrl, updatedAt: sql`now()` },
    });

  removeLogoFile(previousUrl);

  const userId = getSessionUserId(req) ?? "unknown";
  await db.insert(auditTable).values({
    eventType: "badge_logo_updated",
    guestName: "—",
    operatorClerkId: userId,
    operatorName: userId,
    metadata: JSON.stringify({ badgeLogoUrl }),
  });

  res.json(UpdateBadgeLogoResponse.parse({ badgeLogoUrl }));
});

router.delete("/settings/badge-logo", requireAdmin, async (req, res): Promise<void> => {
  const previousUrl = await getBadgeLogoUrl();
  if (!previousUrl) {
    res.status(204).end();
    return;
  }

  await db.delete(appSettingsTable).where(eq(appSettingsTable.key, BADGE_LOGO_KEY));
  removeLogoFile(previousUrl);

  const userId = getSessionUserId(req) ?? "unknown";
  await db.insert(auditTable).values({
    eventType: "badge_logo_removed",
    guestName: "—",
    operatorClerkId: userId,
    operatorName: userId,
    metadata: JSON.stringify({ removed: previousUrl }),
  });

  res.status(204).end();
});

export default router;
