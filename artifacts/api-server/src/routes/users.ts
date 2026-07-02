import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db, usersTable, auditTable } from "@workspace/db";
import {
  ListUsersResponse,
  CreateUserBody,
  CreateUserResponse,
  GetMeResponse,
  UpdateMeBody,
  UpdateMeResponse,
  UpdateUserRoleParams,
  UpdateUserRoleBody,
  UpdateUserRoleResponse,
  ResetUserPasswordParams,
  ResetUserPasswordBody,
  ResetUserPasswordResponse,
} from "@workspace/api-zod";
import {
  requireAuth,
  requireOperator,
  requireAdmin,
  getSessionUserId,
  getUserById,
  generateUserId,
  hashPassword,
} from "../lib/auth";

const router = Router();

function toUserResponse(u: typeof usersTable.$inferSelect) {
  return {
    clerkId: u.clerkId,
    displayName: u.displayName ?? null,
    email: u.email ?? null,
    role: u.role as "security" | "admin",
    createdAt: u.createdAt.toISOString(),
  };
}

router.get("/users", requireAdmin, async (req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  res.json(ListUsersResponse.parse(users.map(toUserResponse)));
});

router.post("/users", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(sql`lower(${usersTable.email})`, email));

  if (existing) {
    res.status(409).json({ error: "A user with this email already exists" });
    return;
  }

  const passwordHash = await hashPassword(parsed.data.password);

  let user: typeof usersTable.$inferSelect;
  try {
    [user] = await db
      .insert(usersTable)
      .values({
        clerkId: generateUserId(),
        displayName: parsed.data.displayName ?? null,
        email,
        passwordHash,
        role: parsed.data.role,
      })
      .returning();
  } catch (err) {
    // Unique-violation on the case-insensitive email index (concurrent create).
    if ((err as { code?: string } | null)?.code === "23505") {
      res.status(409).json({ error: "A user with this email already exists" });
      return;
    }
    throw err;
  }

  const operatorId = getSessionUserId(req) ?? "unknown";
  const [operator] = await db.select().from(usersTable).where(eq(usersTable.clerkId, operatorId));
  await db.insert(auditTable).values({
    eventType: "user_created",
    guestId: null,
    guestName: user.displayName ?? user.email ?? user.clerkId,
    operatorClerkId: operatorId,
    operatorName: operator?.displayName ?? operator?.email ?? operatorId,
    metadata: JSON.stringify({ role: user.role, email: user.email }),
  });

  res.status(201).json(CreateUserResponse.parse(toUserResponse(user)));
});

router.get("/users/me", requireAuth, async (req, res): Promise<void> => {
  const userId = getSessionUserId(req)!;
  const user = await getUserById(userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(GetMeResponse.parse(toUserResponse(user)));
});

router.patch("/users/me", requireOperator, async (req, res): Promise<void> => {
  const parsed = UpdateMeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const clerkId = getSessionUserId(req)!;

  const [user] = await db
    .update(usersTable)
    .set({ displayName: parsed.data.displayName })
    .where(eq(usersTable.clerkId, clerkId))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(UpdateMeResponse.parse(toUserResponse(user)));
});

router.patch("/users/:clerkId/role", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateUserRoleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateUserRoleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set({ role: parsed.data.role })
    .where(eq(usersTable.clerkId, params.data.clerkId))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const operatorId = getSessionUserId(req) ?? "unknown";
  const [operator] = await db.select().from(usersTable).where(eq(usersTable.clerkId, operatorId));
  await db.insert(auditTable).values({
    eventType: "role_changed",
    guestId: null,
    guestName: user.displayName ?? user.clerkId,
    operatorClerkId: operatorId,
    operatorName: operator?.displayName ?? operator?.email ?? operatorId,
    metadata: JSON.stringify({ newRole: parsed.data.role, targetUser: params.data.clerkId }),
  });

  res.json(UpdateUserRoleResponse.parse(toUserResponse(user)));
});

router.patch("/users/:clerkId/password", requireAdmin, async (req, res): Promise<void> => {
  const params = ResetUserPasswordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = ResetUserPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const passwordHash = await hashPassword(parsed.data.password);

  const [user] = await db
    .update(usersTable)
    .set({ passwordHash })
    .where(eq(usersTable.clerkId, params.data.clerkId))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const operatorId = getSessionUserId(req) ?? "unknown";
  const [operator] = await db.select().from(usersTable).where(eq(usersTable.clerkId, operatorId));
  await db.insert(auditTable).values({
    eventType: "password_reset",
    guestId: null,
    guestName: user.displayName ?? user.email ?? user.clerkId,
    operatorClerkId: operatorId,
    operatorName: operator?.displayName ?? operator?.email ?? operatorId,
    metadata: JSON.stringify({ targetUser: params.data.clerkId }),
  });

  res.json(ResetUserPasswordResponse.parse(toUserResponse(user)));
});

export default router;
