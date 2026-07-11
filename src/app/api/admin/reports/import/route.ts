import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import {
  importReportPackage,
  parseReportPackageJson,
} from "@/lib/reports/import-package";

const bodySchema = z.object({
  package: z.unknown(),
  conflict: z.enum(["skip", "replace", "rename"]).optional(),
  moduleId: z.string().optional(),
  folderId: z.string().nullable().optional(),
  newSlug: z.string().optional(),
  publish: z.boolean().optional(),
});

async function importOneFile(
  file: File,
  options: {
    userId?: string;
    conflict: "skip" | "replace" | "rename";
    moduleId?: string;
    folderId?: string | null;
    newSlug?: string;
    publish: boolean;
  },
) {
  const text = await file.text();
  const pkg = parseReportPackageJson(text);
  const result = await importReportPackage(pkg, {
    userId: options.userId,
    conflict: options.conflict,
    moduleId: options.moduleId,
    folderId: options.folderId,
    newSlug: options.newSlug,
    publish: options.publish,
    sourceType: "package",
    sourceRef: file.name,
  });
  return { filename: file.name, ...result };
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const files = form
        .getAll("files[]")
        .filter((f): f is File => f instanceof File);
      const single = form.get("file");
      if (single instanceof File) files.push(single);

      if (!files.length) {
        return NextResponse.json({ error: "فایل بسته الزامی است" }, { status: 400 });
      }

      const conflict = (form.get("conflict") as string) || "rename";
      const moduleId = form.get("moduleId")?.toString();
      const folderIdRaw = form.get("folderId")?.toString();
      const newSlug = form.get("newSlug")?.toString();
      const publish = form.get("publish") !== "false";

      const importOpts = {
        userId: session?.user?.id,
        conflict: conflict as "skip" | "replace" | "rename",
        moduleId,
        folderId: folderIdRaw === "" ? null : folderIdRaw,
        newSlug,
        publish,
      };

      if (files.length === 1) {
        const result = await importOneFile(files[0]!, importOpts);
        return NextResponse.json(result);
      }

      const results = [];
      for (const file of files) {
        try {
          results.push(await importOneFile(file, importOpts));
        } catch (err) {
          results.push({
            filename: file.name,
            ok: false,
            error: err instanceof Error ? err.message : "خطا",
          });
        }
      }

      const succeeded = results.filter((r) => r.ok && !r.skipped).length;
      const skipped = results.filter((r) => r.skipped).length;
      const failed = results.length - succeeded - skipped;

      return NextResponse.json({
        ok: true,
        total: results.length,
        succeeded,
        skipped,
        failed,
        results,
      });
    }

    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
    }

    const result = await importReportPackage(parsed.data.package, {
      userId: session?.user?.id,
      conflict: parsed.data.conflict,
      moduleId: parsed.data.moduleId,
      folderId: parsed.data.folderId,
      newSlug: parsed.data.newSlug,
      publish: parsed.data.publish,
      sourceType: "package",
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا در وارد کردن";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
