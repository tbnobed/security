import { Router } from "express";
import { and, desc, eq, or } from "drizzle-orm";
import { db, preregistrationsTable, usersTable, auditTable } from "@workspace/db";
import {
  GetApprovalWorkflowResponse,
  UpdateApprovalWorkflowBody,
  UpdateApprovalWorkflowResponse,
  ListPendingApprovalsResponse,
  ListDeniedApprovalsResponse,
  DecideApprovalParams,
  DecideApprovalBody,
  DecideApprovalResponse,
  GetApprovalByTokenParams,
  GetApprovalByTokenResponse,
  DecideApprovalByTokenParams,
  DecideApprovalByTokenBody,
  DecideApprovalByTokenResponse,
} from "@workspace/api-zod";
import { requireAdmin, requireOperator, getSessionUserId } from "../lib/auth";
import {
  getWorkflowConfig,
  setWorkflowConfig,
  applyDecision,
  getApproverName,
} from "../lib/approvals";

const router = Router();

type Prereg = typeof preregistrationsTable.$inferSelect;

function toPreregResponse(p: Prereg) {
  return {
    ...p,
    phone: p.phone ?? null,
    email: p.email ?? null,
    purposeOfVisit: p.purposeOfVisit ?? null,
    expectedDeparture: p.expectedDeparture?.toISOString() ?? null,
    expectedArrival: p.expectedArrival.toISOString(),
    createdByClerkId: p.createdByClerkId ?? null,
    convertedGuestId: p.convertedGuestId ?? null,
  };
}

async function buildWorkflowResponse() {
  const wf = await getWorkflowConfig();
  return {
    approver1Id: wf.approver1Id,
    approver2Id: wf.approver2Id,
    approver1Name: await getApproverName(wf.approver1Id),
    approver2Name: await getApproverName(wf.approver2Id),
    enabled: !!wf.approver1Id,
  };
}

router.get("/approval-workflow", requireAdmin, async (_req, res): Promise<void> => {
  res.json(GetApprovalWorkflowResponse.parse(await buildWorkflowResponse()));
});

router.put("/approval-workflow", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateApprovalWorkflowBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let { approver1Id, approver2Id } = parsed.data;
  if (!approver1Id && approver2Id) {
    res.status(400).json({ error: "A 2nd approver requires a 1st approver" });
    return;
  }
  if (approver1Id && approver2Id && approver1Id === approver2Id) {
    res.status(400).json({ error: "Approvers must be different users" });
    return;
  }
  for (const id of [approver1Id, approver2Id]) {
    if (!id) continue;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, id));
    if (!user || (user.role !== "security" && user.role !== "supervisor" && user.role !== "admin")) {
      res.status(400).json({ error: "Approvers must be existing security, supervisor, or admin users" });
      return;
    }
  }
  approver1Id = approver1Id || null;
  approver2Id = approver2Id || null;
  await setWorkflowConfig({ approver1Id, approver2Id });

  const adminId = getSessionUserId(req) ?? "unknown";
  const [admin] = await db.select().from(usersTable).where(eq(usersTable.clerkId, adminId));
  await db.insert(auditTable).values({
    eventType: "approval_workflow_updated",
    guestId: null,
    guestName: "",
    operatorClerkId: adminId,
    operatorName: admin?.displayName ?? admin?.email ?? adminId,
    metadata: JSON.stringify({ approver1Id, approver2Id }),
  });

  res.json(UpdateApprovalWorkflowResponse.parse(await buildWorkflowResponse()));
});

router.get("/approvals/pending", requireOperator, async (req, res): Promise<void> => {
  const userId = getSessionUserId(req) ?? "";
  const rows = await db
    .select()
    .from(preregistrationsTable)
    .where(
      and(
        eq(preregistrationsTable.approvalStatus, "pending"),
        eq(preregistrationsTable.status, "pending"),
      ),
    )
    .orderBy(preregistrationsTable.expectedArrival);

  const stageApproverOf = (p: Prereg) => (p.approvalStage === 2 ? p.approver2Id : p.approver1Id);
  const uniqueIds = [...new Set(rows.map(stageApproverOf).filter((id): id is string => !!id))];
  const approverNames = new Map<string, string | null>();
  for (const id of uniqueIds) {
    approverNames.set(id, await getApproverName(id));
  }

  const items = rows.map((p) => {
    const stageApproverId = stageApproverOf(p);
    return {
      ...toPreregResponse(p),
      canDecide: !!stageApproverId && stageApproverId === userId,
      awaitingApproverName: stageApproverId ? (approverNames.get(stageApproverId) ?? null) : null,
    };
  });
  res.json(ListPendingApprovalsResponse.parse(items));
});

