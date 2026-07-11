import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";
import {
  getReportDefinition,
  upsertReportDefinition,
} from "@/lib/reports/registry";
import { resolveSqlText } from "@/lib/reports/sql-loader";
import { validateReportDefinition } from "@/lib/reports/validate";
import {
  normalizeDefinition,
  reportDefinitionInputSchema,
} from "@/types/report";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Ctx) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await context.params;
  const definition = await getReportDefinition(id);
  if (!definition) {
    return NextResponse.json({ error: "گزارش یافت نشد" }, { status: 404 });
  }

  let sqlText = "";
  try {
    sqlText = resolveSqlText(definition);
  } catch {
    sqlText = definition.sqlSource?.text ?? definition.sql ?? "";
  }

  let versions: Array<{ version: number; note: string | null; createdAt: Date }> =
    [];
  let folderId: string | null = null;
  let sourceType = "studio";
  let sourceRef: string | null = null;
  try {
    const report = await prisma.report.findUnique({
      where: { slug: id },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 20,
          select: { version: true, note: true, createdAt: true },
        },
      },
    });
    versions = report?.versions ?? [];
    folderId = report?.folderId ?? null;
    sourceType = report?.sourceType ?? "studio";
    sourceRef = report?.sourceRef ?? null;
  } catch {
    /* ignore */
  }

  return NextResponse.json({
    definition,
    sqlText,
    versions,
    folderId,
    sourceType,
    sourceRef,
  });
}

const putSchema = z.object({
  definition: reportDefinitionInputSchema,
  publish: z.boolean().optional().default(true),
  note: z.string().optional(),
  sqlInline: z.boolean().optional().default(true),
  folderId: z.string().nullable().optional(),
});

export async function PUT(request: NextRequest, context: Ctx) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const { id } = await context.params;

  try {
    const json = await request.json();
    const parsed = putSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
    }

    const definition = normalizeDefinition({
      ...parsed.data.definition,
      id,
    });

    const sqlText = resolveSqlText(definition);
    const validation = validateReportDefinition(definition, sqlText);
    if (!validation.ok) {
      return NextResponse.json(
        { error: "اعتبارسنجی ناموفق", validation },
        { status: 400 },
      );
    }

    const result = await upsertReportDefinition(definition, {
      publish: parsed.data.publish,
      note: parsed.data.note,
      userId: session?.user?.id,
      sqlInline: parsed.data.sqlInline,
      folderId: parsed.data.folderId,
    });

    return NextResponse.json({ ok: true, ...result, validation });
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
    await prisma.report.update({
      where: { slug: id },
      data: { isActive: false },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
