import { eq } from "drizzle-orm";
import { db, alertRecipientsTable } from "@workspace/db";
import { sendMail, isEmailConfigured } from "./email";
import { logger } from "./logger";

export type AlertEventType = "preregistration" | "checkin" | "checkout" | "overdue";

export interface AlertContext {
  guestName: string;
  company?: string | null;
  hostName?: string | null;
  purposeOfVisit?: string | null;
  site?: string | null;
  studios?: string[] | null;
  badgeId?: string | null;
  operatorName?: string | null;
  /** ISO strings for the relevant timestamps, when applicable. */
  expectedArrival?: string | null;
  expectedDeparture?: string | null;
  checkinAt?: string | null;
  checkoutAt?: string | null;
}

const EVENT_LABELS: Record<AlertEventType, string> = {
  preregistration: "Pre-Registration",
  checkin: "Guest Check-In",
  checkout: "Guest Check-Out",
  overdue: "Overdue Guest",
};

function fmt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function buildBody(eventType: AlertEventType, ctx: AlertContext): { subject: string; text: string; html: string } {
  const label = EVENT_LABELS[eventType];
  const lines: [string, string | null | undefined][] = [
    ["Guest", ctx.guestName],
    ["Company", ctx.company],
    ["Host", ctx.hostName],
    ["Purpose", ctx.purposeOfVisit],
    ["Site", ctx.site],
    ["Studios", ctx.studios && ctx.studios.length > 0 ? ctx.studios.join(", ") : null],
    ["Badge ID", ctx.badgeId],
    ["Expected arrival", fmt(ctx.expectedArrival)],
    ["Expected departure", fmt(ctx.expectedDeparture)],
    ["Checked in", fmt(ctx.checkinAt)],
    ["Checked out", fmt(ctx.checkoutAt)],
    ["Operator", ctx.operatorName],
  ];

  const present = lines.filter(([, v]) => v != null && String(v).length > 0) as [string, string][];

  const headline =
    eventType === "overdue"
      ? `Overdue: ${ctx.guestName} has not checked out`
      : `${label}: ${ctx.guestName}`;

  const subject = `[FrontDesk] ${headline}`;

  const text = [headline, "", ...present.map(([k, v]) => `${k}: ${v}`), "", "— FrontDesk Guest Management"].join("\n");

  const rows = present
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#64748b;font-weight:600;white-space:nowrap;">${k}</td><td style="padding:4px 0;color:#0f172a;">${escapeHtml(v)}</td></tr>`,
    )
    .join("");

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;">
  <h2 style="margin:0 0 4px;font-size:18px;color:#0f172a;">${escapeHtml(headline)}</h2>
  <p style="margin:0 0 16px;color:#64748b;font-size:13px;">${label} alert from FrontDesk Guest Management</p>
  <table style="border-collapse:collapse;font-size:14px;">${rows}</table>
</div>`;

  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Send an alert email for a visitor event to every recipient configured for
 * that event type. Fire-and-forget safe: never throws, and no-ops when email
 * is unconfigured or no recipients exist for the event type.
 */
export async function sendVisitorAlert(eventType: AlertEventType, ctx: AlertContext): Promise<void> {
  try {
    if (!isEmailConfigured()) return;

    const recipients = await db
      .select()
      .from(alertRecipientsTable)
      .where(eq(alertRecipientsTable.eventType, eventType));

    const to = recipients.map((r) => r.email);
    if (to.length === 0) return;

    const { subject, text, html } = buildBody(eventType, ctx);
    const ok = await sendMail({ to, subject, text, html });
    if (ok) {
      logger.info({ eventType, count: to.length }, "Sent visitor alert email");
    }
  } catch (err) {
    logger.error({ err, eventType }, "sendVisitorAlert failed");
  }
}
