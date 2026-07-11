import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";
import { importRdlFromFile } from "@/lib/reports/rdl-import";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const rows = await prisma.rdlReport.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      include: { module: { select: { slug: true } } },
    });

    return NextResponse.json({
      reports: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        nameFa: row.nameFa,
        originalFilename: row.originalFilename,
        moduleId: row.module?.slug ?? null,
        convertedReportSlug: row.convertedReportSlug,
        convertStatus: row.convertStatus,
        convertError: row.convertError,
        createdAt: row.createdAt,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  try {
    const form = await request.formData();
    const file = form.get("file");
    const moduleSlug = String(form.get("moduleId") ?? "imported");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "فایل RDL الزامی است" }, { status: 400 });
    }

    const result = await importRdlFromFile(file, {
      moduleSlug,
      uploadedBy: session?.user?.id,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      id: result.id,
      slug: result.slug,
      nameFa: result.nameFa,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا در بارگذاری";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
