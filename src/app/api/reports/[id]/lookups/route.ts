import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth/auth";
import { canViewReport } from "@/lib/auth/access";
import {
  getReportDefinition,
  resolveLookupSql,
} from "@/lib/reports/registry";
import { executeLookupSql } from "@/lib/reports/engine";
import { getDataSourceProvider } from "@/lib/reports/datasources";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
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

    const provider = getDataSourceProvider(report.dataSourceId || "rahkaran");
    if (!provider.isConfigured()) {
      return NextResponse.json(
        { error: "دیتابیس پیکربندی نشده است." },
        { status: 503 },
      );
    }

    const lookups: Record<string, Array<{ value: string; label: string }>> = {};

    for (const param of report.parameters) {
      if (param.type === "lookup") {
        const lookupSql = await resolveLookupSql(param);
        if (!lookupSql) continue;
        const rows = await executeLookupSql(
          lookupSql,
          report.dataSourceId || "rahkaran",
        );
        lookups[param.name] = rows.map((row) => ({
          value: String(row.Code ?? ""),
          label: String(row.Label ?? row.Code ?? ""),
        }));
      }
    }

    return NextResponse.json({ lookups });
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطای ناشناخته";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
