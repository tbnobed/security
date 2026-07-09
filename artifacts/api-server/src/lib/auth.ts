import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { notePublicOrigin } from "./public-origin";
import { ensureClientCompany } from "./client-companies";

/**
 * Record the request's origin as the app's learned public origin. Called ONLY
 * after a security/admin role check has passed — kiosk and client accounts are
 * externally-held and must not be able to teach the origin used in approval
 * email links (host-header poisoning / decision-token exfiltration).
 */
function learnOriginFromTrustedRequest(req: Request): void {
  const host = req.get("host");
  if (host) notePublicOrigin(`${req.protocol}://${host}`);
}

const BCRYPT_ROUNDS = 12;

/** Generate a fresh opaque internal user id (stored in the `clerk_id` column). */
export function generateUserId(): string {
  return `usr_${randomUUID()}`;
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Returns the authenticated user's id from the session, or undefined. */
export function getSessionUserId(req: Request): string | undefined {
  return req.session?.userId;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

/** Staff roles allowed to operate the security desk screens. */
const OPERATOR_ROLES = new Set(["security", "supervisor", "admin"]);

/**
 * Requires an authenticated user whose role is security, supervisor, or admin.
 * Kiosk accounts are rejected — they may only use the kiosk endpoints.
 */
export async function requireOperator(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId));
  if (!user || !OPERATOR_ROLES.has(user.role)) {
    res.status(403).json({ error: "Operator access required" });
    return;
  }
  learnOriginFromTrustedRequest(req);
  next();
}

/**
 * Requires an authenticated user whose role is supervisor or admin.
 * Grants access to the watchlist and audit log without full admin rights.
 */
export async function requireSupervisor(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId));
  if (!user || (user.role !== "supervisor" && user.role !== "admin")) {
    res.status(403).json({ error: "Supervisor access required" });
    return;
  }
  learnOriginFromTrustedRequest(req);
  next();
}

/**
 * Requires an authenticated user allowed to use the kiosk endpoints:
 * kiosk, security, or admin. Client-portal accounts are rejected — they
 * must not see other companies' preregistrations or perform check-ins.
 */
export async function requireKioskAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId));
  if (!user || (user.role !== "kiosk" && !OPERATOR_ROLES.has(user.role))) {
    res.status(403).json({ error: "Kiosk access required" });
    return;
  }
  next();
}

/**
 * Requires an authenticated user whose role is client (client-portal account).
 * Attaches the loaded user row to res.locals.clientUser for handlers.
 */
export async function requireClient(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId));
  if (!user || user.role !== "client") {
    res.status(403).json({ error: "Client access required" });
    return;
  }
  // Resolve the company scope (lazy-migrates legacy accounts that predate
  // company scoping by creating the company from companyName and backfilling
  // their roster/pre-registration rows).
  const company = await ensureClientCompany(user);
  if (!company) {
    res.status(403).json({ error: "Client account is not linked to a company" });
    return;
  }
  res.locals.clientUser = { ...user, clientCompanyId: company.id, companyName: company.name };
  res.locals.clientCompany = company;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId));
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  learnOriginFromTrustedRequest(req);
  next();
}

export async function getUserById(userId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId));
  return user ?? null;
}
