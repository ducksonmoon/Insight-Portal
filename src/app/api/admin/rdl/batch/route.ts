import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { mapPool } from "@/lib/concurrency";
import { importRdlFromFile } from "@/lib/reports/rdl-import";

const UPLOAD_CONCURRENCY = 5;

export async function POST(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  try {
    const form = await request.formData();
    const moduleSlug = String(form.get("moduleId") ?? "imported");
    const files = form.getAll("files[]").filter((f): f is File => f instanceof File);

    if (files.length === 0) {
      const single = form.get("file");
      if (single instanceof File) files.push(single);
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "حداقل یک فایل RDL الزامی است" }, { status: 400 });
    }

    const results = await mapPool(files, UPLOAD_CONCURRENCY, (file) =>
      importRdlFromFile(file, {
        moduleSlug,
        uploadedBy: session?.user?.id,
      }),
    );

    const ok = results.filter((r) => r.ok).length;
    const failed = results.length - ok;

    return NextResponse.json({
      ok: true,
      total: results.length,
      succeeded: ok,
      failed,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا در بارگذاری";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
