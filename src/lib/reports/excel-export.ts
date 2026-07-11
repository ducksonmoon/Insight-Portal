import ExcelJS from "exceljs";

import { formatCellValue } from "@/lib/reports/format";
import type { DatasetResult, ExecuteReportResult } from "@/types/report-result";
import type { ReportColumn } from "@/types/report";

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

export async function buildReportExcelBuffer(
  result: ExecuteReportResult,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Insight Portal";
  workbook.created = new Date();
  addResultSheets(workbook, result);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
