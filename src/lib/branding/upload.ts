import fs from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "branding");
const ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

export async function saveBrandingUpload(
  file: File,
  kind: "logo" | "favicon",
): Promise<string> {
  if (!ALLOWED.has(file.type) && !file.name.match(/\.(png|jpe?g|webp|svg|ico)$/i)) {
    throw new Error("فرمت فایل مجاز نیست (PNG، JPG، WEBP، SVG، ICO)");
  }

  if (file.size > 2 * 1024 * 1024) {
    throw new Error("حداکثر حجم فایل ۲ مگابایت است");
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const ext =
    path.extname(file.name).toLowerCase() ||
    (file.type === "image/svg+xml"
      ? ".svg"
      : file.type === "image/png"
        ? ".png"
        : file.type.includes("jpeg") || file.type.includes("jpg")
          ? ".jpg"
          : file.type.includes("webp")
            ? ".webp"
            : ".png");

  const filename = `${kind}-${Date.now()}-${randomBytes(4).toString("hex")}${ext}`;
  const fullPath = path.join(UPLOAD_DIR, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(fullPath, buffer);

  return `/uploads/branding/${filename}`;
}
