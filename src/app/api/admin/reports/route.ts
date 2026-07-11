import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";
import {
  listReportDefinitions,
  upsertReportDefinition,
} from "@/lib/reports/registry";
import { resolveSqlText } from "@/lib/reports/sql-loader";
import { validateReportDefinition } from "@/lib/reports/validate";
import {
  normalizeDefinition,
  reportDefinitionInputSchema,
} from "@/types/report";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const definitions = await listReportDefinitions();
  let dbReports: Array<{
    slug: string;
    publishedVersion: number;
    updatedAt: Date;
  }> = [];
  try {
    dbReports = await prisma.report.findMany({
      select: { slug: true, publishedVersion: true, updatedAt: true },
    });
  } catch {
    /* ignore */
  }

  const meta = new Map(dbReports.map((r) => [r.slug, r]));

  return NextResponse.json({
    reports: definitions.map((d) => ({
      id: d.id,
      nameFa: d.nameFa,
      moduleId: d.moduleId,
      dataSourceId: d.dataSourceId,
      schemaVersion: d.schemaVersion,
      datasetCount: d.datasets.length,
      embedCount: d.embeds?.length ?? 0,
      parameterCount: d.parameters.length,
      columnCount: d.columns.length || d.datasets[0]?.columns.length || 0,
      publishedVersion: meta.get(d.id)?.publishedVersion ?? 1,
      updatedAt: meta.get(d.id)?.updatedAt ?? null,
    })),
  });
}

const saveSchema = z.object({
  definition: reportDefinitionInputSchema,
  publish: z.boolean().optional().default(true),
  note: z.string().optional(),
  sqlInline: z.boolean().optional().default(true),
  folderId: z.string().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  try {
    const json = await request.json();
    const parsed = saveSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "تعریف گزارش نامعتبر است", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const definition = normalizeDefinition(parsed.data.definition);
    const sqlText = resolveSqlText(definition);
    const validation = validateReportDefinition(definition, sqlText);
    if (!validation.ok) {
      return NextResponse.json(
        {
          error: "اعتبارسنجی ناموفق — قبل از انتشار خطاها را رفع کنید",
          validation,
        },
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
    const message = err instanceof Error ? err.message : "خطا در ذخیره";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
