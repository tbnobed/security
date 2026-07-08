import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, appSettingsTable, preregistrationsTable, usersTable, auditTable } from "@workspace/db";
import { isEmailConfigured, sendMail } from "./email";
import { logger } from "./logger";
import { getPublicOrigin } from "./public-origin";

/**
 * Pre-registration approval workflow.
 *
 * - Workflow config (up to two sequential approvers, both existing FrontDesk
 *   users) lives in the app_settings KV table. No approver1 = approvals
 *   disabled and every pre-registration is auto-approved (bypass).
 * - Approvers are SNAPSHOTTED onto each pre-registration at creation time so
 *   later config changes never affect in-flight requests.
 * - Sequential: approver 2 is only notified after approver 1 approves.
 * - Decisions can be made in-app (Approvals page) or via single-use email
 *   tokens that open a public decision page (the page POSTs — links never
 *   decide on GET, so mail-scanner prefetch can't approve anything).
 * - "Late" registrations (< 4h before expected arrival) are accepted and
 *   flagged so approvers can prioritise them.
 */

export const APPROVER1_KEY = "approval_approver1_id";
export const APPROVER2_KEY = "approval_approver2_id";
export const LATE_THRESHOLD_MS = 4 * 60 * 60 * 1000;

export interface WorkflowConfig {
  approver1Id: string | null;
  approver2Id: string | null;
}

export async function getWorkflowConfig(): Promise<WorkflowConfig> {
  const rows = await db
    .select()
    .from(appSettingsTable)
    .where(sql`${appSettingsTable.key} IN (${APPROVER1_KEY}, ${APPROVER2_KEY})`);
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    approver1Id: map.get(APPROVER1_KEY) || null,
    approver2Id: map.get(APPROVER2_KEY) || null,
  };
}

export async function setWorkflowConfig(config: WorkflowConfig): Promise<void> {
  for (const [key, value] of [
    [APPROVER1_KEY, config.approver1Id],
    [APPROVER2_KEY, config.approver2Id],
  ] as const) {
    if (value) {
      await db
        .insert(appSettingsTable)
        .values({ key, value, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: appSettingsTable.key,
          set: { value, updatedAt: new Date() },
        });
    } else {
      await db.delete(appSettingsTable).where(eq(appSettingsTable.key, key));
    }
  }
}

export function isLateRegistration(expectedArrival: Date, now = new Date()): boolean {
  return expectedArrival.getTime() - now.getTime() < LATE_THRESHOLD_MS;
}

type PreregInsertFields = Partial<typeof preregistrationsTable.$inferInsert>;

/**
 * Compute the approval-related insert fields for a new pre-registration.
 * Call with the current workflow config; spread the result into the insert.
 */
export function buildApprovalFields(expectedArrival: Date, wf: WorkflowConfig): PreregInsertFields {
  const late = isLateRegistration(expectedArrival);
  if (!wf.approver1Id) {
    // No workflow configured — auto-approved bypass.
    return { approvalStatus: "approved", lateRegistration: late };
  }
  return {
    approvalStatus: "pending",
    approvalStage: 1,
    approver1Id: wf.approver1Id,
    approver2Id: wf.approver2Id ?? null,
    approval1Token: randomUUID(),
    approval2Token: wf.approver2Id ? randomUUID() : null,
    lateRegistration: late,
  };
}

type Prereg = typeof preregistrationsTable.$inferSelect;

function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const dev = process.env.REPLIT_DEV_DOMAIN;
  if (dev) return `https://${dev}`;
  // Fallback: origin learned from authenticated operator requests (never from
  // unauthenticated ones — Host-header injection would poison email links).
  const learned = getPublicOrigin();
  if (learned) return learned.replace(/\/$/, "");
  return "";
}

function fmtWhen(d: Date): string {
  // Formats in the server's local timezone — set the TZ env var (e.g.
  // TZ=America/Los_Angeles) on the api container to control this.
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

async function getUserName(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const [u] = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId));
  return u?.displayName ?? u?.email ?? null;
}

/**
 * Email the approver for the given stage their one-click decision link.
 * Fire-and-forget safe: never throws.
 */
