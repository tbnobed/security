import { Router } from "express";
import { asc, eq, sql } from "drizzle-orm";
import { db, studiosTable } from "@workspace/db";
import {
  ListStudiosResponse,
  CreateStudioBody,
  CreateStudioResponse,
  DeleteStudioParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../lib/auth";

const router = Router();

function toStudioResponse(s: typeof studiosTable.$inferSelect) {
  return {
    id: s.id,
    name: s.name,
    createdAt: s.createdAt.toISOString(),
  };
}

// Public: the visitor pre-registration form needs the list of studios.
router.get("/studios", async (_req, res): Promise<void> => {
  const studios = await db.select().from(studiosTable).orderBy(asc(studiosTable.name));
  res.json(ListStudiosResponse.parse(studios.map(toStudioResponse)));
});

router.post("/studios", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateStudioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const name = parsed.data.name.trim();
  if (!name) {
    res.status(400).json({ error: "Studio name is required" });
    return;
  }

  const [existing] = await db
    .select()
    .from(studiosTable)
    .where(sql`lower(${studiosTable.name}) = lower(${name})`);
  if (existing) {
    res.status(409).json({ error: "A studio with that name already exists" });
    return;
  }

  try {
    const [studio] = await db.insert(studiosTable).values({ name }).returning();
    res.status(201).json(CreateStudioResponse.parse(toStudioResponse(studio)));
  } catch (err) {
    const code =
      (err as { code?: string })?.code ??
      ((err as { cause?: { code?: string } })?.cause?.code);
    if (code === "23505") {
      res.status(409).json({ error: "A studio with that name already exists" });
      return;
    }
    throw err;
  }
});

router.delete("/studios/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteStudioParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(studiosTable).where(eq(studiosTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
