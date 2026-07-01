import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { LoginBody, LoginResponse } from "@workspace/api-zod";
import { verifyPassword } from "../lib/auth";

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

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(sql`lower(${usersTable.email})`, email));

  if (!user || !user.passwordHash) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  req.session.regenerate((err) => {
    if (err) {
      req.log.error({ err }, "session regenerate failed");
      res.status(500).json({ error: "Login failed" });
      return;
    }
    req.session.userId = user.clerkId;
    req.session.save((saveErr) => {
      if (saveErr) {
        req.log.error({ err: saveErr }, "session save failed");
        res.status(500).json({ error: "Login failed" });
        return;
      }
      res.json(LoginResponse.parse(toUserResponse(user)));
    });
  });
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy((err) => {
    if (err) {
      req.log.error({ err }, "session destroy failed");
      res.status(500).json({ error: "Logout failed" });
      return;
    }
    res.clearCookie("sid");
    res.status(204).end();
  });
});

export default router;
