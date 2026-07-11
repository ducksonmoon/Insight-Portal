import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import { canViewReport } from "@/lib/auth/access";
import { executeReport } from "@/lib/reports/engine";
import { getDataSourceProvider } from "@/lib/reports/datasources";
import { getReportDefinition } from "@/lib/reports/registry";

const bodySchema = z.object({
  reportSlug: z.string().min(1),
  chartIndex: z.number().int().min(0).default(0),
  parameters: z.record(z.string(), z.unknown()).optional().default({}),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "غیرمجاز" }, { status: 401 });
  }

  const json = await request.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { reportSlug, chartIndex, parameters } = parsed.data;
  const allowed = await canViewReport(session.user, reportSlug);
  if (!allowed) {
    return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
  }

  const report = await getReportDefinition(reportSlug);
  if (!report) {
    return NextResponse.json({ error: "گزارش یافت نشد" }, { status: 404 });
  }

  const provider = getDataSourceProvider(report.dataSourceId || "rahkaran");
  if (!provider.isConfigured()) {
    return NextResponse.json({ error: "دیتابیس پیکربندی نشده" }, { status: 503 });
  }

  const result = await executeReport(reportSlug, {
    parameters,
    userId: session.user.id,
  });

  const charts = result.charts ?? [];
  const primaryDataset = result.datasets
    ? Object.values(result.datasets)[0]
    : undefined;
  const datasetCharts = primaryDataset?.charts ?? [];
  const allCharts = charts.length ? charts : datasetCharts;
  const chart = allCharts[chartIndex];

  if (!chart) {
    return NextResponse.json({ error: "نمودار یافت نشد" }, { status: 404 });
  }

  const rows =
    result.rows ??
    primaryDataset?.rows ??
    [];

  return NextResponse.json({
    ok: true,
    chart,
    rows: rows.slice(0, 200),
    totalCount: result.totalCount ?? rows.length,
    reportNameFa: report.nameFa,
  });
}