export async function notifyStageApprover(preg: Prereg, stage: 1 | 2): Promise<void> {
  try {
    if (!isEmailConfigured()) return;
    const approverId = stage === 1 ? preg.approver1Id : preg.approver2Id;
    const token = stage === 1 ? preg.approval1Token : preg.approval2Token;
    if (!approverId || !token) return;

    const [approver] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, approverId));
    if (!approver?.email) return;

    const base = appBaseUrl();
    const link = base ? `${base}/approval/${token}` : null;
    const approveLink = link ? `${link}?action=approve` : null;
    const denyLink = link ? `${link}?action=deny` : null;
    const lateLine = preg.lateRegistration
      ? "\n⚠ LATE REGISTRATION — expected arrival is less than 4 hours away.\n"
      : "";
    const lines = [
      `A pre-registration is awaiting your approval (step ${stage}).`,
      lateLine,
      `Guest: ${preg.guestName}`,
      preg.company ? `Company: ${preg.company}` : null,
      `Host: ${preg.hostName}`,
      preg.purposeOfVisit ? `Purpose: ${preg.purposeOfVisit}` : null,
      preg.studios.length > 0 ? `Studios: ${preg.studios.join(", ")}` : null,
      `Expected arrival: ${fmtWhen(preg.expectedArrival)}`,
      "",
      ...(link
        ? [`Approve: ${approveLink}`, `Deny: ${denyLink}`]
        : ["Sign in to FrontDesk and open the Approvals page to decide."]),
    ].filter((l): l is string => l !== null);

    const esc = (l: string) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const bodyHtml = lines
      .filter((l) => !l.startsWith("Approve: ") && !l.startsWith("Deny: "))
      .map((l) => `<p style="margin:2px 0">${esc(l)}</p>`)
      .join("");
    const buttonsHtml = link
      ? `<p style="margin:16px 0">` +
        `<a href="${approveLink}" style="background:#059669;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;margin-right:12px">&#10003; Approve</a>` +
        `<a href="${denyLink}" style="background:#dc2626;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">&#10007; Deny</a>` +
        `</p><p style="margin:2px 0;font-size:12px;color:#6b7280">You'll be asked to confirm on the next page.</p>`
      : "";

    await sendMail({
      to: [approver.email],
      subject: `[FrontDesk] Approval needed: ${preg.guestName} (${fmtWhen(preg.expectedArrival)})`,
      text: lines.join("\n"),
      html: `<div style="font-family:sans-serif;font-size:14px;line-height:1.6">${bodyHtml}${buttonsHtml}</div>`,
    });
  } catch (err) {
    logger.error({ err, preregId: preg.id, stage }, "notifyStageApprover failed");
  }
}

/** Notify the requester (client portal account, else the guest's own email) of the outcome. */
async function notifyRequester(preg: Prereg, outcome: "approved" | "denied"): Promise<void> {
  try {
    if (!isEmailConfigured()) return;
    let to: string | null = null;
    if (preg.clientUserId) {
      const [client] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.clerkId, preg.clientUserId));
      to = client?.notifyEmail ?? client?.email ?? null;
    } else if (preg.email) {
      to = preg.email;
    }
    if (!to) return;

    const verb = outcome === "approved" ? "approved" : "denied";
    const text = [
      `The pre-registration for ${preg.guestName} (expected ${fmtWhen(preg.expectedArrival)}) has been ${verb}.`,
      outcome === "approved"
        ? "The visitor is cleared to check in at the security desk on arrival."
        : "The visitor will not be admitted. Contact your host for details.",
    ].join("\n\n");
    await sendMail({
      to: [to],
      subject: `[FrontDesk] Pre-registration ${verb}: ${preg.guestName}`,
      text,
    });
  } catch (err) {
    logger.error({ err, preregId: preg.id }, "notifyRequester failed");
  }
}

export type DecisionResult = "approved" | "denied" | "advanced" | "conflict";

/**
 * Apply an approve/deny decision for the given stage. Concurrency-safe: the
 * underlying UPDATE is conditional on (approvalStatus='pending' AND
 * approvalStage=stage), so a double-click / race yields "conflict".
 */
export async function applyDecision(opts: {
  preg: Prereg;
  stage: 1 | 2;
  action: "approve" | "deny";
  decidedById: string;
  decidedByName: string;
  viaToken?: boolean;
}): Promise<{ result: DecisionResult; updated: Prereg | null }> {
  const { preg, stage, action } = opts;
  const now = new Date();
  const guard = and(
    eq(preregistrationsTable.id, preg.id),
    eq(preregistrationsTable.approvalStatus, "pending"),
    eq(preregistrationsTable.approvalStage, stage),
  );

  let updated: Prereg | undefined;
  let result: DecisionResult;

  if (action === "deny") {
    [updated] = await db
      .update(preregistrationsTable)
      .set({
        approvalStatus: "denied",
        approvalDecidedById: opts.decidedById,
        approvalDecidedAt: now,
        ...(stage === 1 ? { approval1DecidedAt: now } : {}),
      })
      .where(guard)
      .returning();
    result = "denied";
  } else if (stage === 1 && preg.approver2Id) {
    [updated] = await db
      .update(preregistrationsTable)
      .set({ approvalStage: 2, approval1DecidedAt: now })
      .where(guard)
      .returning();
    result = "advanced";
  } else {
    [updated] = await db
      .update(preregistrationsTable)
      .set({
        approvalStatus: "approved",
        approvalDecidedById: opts.decidedById,
        approvalDecidedAt: now,
        ...(stage === 1 ? { approval1DecidedAt: now } : {}),
      })
      .where(guard)
      .returning();
    result = "approved";
  }

  if (!updated) {
    return { result: "conflict", updated: null };
  }

  await db.insert(auditTable).values({
    eventType: action === "approve" ? "prereg_approved" : "prereg_denied",
    guestId: null,
    guestName: preg.guestName,
    operatorClerkId: opts.decidedById,
    operatorName: opts.decidedByName,
    metadata: JSON.stringify({
      preregistrationId: preg.id,
      stage,
      viaToken: opts.viaToken ?? false,
      ...(result === "advanced" ? { advancedToStage: 2 } : {}),
    }),
  });

  if (result === "advanced") {
    void notifyStageApprover(updated, 2);
  } else {
    void notifyRequester(updated, result === "approved" ? "approved" : "denied");
  }

  return { result, updated };
}

export { getUserName as getApproverName };
