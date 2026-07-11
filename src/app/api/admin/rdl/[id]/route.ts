import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";
import type { ParsedRdl } from "@/lib/reports/rdl-parser";
import { deleteRdlFile, readRdlFile } from "@/lib/reports/rdl-storage";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Ctx) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await context.params;

  try {
    const row = await prisma.rdlReport.findFirst({
      where: { OR: [{ id }, { slug: id }], isActive: true },
      include: { module: { select: { slug: true, nameFa: true } } },
    });
    if (!row) {
      return NextResponse.json({ error: "گزارش RDL یافت نشد" }, { status: 404 });
    }

    const parsed = JSON.parse(row.parsedMeta) as ParsedRdl;
    let xmlPreview = "";
    try {
      const xml = await readRdlFile(row.storageName);
      xmlPreview = xml.slice(0, 8000);
    } catch {
      xmlPreview = "";
    }

    return NextResponse.json({
      report: {
        id: row.id,
        slug: row.slug,
        nameFa: row.nameFa,
        originalFilename: row.originalFilename,
        moduleId: row.module?.slug ?? null,
        moduleName: row.module?.nameFa ?? null,
        convertedReportSlug: row.convertedReportSlug,
        convertStatus: row.convertStatus,
        convertError: row.convertError,
        createdAt: row.createdAt,
        parsed,
        xmlPreview,
        xmlTruncated: xmlPreview.length >= 8000,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: Ctx) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await context.params;

  try {
    const row = await prisma.rdlReport.findFirst({
      where: { OR: [{ id }, { slug: id }] },
    });
    if (!row) {
      return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
    }

    await prisma.rdlReport.update({
      where: { id: row.id },
      data: { isActive: false },
    });
    await deleteRdlFile(row.storageName);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
