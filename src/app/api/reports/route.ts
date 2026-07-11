import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/auth";
import { filterViewableReportIds } from "@/lib/auth/access";
import { listReportDefinitions } from "@/lib/reports/registry";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reports = await listReportDefinitions();
  const allowedIds = await filterViewableReportIds(
    session.user,
    reports.map((r) => r.id),
  );
  const allowed = new Set(allowedIds);

  return NextResponse.json({
    reports: reports
      .filter((r) => allowed.has(r.id))
      .map((r) => ({
        id: r.id,
        nameFa: r.nameFa,
        moduleId: r.moduleId,
        dataSourceId: r.dataSourceId,
        parameterCount: r.parameters.length,
        columnCount: r.columns.length,
      })),
  });
}
