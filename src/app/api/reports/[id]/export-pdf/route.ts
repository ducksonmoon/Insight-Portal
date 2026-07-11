import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import { canExportReport } from "@/lib/auth/access";
import { executeReport } from "@/lib/reports/engine";
import { getDataSourceProvider } from "@/lib/reports/datasources";
import { formatCellValue } from "@/lib/reports/format";
import { getReportDefinition, writeAuditLog } from "@/lib/reports/registry";
import { checkRateLimit } from "@/lib/rate-limit";
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

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = checkRateLimit(`export-pdf:${session.user.id}`, 10, 60_000);
  if (!rate.ok) {
    return NextResponse.json(
      { error: `محدودیت خروجی — ${rate.retryAfterSec} ثانیه صبر کنید` },
      { status: 429 },
    );
  }

  const allowed = await canExportReport(session.user, id);
  if (!allowed) {
    return NextResponse.json({ error: "دسترسی خروجی ندارید" }, { status: 403 });
  }

  const report = await getReportDefinition(id);
  if (!report) {
    return NextResponse.json({ error: "گزارش یافت نشد" }, { status: 404 });
  }

  const provider = getDataSourceProvider(report.dataSourceId || "rahkaran");
  if (!provider.isConfigured()) {
    return NextResponse.json({ error: "دیتابیس پیکربندی نشده" }, { status: 503 });
  }

  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "پارامتر نامعتبر" }, { status: 400 });
  }

  const started = Date.now();
  const result = await executeReport(id, {
    parameters: parsed.data.parameters,
    userId: session.user.id,
  });

  const cols = resolveColumns(result.columns ?? [], result.rows ?? []);
  const rows = result.rows ?? [];

  const tableHead = cols
    .map((c) => `<th>${escapeHtml(c.header)}</th>`)
    .join("");
  const tableBody = rows
    .map(
      (row) =>
        `<tr>${cols
          .map(
            (c) =>
              `<td>${escapeHtml(formatCellValue(row[c.field], c))}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(report.nameFa)}</title>
  <style>
    body { font-family: Tahoma, sans-serif; margin: 24px; color: #111; }
    h1 { font-size: 18px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: right; }
    th { background: #f0f4f8; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(report.nameFa)}</h1>
  <table>
    <thead><tr>${tableHead}</tr></thead>
    <tbody>${tableBody}</tbody>
  </table>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

  await writeAuditLog({
    userId: session.user.id,
    action: "export_pdf",
    reportSlug: report.id,
    parameters: parsed.data.parameters,
    durationMs: Date.now() - started,
    success: true,
  });

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report.id}-print.html"`,
    },
  });
}