router.get("/approvals/denied", requireOperator, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(preregistrationsTable)
    .where(
      and(
        eq(preregistrationsTable.approvalStatus, "denied"),
        eq(preregistrationsTable.status, "pending"),
      ),
    )
    .orderBy(desc(preregistrationsTable.approvalDecidedAt))
    .limit(50);

  const uniqueIds = [
    ...new Set(rows.map((p) => p.approvalDecidedById).filter((id): id is string => !!id)),
  ];
  const deciderNames = new Map<string, string | null>();
  for (const id of uniqueIds) {
    deciderNames.set(id, await getApproverName(id));
  }

  const items = rows.map((p) => ({
    ...toPreregResponse(p),
    deniedByName: p.approvalDecidedById ? (deciderNames.get(p.approvalDecidedById) ?? null) : null,
    deniedAt: p.approvalDecidedAt ? p.approvalDecidedAt.toISOString() : null,
  }));
  res.json(ListDeniedApprovalsResponse.parse(items));
});

router.post("/approvals/:id/decide", requireOperator, async (req, res): Promise<void> => {
  const params = DecideApprovalParams.safeParse(req.params);
  const body = DecideApprovalBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: (params.success ? body : params).error?.message });
    return;
  }

  const [preg] = await db
    .select()
    .from(preregistrationsTable)
    .where(eq(preregistrationsTable.id, params.data.id));
  if (!preg) {
    res.status(404).json({ error: "Pre-registration not found" });
    return;
  }
  if (preg.approvalStatus !== "pending" || !preg.approvalStage) {
    res.status(409).json({ error: "This pre-registration is not awaiting approval" });
    return;
  }

  const userId = getSessionUserId(req) ?? "";
  const stage = preg.approvalStage as 1 | 2;
  const stageApprover = stage === 1 ? preg.approver1Id : preg.approver2Id;
  if (stageApprover !== userId) {
    res.status(403).json({ error: "You are not the current approver for this request" });
    return;
  }

  const decidedByName = (await getApproverName(userId)) ?? userId;
  const { result, updated } = await applyDecision({
    preg,
    stage,
    action: body.data.action,
    decidedById: userId,
    decidedByName,
  });
  if (result === "conflict" || !updated) {
    res.status(409).json({ error: "This request was already decided" });
    return;
  }
  res.json(DecideApprovalResponse.parse(toPreregResponse(updated)));
});

// ---- Public token endpoints (email one-click links) ----

async function findByToken(token: string): Promise<{ preg: Prereg; stage: 1 | 2 } | null> {
  if (!token || token.length < 16) return null;
  const [preg] = await db
    .select()
    .from(preregistrationsTable)
    .where(
      or(
        eq(preregistrationsTable.approval1Token, token),
        eq(preregistrationsTable.approval2Token, token),
      ),
    );
  if (!preg) return null;
  return { preg, stage: preg.approval1Token === token ? 1 : 2 };
}

function tokenState(preg: Prereg, stage: 1 | 2): "pending" | "approved" | "denied" | "superseded" {
  if (preg.approvalStatus === "approved") return "approved";
  if (preg.approvalStatus === "denied") return "denied";
  if (preg.status !== "pending") return "superseded";
  return preg.approvalStage === stage ? "pending" : "superseded";
}

function toTokenInfo(preg: Prereg, stage: 1 | 2) {
  return {
    state: tokenState(preg, stage),
    stage,
    guestName: preg.guestName,
    company: preg.company,
    hostName: preg.hostName,
    purposeOfVisit: preg.purposeOfVisit ?? null,
    expectedArrival: preg.expectedArrival.toISOString(),
    expectedDeparture: preg.expectedDeparture?.toISOString() ?? null,
    studios: preg.studios,
    lateRegistration: preg.lateRegistration,
  };
}

router.get("/approvals/token/:token", async (req, res): Promise<void> => {
  const params = GetApprovalByTokenParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const found = await findByToken(params.data.token);
  if (!found) {
    res.status(404).json({ error: "Approval link not found or expired" });
    return;
  }
  res.json(GetApprovalByTokenResponse.parse(toTokenInfo(found.preg, found.stage)));
});

router.post("/approvals/token/:token/decide", async (req, res): Promise<void> => {
  const params = DecideApprovalByTokenParams.safeParse(req.params);
  const body = DecideApprovalByTokenBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: (params.success ? body : params).error?.message });
    return;
  }
  const found = await findByToken(params.data.token);
  if (!found) {
    res.status(404).json({ error: "Approval link not found or expired" });
    return;
  }
  const { preg, stage } = found;
  if (tokenState(preg, stage) !== "pending") {
    // Already decided / superseded — idempotently report current state.
    res.json(DecideApprovalByTokenResponse.parse(toTokenInfo(preg, stage)));
    return;
  }

  const approverId = stage === 1 ? preg.approver1Id : preg.approver2Id;
  const decidedByName = (await getApproverName(approverId)) ?? approverId ?? "unknown";
  const { updated } = await applyDecision({
    preg,
    stage,
    action: body.data.action,
    decidedById: approverId ?? "unknown",
    decidedByName,
    viaToken: true,
  });
  const fresh = updated ?? preg;
  res.json(DecideApprovalByTokenResponse.parse(toTokenInfo(fresh, stage)));
});

export default router;
