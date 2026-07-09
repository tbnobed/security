import { Router } from "express";
import { randomUUID } from "crypto";
import {
  SubmitScanResultBody,
  CreateScanSessionResponse,
  GetScanSessionResponse,
  ReportScanDiagnosticsBody,
} from "@workspace/api-zod";
import { requireOperator } from "../lib/auth";
import { savePhoto } from "../lib/badge";

const SESSION_TTL_MS = 5 * 60 * 1000;

interface ScanSessionEntry {
  expiresAt: number;
  result: { name: string; photoUrl: string | null } | null;
  // Latest scanner telemetry reported by the paired phone (debugging aid —
  // surfaced to the desk dialog so the officer can see why a scan is failing).
  diagnostics:
    | (ReturnType<typeof ReportScanDiagnosticsBody.parse> & { receivedAt: string })
    | null;
}

const sessions = new Map<string, ScanSessionEntry>();

function sweepExpired(): void {
  const now = Date.now();
  for (const [id, entry] of sessions) {
    if (entry.expiresAt <= now) sessions.delete(id);
  }
}

function getLive(id: string): ScanSessionEntry | null {
  sweepExpired();
  const entry = sessions.get(id);
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return entry;
}

const router = Router();

router.post("/scan-sessions", requireOperator, (req, res): void => {
  sweepExpired();
  const id = randomUUID();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(id, { expiresAt, result: null, diagnostics: null });
  req.log.info({ scanSessionId: id }, "scan session created");
  res.status(201).json(
    CreateScanSessionResponse.parse({ id, expiresAt: new Date(expiresAt).toISOString() }),
  );
});

router.get("/scan-sessions/:id", requireOperator, (req, res): void => {
  const entry = getLive(req.params.id as string);
  if (!entry) {
    res.status(404).json({ error: "Scan session not found or expired" });
    return;
  }
  res.json(
    GetScanSessionResponse.parse({
      ...(entry.result
        ? { status: "completed", result: entry.result }
        : { status: "pending" }),
      ...(entry.diagnostics ? { diagnostics: entry.diagnostics } : {}),
    }),
  );
});

// Idempotent cancel — the desk dialog calls this when it closes, unmounts, or
// the page unloads, so a displayed-but-abandoned QR token can't be used later.
router.delete("/scan-sessions/:id", requireOperator, (req, res): void => {
  if (sessions.delete(req.params.id as string)) {
    req.log.info({ scanSessionId: req.params.id }, "scan session cancelled");
  }
  res.status(204).end();
});

// Simple per-IP rate limit for the unauthenticated submit endpoint.
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 1000;
const submitHits = new Map<string, { count: number; windowStart: number }>();

function rateLimited(ip: string, bucket = "", limit = RATE_LIMIT): boolean {
  // Separate buckets per endpoint (key prefix) so e.g. status polling from a
  // shared office IP can never consume the submit budget.
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const hit = submitHits.get(key);
  if (!hit || now - hit.windowStart >= RATE_WINDOW_MS) {
    if (submitHits.size > 1000) submitHits.clear();
    submitHits.set(key, { count: 1, windowStart: now });
    return false;
  }
  hit.count += 1;
  return hit.count > limit;
}

// Token-authenticated by the unguessable session id — the paired phone checks
// this on load (and whenever it returns to the foreground) so a cancelled or
// expired QR token shows a dead-link screen instead of a working scanner.
router.get("/scan-sessions/:id/status", (req, res): void => {
  if (rateLimited(req.ip ?? "unknown", "status")) {
    res.status(429).json({ error: "Too many requests" });
    return;
  }
  const entry = getLive(req.params.id as string);
  if (!entry || entry.result) {
    res.status(404).json({ error: "Scan session not found or expired" });
    return;
  }
  res.status(204).end();
});

// Token-authenticated by the unguessable session id — the paired phone posts
// scanner telemetry so the desk can see WHY a scan is failing (decoder in use,
// camera resolution, attempt counters, last error). Stored in-memory on the
// session only; overwritten by each report, gone when the session dies.
router.post("/scan-sessions/:id/diagnostics", (req, res): void => {
  // Each phone reports every 3s (20/min), so the default 30/min budget would
  // let ONE phone starve a second one behind the same NAT/venue IP. 100/min
  // gives ~5 concurrent phones headroom while still bounding abuse.
  if (rateLimited(req.ip ?? "unknown", "diag", 100)) {
    req.log.warn({ ip: req.ip }, "scan diagnostics rate-limited (shared IP contention?)");
    res.status(429).json({ error: "Too many requests" });
    return;
  }
  const entry = getLive(req.params.id as string);
  if (!entry || entry.result) {
    res.status(404).json({ error: "Scan session not found or expired" });
    return;
  }
  const parsed = ReportScanDiagnosticsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  entry.diagnostics = { ...parsed.data, receivedAt: new Date().toISOString() };
  res.status(204).end();
});

// Token-authenticated by the unguessable session id — the paired phone is not signed in.
router.post("/scan-sessions/:id/submit", (req, res): void => {
  if (rateLimited(req.ip ?? "unknown")) {
    res.status(429).json({ error: "Too many requests" });
    return;
  }
  const entry = getLive(req.params.id as string);
  if (!entry) {
    res.status(404).json({ error: "Scan session not found or expired" });
    return;
  }
  if (entry.result) {
    res.status(409).json({ error: "Scan session already completed" });
    return;
  }
  const parsed = SubmitScanResultBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let photoUrl: string | null = null;
  if (parsed.data.photoData) {
    try {
      photoUrl = savePhoto(parsed.data.photoData);
    } catch (err) {
      req.log.warn({ err }, "scan session photo save failed; continuing without photo");
    }
  }
  entry.result = { name: parsed.data.name.trim(), photoUrl };
  req.log.info({ scanSessionId: req.params.id }, "scan session completed");
  res.status(204).end();
});

export default router;
