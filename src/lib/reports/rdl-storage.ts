import fs from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

const RDL_DIR = path.join(process.cwd(), "data", "rdl");

export function rdlStoragePath(relative: string): string {
  return path.join(RDL_DIR, relative);
}

export async function saveRdlUpload(
  file: File,
): Promise<{ storageName: string; originalFilename: string }> {
  if (!file.name.toLowerCase().endsWith(".rdl")) {
    throw new Error("فقط فایل .rdl مجاز است");
  }

  if (file.size > 15 * 1024 * 1024) {
    throw new Error("حداکثر حجم فایل RDL: ۱۵ مگابایت");
  }

  await fs.mkdir(RDL_DIR, { recursive: true });

  const safeBase = path
    .basename(file.name, ".rdl")
    .replace(/[^\w\u0600-\u06FF.-]+/g, "-")
    .slice(0, 80);

  const storageName = `${Date.now()}-${randomBytes(4).toString("hex")}-${safeBase || "report"}.rdl`;
  const fullPath = path.join(RDL_DIR, storageName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(fullPath, buffer);

  return { storageName, originalFilename: file.name };
}

export async function readRdlFile(storageName: string): Promise<string> {
  const fullPath = path.join(RDL_DIR, storageName);
  return fs.readFile(fullPath, "utf8");
}

export async function deleteRdlFile(storageName: string): Promise<void> {
  try {
    await fs.unlink(path.join(RDL_DIR, storageName));
  } catch {
    /* ignore */
  }
}
