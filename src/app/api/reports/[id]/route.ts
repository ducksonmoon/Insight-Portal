import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth/auth";
import { canViewReport } from "@/lib/auth/access";
import { getReportDefinition } from "@/lib/reports/registry";
import { executeReport } from "@/lib/reports/engine";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await canViewReport(session.user, id);
  if (!allowed) {
    return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
  }

  const report = await getReportDefinition(id);

  if (!report) {
    return NextResponse.json({ error: "گزارش یافت نشد" }, { status: 404 });
  }

  return NextResponse.json({
    id: report.id,
    nameFa: report.nameFa,
    moduleId: report.moduleId,
    dataSourceId: report.dataSourceId,
    schemaVersion: report.schemaVersion,
    parameters: report.parameters,
    columns: report.columns,
    charts: report.charts ?? [],
    grouping: report.grouping,
    validation: report.validation,
    datasets: report.datasets,
    embeds: report.embeds ?? [],
    layout: report.layout,
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await canViewReport(session.user, id);
  if (!allowed) {
    return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      parameters?: Record<string, unknown>;
      params?: Record<string, unknown>;
      page?: number;
      pageSize?: number;
    };
    const result = await executeReport(id, {
      parameters: body.parameters ?? body.params ?? {},
      page: body.page,
      pageSize: body.pageSize,
      userId: session.user.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "خطا در اجرای گزارش";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
