import { Router } from "express";
import path from "path";
import fs from "fs";
import { UploadPhotoBody, UploadPhotoResponse } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { savePhoto } from "../lib/badge";

const router = Router();

router.post("/photos", requireAuth, async (req, res): Promise<void> => {
  const parsed = UploadPhotoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const photoUrl = savePhoto(parsed.data.imageData);
    res.status(201).json(UploadPhotoResponse.parse({ photoUrl }));
  } catch (err) {
    res.status(500).json({ error: "Failed to save photo" });
  }
});

router.get("/photos/:filename", (req, res): void => {
  const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(process.cwd(), "../..")
    : process.cwd();

  const filename = path.basename(req.params.filename as string);
  const filepath = path.resolve(workspaceRoot, "artifacts/api-server/uploads", filename);

  if (!fs.existsSync(filepath)) {
    res.status(404).json({ error: "Photo not found" });
    return;
  }

  res.setHeader("Content-Type", "image/jpeg");
  res.sendFile(filepath);
});

export default router;
