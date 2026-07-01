import { randomBytes } from "crypto";
import path from "path";
import fs from "fs";

export function generateBadgeId(): string {
  return "GMS-" + randomBytes(3).toString("hex").toUpperCase();
}

export function savePhoto(imageData: string): string {
  const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(process.cwd(), "../..")
    : process.cwd();

  const uploadsDir = path.resolve(workspaceRoot, "artifacts/api-server/uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
  const filename = `photo_${Date.now()}_${randomBytes(4).toString("hex")}.jpg`;
  const filepath = path.join(uploadsDir, filename);
  fs.writeFileSync(filepath, Buffer.from(base64Data, "base64"));

  return `/api/photos/${filename}`;
}
