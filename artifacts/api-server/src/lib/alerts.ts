import { eq } from "drizzle-orm";
import { db, alertRecipientsTable, usersTable } from "@workspace/db";
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
  // Server-local timezone — controlled by the TZ env var on the api container.
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
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
 * Notify a client-portal account that one of their employees has checked in.
 * Sends to the client's notifyEmail (falling back to their login email).
 * Fire-and-forget safe: never throws, no-ops when unconfigured.
 */
export async function sendClientCheckinNotification(
  clientUserId: string,
  ctx: AlertContext,
): Promise<boolean> {
  try {
    if (!isEmailConfigured()) return false;

    const [client] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clientUserId));
    const to = client?.notifyEmail ?? client?.email;
    if (!client || client.role !== "client" || !to) return false;

    const { text, html } = buildBody("checkin", ctx);
    const subject = `[FrontDesk] ${ctx.guestName} has checked in`;
    const ok = await sendMail({ to: [to], subject, text, html });
    if (ok) {
      logger.info({ clientUserId }, "Sent client check-in notification");
    }
    return ok;
  } catch (err) {
    logger.error({ err, clientUserId }, "sendClientCheckinNotification failed");
    return false;
  }
}

/**
 * Notify the visit host directly that their guest has arrived. Sends to the
 * hostEmail captured on the check-in / pre-registration. Fire-and-forget safe:
 * never throws, no-ops when unconfigured or no host email present.
 */
export async function sendHostArrivalNotification(
  hostEmail: string | null | undefined,
  ctx: AlertContext,
): Promise<boolean> {
  try {
    if (!isEmailConfigured()) return false;
    const to = hostEmail?.trim();
    if (!to) return false;

    const { html } = buildBody("checkin", ctx);
    const subject = `[FrontDesk] Your guest ${ctx.guestName} has arrived`;
    const intro = `Hi${ctx.hostName ? ` ${ctx.hostName}` : ""}, your guest ${ctx.guestName} has just checked in at the security desk.`;
    const text = [intro, "", `Guest: ${ctx.guestName}`, ctx.company ? `Company: ${ctx.company}` : null, ctx.badgeId ? `Badge ID: ${ctx.badgeId}` : null, ctx.checkinAt ? `Checked in: ${fmt(ctx.checkinAt)}` : null, "", "— FrontDesk Guest Management"]
      .filter((l): l is string => l != null)
      .join("\n");
    const fullHtml = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;"><p style="margin:0 0 12px;color:#0f172a;font-size:14px;">${escapeHtml(intro)}</p>${html}</div>`;
    const ok = await sendMail({ to: [to], subject, text, html: fullHtml });
    if (ok) {
      logger.info("Sent host arrival notification");
    }
    return ok;
  } catch (err) {
    logger.error({ err }, "sendHostArrivalNotification failed");
    return false;
  }
}

/**
 * Send an alert email for a visitor event to every recipient configured for
 * that event type. Fire-and-forget safe: never throws, and no-ops when email
 * is unconfigured or no recipients exist for the event type.
 *
 * Returns true only when a message was actually accepted for delivery. Callers
 * that dedupe (e.g. the overdue scheduler) must only mark a send as done when
 * this returns true, so transient failures are retried rather than lost.
 */
export async function sendVisitorAlert(eventType: AlertEventType, ctx: AlertContext): Promise<boolean> {
  try {
    if (!isEmailConfigured()) return false;

    const recipients = await db
      .select()
      .from(alertRecipientsTable)
      .where(eq(alertRecipientsTable.eventType, eventType));

    const to = recipients.map((r) => r.email);
    if (to.length === 0) return false;

    const { subject, text, html } = buildBody(eventType, ctx);
    const ok = await sendMail({ to, subject, text, html });
    if (ok) {
      logger.info({ eventType, count: to.length }, "Sent visitor alert email");
    }
    return ok;
  } catch (err) {
    logger.error({ err, eventType }, "sendVisitorAlert failed");
    return false;
  }
}
