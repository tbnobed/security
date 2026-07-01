import { Router } from "express";
import { eq } from "drizzle-orm";
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
} from "@workspace/api-zod";
import { requireAuth, requireAdmin, getOrCreateUser } from "../lib/auth";
import { getAuth } from "@clerk/express";

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

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, parsed.data.clerkId));

  if (existing) {
    const [updated] = await db
      .update(usersTable)
      .set({ role: parsed.data.role, displayName: parsed.data.displayName ?? null, email: parsed.data.email ?? null })
      .where(eq(usersTable.clerkId, parsed.data.clerkId))
      .returning();
    res.status(201).json(CreateUserResponse.parse(toUserResponse(updated)));
    return;
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      clerkId: parsed.data.clerkId,
      displayName: parsed.data.displayName ?? null,
      email: parsed.data.email ?? null,
      role: parsed.data.role,
    })
    .returning();

  const auth = getAuth(req);
  const operatorId = auth?.userId ?? "unknown";
  const [operator] = await db.select().from(usersTable).where(eq(usersTable.clerkId, operatorId));
  await db.insert(auditTable).values({
    eventType: "user_created",
    guestId: null,
    guestName: user.displayName ?? user.clerkId,
    operatorClerkId: operatorId,
    operatorName: operator?.displayName ?? operator?.email ?? operatorId,
    metadata: JSON.stringify({ role: user.role }),
  });

  res.status(201).json(CreateUserResponse.parse(toUserResponse(user)));
});

router.get("/users/me", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const clerkId = auth?.userId!;
  const user = await getOrCreateUser(clerkId);
  res.json(GetMeResponse.parse(toUserResponse(user)));
});

router.patch("/users/me", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateMeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const auth = getAuth(req);
  const clerkId = auth?.userId!;

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

  const auth = getAuth(req);
  const operatorId = auth?.userId ?? "unknown";
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

export default router;
