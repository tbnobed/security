import QRCode from "qrcode";
import { db, preregistrationsTable } from "@workspace/db";
import { generateFastTrackCode } from "./badge";
import { sendMail, isEmailConfigured } from "./email";
import { logger } from "./logger";

type Prereg = typeof preregistrationsTable.$inferSelect;
type PreregInsert = typeof preregistrationsTable.$inferInsert;
export type PreregInsertWithoutCode = Omit<PreregInsert, "fastTrackCode">;

/**
 * True when the error is a unique violation on the fast-track-code index —
 * an astronomically rare random collision. Callers retry the insert with a
 * freshly generated code.
 */
function isFastTrackCodeCollision(err: unknown): boolean {
  const e = err as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  } | null;
  const code = e?.code ?? e?.cause?.code;
  const constraint = e?.constraint ?? e?.cause?.constraint ?? "";
  return code === "23505" && constraint.includes("fast_track_code");
}

const MAX_CODE_RETRIES = 3;

/**
 * Insert pre-registration rows, generating a fast-track code per row. If the
 * DB unique index on fast_track_code rejects a (vanishingly rare) collision,
 * the whole insert retries with fresh codes. Any other error propagates.
 */
export async function insertPreregsWithFastTrackCodes(
  rows: PreregInsertWithoutCode[],
): Promise<Prereg[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db
        .insert(preregistrationsTable)
        .values(rows.map((row) => ({ ...row, fastTrackCode: generateFastTrackCode() })))
        .returning();
    } catch (err) {
      if (attempt < MAX_CODE_RETRIES && isFastTrackCodeCollision(err)) {
        logger.warn({ attempt }, "Fast-track code collision — retrying insert with fresh codes");
        continue;
      }
      throw err;
    }
  }
}

/** Single-row convenience wrapper around {@link insertPreregsWithFastTrackCodes}. */
export async function insertPreregWithFastTrackCode(
  row: PreregInsertWithoutCode,
): Promise<Prereg> {
  const [preg] = await insertPreregsWithFastTrackCodes([row]);
  return preg;
}

function fmtWhen(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Email the guest their fast-track QR code once the pre-registration is
 * cleared for check-in (created auto-approved, or final approval granted).
 * Fire-and-forget safe: never throws, no-ops when email is unconfigured,
 * the prereg has no guest email, or no fast-track code was assigned.
 */
export async function sendFastTrackEmail(preg: Prereg): Promise<boolean> {
  try {
    if (!isEmailConfigured()) return false;
    const to = preg.email?.trim();
    if (!to || !preg.fastTrackCode) return false;

    const qrPngBase64 = (
      await QRCode.toBuffer(preg.fastTrackCode, {
        type: "png",
        width: 360,
        margin: 2,
        errorCorrectionLevel: "M",
      })
    ).toString("base64");

    const subject = `[FrontDesk] Fast-track check-in code for your visit`;
    const intro = `Hi ${preg.guestName}, you're pre-registered to visit ${preg.hostName} (expected ${fmtWhen(preg.expectedArrival)}).`;
    const text = [
      intro,
      "",
      "Show this fast-track code at the security desk for a quicker check-in:",
      "",
      `    ${preg.fastTrackCode}`,
      "",
      "The QR version of the code is attached to this email.",
      "",
      "— FrontDesk Guest Management",
    ].join("\n");
    const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;">
  <p style="margin:0 0 12px;color:#0f172a;font-size:14px;">${escapeHtml(intro)}</p>
  <p style="margin:0 0 12px;color:#0f172a;font-size:14px;">Show this QR code at the security desk for a quicker check-in:</p>
  <img src="cid:fasttrack-qr" alt="Fast-track QR code" width="180" height="180" style="display:block;margin:0 0 12px;" />
  <p style="margin:0 0 4px;color:#64748b;font-size:12px;">Or give the officer this code:</p>
  <p style="margin:0 0 16px;font-family:ui-monospace,monospace;font-size:20px;font-weight:700;letter-spacing:2px;color:#0f172a;">${escapeHtml(preg.fastTrackCode)}</p>
  <p style="margin:0;color:#94a3b8;font-size:12px;">— FrontDesk Guest Management</p>
</div>`;

    const ok = await sendMail({
      to: [to],
      subject,
      text,
      html,
      attachments: [
        {
          content: qrPngBase64,
          filename: "fast-track-qr.png",
          type: "image/png",
          disposition: "inline",
          contentId: "fasttrack-qr",
        },
      ],
    });
    if (ok) {
      logger.info({ preregId: preg.id }, "Sent fast-track QR email");
    }
    return ok;
  } catch (err) {
    logger.error({ err, preregId: preg.id }, "sendFastTrackEmail failed");
    return false;
  }
}
