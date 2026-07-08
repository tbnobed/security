import sgMail from "@sendgrid/mail";
import { logger } from "./logger";

/**
 * Direct SendGrid integration (no Replit connector proxy) so it works
 * identically in Replit dev and in the self-hosted Docker deployment.
 * Both values are supplied purely via environment variables:
 *   - SENDGRID_API_KEY   the SendGrid API key
 *   - SENDGRID_FROM_EMAIL a verified sender address to send from
 * If either is missing, email is treated as disabled and all sends no-op.
 */

const apiKey = process.env.SENDGRID_API_KEY;
const fromEmail = process.env.SENDGRID_FROM_EMAIL;

let configured = false;
if (apiKey && fromEmail) {
  sgMail.setApiKey(apiKey);
  configured = true;
  if (!process.env.APP_BASE_URL && !process.env.REPLIT_DEV_DOMAIN) {
    logger.warn(
      "APP_BASE_URL is not set — approval emails will fall back to the app URL learned from operator sign-ins for Approve/Deny links (until an operator has signed in at least once, emails omit the buttons). Set APP_BASE_URL (e.g. https://sec.obtv.io) to pin the public URL explicitly.",
    );
  }
} else {
  logger.warn(
    "SendGrid not configured (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL missing); visitor email alerts are disabled.",
  );
}

export function isEmailConfigured(): boolean {
  return configured;
}

export function getFromEmail(): string | null {
  return fromEmail ?? null;
}

export interface SendMailOptions {
  to: string[];
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send an email via SendGrid. Never throws — failures are logged and swallowed
 * so a mail outage can never break a check-in/checkout request. Returns true
 * when the message was accepted for delivery.
 */
export async function sendMail(opts: SendMailOptions): Promise<boolean> {
  if (!configured || !fromEmail) {
    return false;
  }
  const to = opts.to.filter((addr) => addr.trim().length > 0);
  if (to.length === 0) {
    return false;
  }
  try {
    await sgMail.sendMultiple({
      to,
      from: fromEmail,
      subject: opts.subject,
      text: opts.text,
      ...(opts.html ? { html: opts.html } : {}),
    });
    return true;
  } catch (err) {
    logger.error({ err, subject: opts.subject }, "Failed to send email alert");
    return false;
  }
}
