import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import { canExportReport } from "@/lib/auth/access";
import { executeReport, type DatasetResult, type ExecuteReportResult } from "@/lib/reports/engine";
import { getDataSourceProvider } from "@/lib/reports/datasources";
import { formatCellValue } from "@/lib/reports/format";
import { getReportDefinition, writeAuditLog } from "@/lib/reports/registry";
import type { ReportColumn } from "@/types/report";

const bodySchema = z.object({
  parameters: z.record(z.string(), z.unknown()).optional().default({}),
});

function resolveColumns(
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
): ReportColumn[] {
  if (columns.length) return columns;
  if (!rows[0]) return [];
  return Object.keys(rows[0]).map((field) => ({
    field,
    header: field,
    type: "string" as const,
  }));
}

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
) {
  const used = new Set(workbook.worksheets.map((s) => s.name));
  let sheetName = name.slice(0, 31) || "Sheet";
  let i = 1;
  while (used.has(sheetName)) {
    const suffix = `_${i++}`;
    sheetName = `${name.slice(0, 31 - suffix.length)}${suffix}`;
  }

  const sheet = workbook.addWorksheet(sheetName);
  sheet.views = [{ rightToLeft: true }];

  const cols = resolveColumns(columns, rows);
  sheet.columns = cols.map((col) => {
    const pixelWidth =
      "width" in col && typeof col.width === "number" ? col.width : 120;
    return {
      header: col.header,
      key: col.field,
      width: Math.max(12, Math.min(40, pixelWidth / 8)),
    };
  });

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };

  for (const row of rows) {
    const out: Record<string, unknown> = {};
    for (const col of cols) {
      out[col.field] = formatCellValue(row[col.field], col);
    }
    sheet.addRow(out);
  }
}

function addResultSheets(
  workbook: ExcelJS.Workbook,
  result: ExecuteReportResult,
  prefix = "",
) {
  const layout = result.layout;
  const datasets = result.datasets;
  const embeds = result.embeds;

  if (layout?.length && datasets) {
    for (const section of layout) {
      if (section.type === "dataset") {
        const ds = datasets[section.datasetId];
        if (!ds) continue;
        addSheet(
          workbook,
          `${prefix}${section.title || ds.nameFa || ds.id}`,
          ds.columns,
          ds.rows,
        );
      } else if (section.type === "embed") {
        const emb = embeds?.[section.embedId];
        if (!emb) continue;
        addResultSheets(
          workbook,
          emb.result,
          `${prefix}${section.title || emb.nameFa}_`,
        );
      }
      // chart sections: skip in Excel (data already on dataset sheets)
    }
    return;
  }

  if (datasets && Object.keys(datasets).length > 1) {
    for (const ds of Object.values(datasets) as DatasetResult[]) {
      addSheet(workbook, `${prefix}${ds.nameFa || ds.id}`, ds.columns, ds.rows);
    }
    return;
  }

  addSheet(
    workbook,
    `${prefix}${result.reportName}`,
    result.columns,
    result.rows,
  );
}

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

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Insight Portal";
    workbook.created = new Date();

    addResultSheets(workbook, result);

    await writeAuditLog({
      userId: session.user.id,
      action: "report.export",
      reportSlug: id,
      parameters: parsed.data.parameters,
      durationMs: Date.now() - started,
      success: true,
    });

    const buffer = await workbook.xlsx.writeBuffer();

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
