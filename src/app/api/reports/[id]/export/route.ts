import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import { canExportReport } from "@/lib/auth/access";
import { executeReport } from "@/lib/reports/engine";
import { buildReportExcelBuffer } from "@/lib/reports/excel-export";
import { getDataSourceProvider } from "@/lib/reports/datasources";
import { getReportDefinition, writeAuditLog } from "@/lib/reports/registry";

const bodySchema = z.object({
  parameters: z.record(z.string(), z.unknown()).optional().default({}),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const allowed = await canExportReport(session.user, id);
    if (!allowed) {
      return NextResponse.json(
        { error: "شما اجازه خروجی این گزارش را ندارید" },
        { status: 403 },
      );
    }

    const report = await getReportDefinition(id);
    if (!report) {
      return NextResponse.json({ error: "گزارش یافت نشد" }, { status: 404 });
    }

    const provider = getDataSourceProvider(report.dataSourceId || "rahkaran");
    if (!provider.isConfigured()) {
      return NextResponse.json(
        { error: "دیتابیس پیکربندی نشده است." },
        { status: 503 },
      );
    }

    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "پارامترهای نامعتبر" }, { status: 400 });
    }

    const started = Date.now();
    const result = await executeReport(id, {
      parameters: parsed.data.parameters,
      userId: session.user.id,
      skipAudit: true,
      maxRows: report.validation?.maxRows ?? 50000,
    });

    const buffer = await buildReportExcelBuffer(result);

    await writeAuditLog({
      userId: session.user.id,
      action: "report.export",
      reportSlug: id,
      parameters: parsed.data.parameters,
      durationMs: Date.now() - started,
      success: true,
    });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${id}.xlsx"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطای ناشناخته";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status: status });
  }
}
