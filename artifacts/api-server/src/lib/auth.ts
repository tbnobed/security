import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

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

/**
 * Requires an authenticated user whose role is security or admin.
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
  if (!user || (user.role !== "security" && user.role !== "admin")) {
    res.status(403).json({ error: "Operator access required" });
    return;
  }
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
  if (!user || (user.role !== "kiosk" && user.role !== "security" && user.role !== "admin")) {
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
  res.locals.clientUser = user;
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
  next();
}

export async function getUserById(userId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId));
  return user ?? null;
}
